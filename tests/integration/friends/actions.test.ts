import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 친구 Server Action 통합 테스트 (시나리오 10~13).
 *
 * Lead 결정 (003 §J / friends-crud 진입):
 *   - 통합 DB 백엔드는 **pglite** (in-memory Postgres). Supabase CLI 의존 X.
 *   - 마이그레이션은 `db/migrations/*.sql` 을 순서대로 실행.
 *   - RLS 정책(0002_rls.sql) 은 pglite 에서도 정상 동작 (Postgres 호환).
 *   - Supabase auth.users 테이블이 없으므로 users 본인 행을 직접 insert 해 user_id 를 흉내낸다.
 *
 * worker 가 제공할 헬퍼 (`tests/integration/db-test-helpers.ts`):
 *   - `createTestDb()` → `{ db, pg, cleanup }` — 메모리 인스턴스 + drizzle 클라이언트
 *   - 마이그레이션 자동 실행
 *   - `truncate(tables)` 또는 자동 truncate by test
 *   - `setAuthContext(db, userId)` — RLS 컨텍스트 (`SET LOCAL request.jwt.claims = ...`)
 *     또는 service-role 로 우회 후 user_id 검증을 application-layer에서 확인하는
 *     테스트 패턴. 채택안은 worker 결정 — Lead 가 003 §J 후속 결정 로그로 기록.
 *
 * 시나리오:
 *   10. createFriend — friends row insert + user_id 자동 주입
 *   11. listFriends — 본인 user_id 친구만, is_deleted=false 필터
 *   12. deleteFriend — is_deleted=true 로 변경 (hard delete 아님)
 *   13. updateFriend — RLS 로 다른 user 친구는 수정 불가 (0 rows affected)
 *
 * 인증 mock:
 *   - Server Action 은 `getCurrentUser()` (lib/auth/user.ts) 로 본인 식별.
 *   - 여기서는 그 함수를 mock 하여 테스트마다 user_id 를 결정한다.
 */

import {
  createTestDb,
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
  // 모듈 평가 시점엔 testDb 가 아직 없을 수 있으므로 lazy getter.
  get db() {
    if (!testDb) {
      throw new Error("testDb is not initialized — beforeAll 이 먼저 돌아야 한다");
    }
    return testDb.db;
  },
}));

const USER_A = "00000000-0000-0000-0000-0000000000aa";
const USER_B = "00000000-0000-0000-0000-0000000000bb";

function actAs(userId: string) {
  currentUserId = userId;
  setAuthContext(testDb, userId);
}

beforeAll(async () => {
  testDb = await createTestDb();
  // 두 유저 시드.
  await testDb.pg.query(
    `INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)`,
    [USER_A, "a@boon.test", USER_B, "b@boon.test"],
  );
});

afterEach(async () => {
  await testDb.pg.query("DELETE FROM friends");
  currentUserId = null;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("friends Server Action 통합", () => {
  it("[시나리오 10] createFriend 가 user_id 를 자동 주입하고 row 가 들어간다", async () => {
    actAs(USER_A);
    const { createFriend } = await import("@/app/(authenticated)/friends/actions");

    const fd = new FormData();
    fd.set("name", "테스트친구A");
    fd.set("birthday_month", "3");
    fd.set("birthday_day", "5");
    fd.set("note", "메모");

    await createFriend(fd);

    const { rows } = await testDb.pg.query<{
      user_id: string;
      name: string;
      birthday_month: number | null;
      birthday_day: number | null;
      is_deleted: boolean;
    }>(`SELECT user_id, name, birthday_month, birthday_day, is_deleted FROM friends`);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(USER_A);
    expect(rows[0]?.name).toBe("테스트친구A");
    expect(rows[0]?.birthday_month).toBe(3);
    expect(rows[0]?.birthday_day).toBe(5);
    expect(rows[0]?.is_deleted).toBe(false);
  });

  it("[시나리오 11] listFriends 는 본인 user_id + is_deleted=false 만 반환한다", async () => {
    // 시드: A 의 친구 2명 (그중 1명 soft-deleted), B 의 친구 1명.
    await testDb.pg.query(
      `INSERT INTO friends (user_id, name, is_deleted) VALUES
        ($1, 'A 친구 활성', false),
        ($1, 'A 친구 삭제됨', true),
        ($2, 'B 친구 활성', false)`,
      [USER_A, USER_B],
    );

    actAs(USER_A);
    const { listFriends } = await import("@/lib/friends/queries");
    const list = await listFriends();

    const names = list.map((f) => f.name).sort();
    expect(names).toEqual(["A 친구 활성"]);
  });

  it("[시나리오 12] deleteFriend 는 hard delete 가 아니라 is_deleted=true 로 바꾼다", async () => {
    const { rows: inserted } = await testDb.pg.query<{ id: string }>(
      `INSERT INTO friends (user_id, name) VALUES ($1, '삭제 대상') RETURNING id`,
      [USER_A],
    );
    const friendId = inserted[0]!.id;

    actAs(USER_A);
    const { deleteFriend } = await import("@/app/(authenticated)/friends/actions");
    await deleteFriend(friendId);

    // row 는 그대로 남고, is_deleted 만 true.
    const { rows } = await testDb.pg.query<{ is_deleted: boolean }>(
      `SELECT is_deleted FROM friends WHERE id = $1`,
      [friendId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_deleted).toBe(true);
  });

  it("[시나리오 13] updateFriend 는 다른 user 의 friend 를 수정할 수 없다 (application-layer + RLS 이중 방어 — RLS 단독 회귀는 시나리오 18)", async () => {
    // USER_B 가 만든 친구 row.
    const { rows: inserted } = await testDb.pg.query<{ id: string }>(
      `INSERT INTO friends (user_id, name) VALUES ($1, 'B 친구') RETURNING id`,
      [USER_B],
    );
    const friendId = inserted[0]!.id;

    // USER_A 가 USER_B 의 친구 수정 시도.
    actAs(USER_A);
    const { updateFriend } = await import("@/app/(authenticated)/friends/actions");

    const fd = new FormData();
    fd.set("id", friendId);
    fd.set("name", "탈취 시도");

    // RLS 로 0 rows affected. 구현이 throw 하든 silent 하든
    // 핵심은 "row 가 안 바뀐다" — DB 상태로 검증한다.
    await updateFriend(fd).catch(() => {
      /* RLS 실패는 throw 가능 — DB 상태가 본질 */
    });

    const { rows } = await testDb.pg.query<{ name: string }>(
      `SELECT name FROM friends WHERE id = $1`,
      [friendId],
    );
    expect(rows[0]?.name).toBe("B 친구");
  });
});
