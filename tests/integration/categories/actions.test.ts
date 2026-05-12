import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 카테고리 Server Action 통합 테스트 (시나리오 11~17).
 *
 * Lead 명세 (005 — categories-crud 진입):
 *   - 통합 DB 백엔드 = pglite (in-memory Postgres). Supabase CLI 의존 없음.
 *   - 마이그레이션 자동 실행 (`db-test-helpers.createTestDb`).
 *   - RLS 정책(0002_rls.sql + 0005_categories_rls.sql) 은 pglite 에서 정상 동작.
 *   - users 행을 직접 시드 (auth.users 는 polyfill 만, 본인 users 행으로 user_id 흉내).
 *
 * 사용 헬퍼:
 *   - `createTestDb()` — drizzle 인스턴스 + raw pg + cleanup
 *   - `setAuthContext(testDb, userId)` (async) — `SET ROLE authenticated` + GUC `sub` 주입
 *   - `resetAuthContext(testDb)` (async) — 다음 테스트 사이에서 GUC/Role 누수 방지
 *   - `asServiceRole(testDb, fn)` — RLS 우회 시드/cleanup 용 (worker 가 구현)
 *
 * 시나리오:
 *   11. 기본 카테고리 3개 자동 시드 — `seedDefaultCategories(userId)`
 *       (callback handler 가 새 user 의 첫 로그인 시 호출)
 *   12. createCategory — user_id 서버 주입, is_system=false 강제, sort_order = MAX+1
 *   13. createCategory 상한 — 사용자 카테고리 20개 초과 시 throw
 *   14. updateCategory — RLS + app-layer 이중 방어. 다른 user 카테고리 update 시도 → 0 row.
 *   15. updateCategory 시스템 카테고리 → name 만 변경, icon/color 변경 무시
 *   16. deleteCategory — is_system=true 면 throw, DB row 그대로
 *   17. listCategories — 본인 카테고리만, sortCategories 순서 (is_system 먼저, sort_order asc)
 */

import {
  asServiceRole,
  createTestDb,
  resetAuthContext,
  setAuthContext,
  type TestDb,
} from "../db-test-helpers";

// getCurrentUser mock — 각 테스트가 actAs(userId) 로 바꾼다.
let currentUserId: string | null = null;
vi.mock("@/lib/auth/user", () => ({
  getCurrentUser: vi.fn(async () =>
    currentUserId ? { id: currentUserId, email: "tester@boon.test" } : null,
  ),
}));

// db/client 의 db 를 테스트 인스턴스로 갈아끼운다.
let testDb: TestDb;
vi.mock("@/db/client", () => ({
  get db() {
    if (!testDb) {
      throw new Error("testDb is not initialized — beforeAll 이 먼저 돌아야 한다");
    }
    return testDb.db;
  },
}));

const USER_A = "00000000-0000-0000-0000-0000000000aa";
const USER_B = "00000000-0000-0000-0000-0000000000bb";

async function actAs(userId: string) {
  currentUserId = userId;
  await setAuthContext(testDb, userId);
}

beforeAll(async () => {
  testDb = await createTestDb();
  // 두 유저 시드 (RLS 우회 — service role).
  await testDb.pg.query(
    `INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)`,
    [USER_A, "a@boon.test", USER_B, "b@boon.test"],
  );
});

afterEach(async () => {
  // categories cleanup. 일부 시나리오는 다른 user 의 row 도 만들기에 전부 비운다.
  await testDb.pg.query("DELETE FROM categories");
  currentUserId = null;
  // 다음 테스트로 GUC/Role 누수 방지.
  await resetAuthContext(testDb);
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("categories Server Action / 시드 / 쿼리 통합", () => {
  it("[시나리오 11] seedDefaultCategories 가 기본 3개(💰 물질 / ⏰ 시간·행동 / 💝 마음) 를 정확히 insert 한다", async () => {
    // callback handler 에서 호출되는 함수. worker 가 `@/lib/categories/seed` 로 export.
    const { seedDefaultCategories } = await import("@/lib/categories/seed");

    // user 의 첫 callback 시점 — RLS 우회(callback handler 가 service role 로 동작).
    await asServiceRole(testDb, async () => {
      await seedDefaultCategories(USER_A);
    });

    const { rows } = await testDb.pg.query<{
      name: string;
      icon: string | null;
      color: string;
      is_system: boolean;
      sort_order: number;
    }>(
      `SELECT name, icon, color, is_system, sort_order FROM categories
       WHERE user_id = $1 ORDER BY sort_order ASC`,
      [USER_A],
    );

    expect(rows).toHaveLength(3);

    // PRD §4 + lib/categories/types.ts MOCK 정의 그대로 (이름·아이콘·색상).
    expect(rows[0]).toMatchObject({
      name: "물질",
      icon: "💰",
      color: "#22c55e",
      is_system: true,
    });
    expect(rows[1]).toMatchObject({
      name: "시간·행동",
      icon: "⏰",
      color: "#84cc16",
      is_system: true,
    });
    expect(rows[2]).toMatchObject({
      name: "마음",
      icon: "💝",
      color: "#4ade80",
      is_system: true,
    });
  });

  it("[시나리오 12] createCategory 가 user_id 자동 주입 + is_system=false 강제 + sort_order=MAX+1", async () => {
    // 시드: USER_A 의 기존 사용자 카테고리 한 개 (sort_order=5).
    await testDb.pg.query(
      `INSERT INTO categories (user_id, name, color, is_system, sort_order)
       VALUES ($1, '기존', '#22c55e', false, 5)`,
      [USER_A],
    );

    await actAs(USER_A);
    const { createCategory } = await import(
      "@/app/(authenticated)/settings/actions"
    );

    const fd = new FormData();
    fd.set("name", "선물");
    fd.set("icon", "🎁");
    fd.set("color", "#f472b6");
    // 클라이언트가 위조한 is_system=true 가 들어와도 무시되어야 한다.
    fd.set("is_system", "true");

    await createCategory(fd);

    const { rows } = await testDb.pg.query<{
      user_id: string;
      name: string;
      icon: string | null;
      color: string;
      is_system: boolean;
      sort_order: number;
    }>(
      `SELECT user_id, name, icon, color, is_system, sort_order
       FROM categories WHERE user_id = $1 AND name = '선물'`,
      [USER_A],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(USER_A);
    expect(rows[0]?.name).toBe("선물");
    expect(rows[0]?.icon).toBe("🎁");
    expect(rows[0]?.color).toBe("#f472b6");
    // 위조 무시 검증.
    expect(rows[0]?.is_system).toBe(false);
    // MAX(sort_order=5) + 1 = 6.
    expect(rows[0]?.sort_order).toBe(6);
  });

  it("[시나리오 13] createCategory 가 사용자 카테고리 20개 상한을 강제한다", async () => {
    // 시드: USER_A 사용자 카테고리 20개 (시스템 카테고리는 별개 카운트).
    const values = Array.from({ length: 20 }, (_, i) => `($1, '카${i}', '#22c55e', false, ${i + 10})`).join(", ");
    await testDb.pg.query(
      `INSERT INTO categories (user_id, name, color, is_system, sort_order) VALUES ${values}`,
      [USER_A],
    );

    await actAs(USER_A);
    const { createCategory } = await import(
      "@/app/(authenticated)/settings/actions"
    );

    const fd = new FormData();
    fd.set("name", "21번째");
    fd.set("color", "#22c55e");

    // 상한 초과 — throw 를 기대한다.
    // (구현이 redirect 로 처리하더라도 카테고리 row 가 추가되지 않는 게 본질.)
    await expect(createCategory(fd)).rejects.toThrow();

    const { rows } = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM categories
       WHERE user_id = $1 AND is_system = false`,
      [USER_A],
    );
    expect(rows[0]?.c).toBe("20");
  });

  it("[시나리오 14] updateCategory 는 다른 user 의 카테고리를 수정할 수 없다 (RLS + app-layer 이중 방어)", async () => {
    // USER_B 의 사용자 카테고리.
    const { rows: inserted } = await testDb.pg.query<{ id: string }>(
      `INSERT INTO categories (user_id, name, color, is_system, sort_order)
       VALUES ($1, 'B카테고리', '#22c55e', false, 10) RETURNING id`,
      [USER_B],
    );
    const targetId = inserted[0]!.id;

    // USER_A 가 USER_B 의 카테고리 수정 시도.
    await actAs(USER_A);
    const { updateCategory } = await import(
      "@/app/(authenticated)/settings/actions"
    );

    const fd = new FormData();
    fd.set("id", targetId);
    fd.set("name", "탈취 시도");
    fd.set("color", "#f472b6");

    await updateCategory(fd).catch(() => {
      /* RLS / app-layer guard 는 throw 가능 — DB 상태가 본질 */
    });

    const { rows } = await testDb.pg.query<{ name: string; color: string }>(
      `SELECT name, color FROM categories WHERE id = $1`,
      [targetId],
    );
    expect(rows[0]?.name).toBe("B카테고리");
    expect(rows[0]?.color).toBe("#22c55e");
  });

  it("[시나리오 15] updateCategory 가 시스템 카테고리에는 name 만 적용하고 icon/color 는 무시", async () => {
    // 시드: USER_A 의 시스템 카테고리 한 개.
    const { rows: inserted } = await testDb.pg.query<{ id: string }>(
      `INSERT INTO categories (user_id, name, icon, color, is_system, sort_order)
       VALUES ($1, '물질', '💰', '#22c55e', true, 0) RETURNING id`,
      [USER_A],
    );
    const targetId = inserted[0]!.id;

    await actAs(USER_A);
    const { updateCategory } = await import(
      "@/app/(authenticated)/settings/actions"
    );

    const fd = new FormData();
    fd.set("id", targetId);
    fd.set("name", "재화");
    // 클라이언트가 disabled input 을 우회해 보내도 서버는 무시해야 한다.
    fd.set("icon", "💎");
    fd.set("color", "#000000");

    await updateCategory(fd);

    const { rows } = await testDb.pg.query<{
      name: string;
      icon: string | null;
      color: string;
      is_system: boolean;
    }>(
      `SELECT name, icon, color, is_system FROM categories WHERE id = $1`,
      [targetId],
    );
    expect(rows[0]?.name).toBe("재화");
    // 아이콘·색상은 원본 그대로.
    expect(rows[0]?.icon).toBe("💰");
    expect(rows[0]?.color).toBe("#22c55e");
    expect(rows[0]?.is_system).toBe(true);
  });

  it("[시나리오 16] deleteCategory 가 is_system=true 카테고리 삭제 시도를 거부한다", async () => {
    // 시드: USER_A 의 시스템 카테고리.
    const { rows: inserted } = await testDb.pg.query<{ id: string }>(
      `INSERT INTO categories (user_id, name, icon, color, is_system, sort_order)
       VALUES ($1, '물질', '💰', '#22c55e', true, 0) RETURNING id`,
      [USER_A],
    );
    const targetId = inserted[0]!.id;

    await actAs(USER_A);
    const { deleteCategory } = await import(
      "@/app/(authenticated)/settings/actions"
    );

    await expect(
      deleteCategory({ id: targetId, migrateTo: null }),
    ).rejects.toThrow();

    // row 는 그대로 살아있어야 한다.
    const { rows } = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM categories WHERE id = $1`,
      [targetId],
    );
    expect(rows[0]?.c).toBe("1");
  });

  it("[시나리오 17] listCategories 는 본인 user_id 카테고리만, sortCategories 순서로 돌려준다", async () => {
    // USER_A: 시스템 1 + 사용자 2 (sort_order 11, 5)
    await testDb.pg.query(
      `INSERT INTO categories (user_id, name, icon, color, is_system, sort_order) VALUES
        ($1, '물질', '💰', '#22c55e', true,  0),
        ($1, '늦게',  null, '#22c55e', false, 11),
        ($1, '먼저',  null, '#22c55e', false, 5)`,
      [USER_A],
    );
    // USER_B: 본인 사용자 카테고리 — 노출되면 안 됨.
    await testDb.pg.query(
      `INSERT INTO categories (user_id, name, icon, color, is_system, sort_order)
       VALUES ($1, 'B만의것', null, '#22c55e', false, 1)`,
      [USER_B],
    );

    await actAs(USER_A);
    const { listCategories } = await import("@/lib/categories/queries");
    const list: Array<{ name: string; is_system: boolean; sort_order: number }> =
      await listCategories();

    const names = list.map((c) => c.name);
    // 시스템 먼저(물질), 그 후 사용자 sort_order 오름차순(먼저, 늦게).
    expect(names).toEqual(["물질", "먼저", "늦게"]);
    // USER_B 의 카테고리는 절대 섞이면 안 된다.
    expect(names).not.toContain("B만의것");
  });
});
