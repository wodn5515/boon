import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * entries × categories / entries × friends 결합 통합 (시나리오 16·17).
 *
 * 배경 (PRD §F + 005 §F):
 *   - 카테고리 삭제 시 entries 가 묶여 있으면 강제 이전(migrateTo) 후 카테고리 hard delete.
 *     (005 슬라이스에서는 entries 테이블이 없어 placeholder 였다. 본 슬라이스에서 결합.)
 *   - 친구 soft delete (is_deleted=true) 후에도 entries DB row 는 그대로 살아 있지만,
 *     listEntriesByFriend / listFriends 가 모두 그 친구를 "보이지 않게" 처리한다.
 *
 * 시나리오 매핑:
 *   16. deleteCategory({id, migrateTo}) — 본 카테고리에 묶인 entries 가 migrateTo 로 일괄
 *       update 된 뒤 카테고리 hard delete. (트랜잭션 보장 — 부분 적용 금지.)
 *   17. 친구 soft delete + entries — friends.is_deleted=true 면 listFriends 에서 친구가 빠지고
 *       listEntriesByFriend 도 빈 배열. entries DB row 자체는 그대로.
 *   18. countEntriesByCategory — soft-deleted 친구의 entries 도 카테고리 count 에 포함된다
 *       (PR #5 리뷰 💬 #5 결정 (b) 채택). 카테고리 강제 이전 게이트(시나리오 16)가
 *       모든 entries 를 옮긴다는 일관성과 맞물려, count 도 같은 분모를 본다.
 */

import {
  asServiceRole,
  createTestDb,
  resetAuthContext,
  setAuthContext,
  type TestDb,
} from "../db-test-helpers";

let currentUserId: string | null = null;
vi.mock("@/lib/auth/user", () => ({
  getCurrentUser: vi.fn(async () =>
    currentUserId ? { id: currentUserId, email: "tester@boon.test" } : null,
  ),
}));

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

async function actAs(userId: string) {
  currentUserId = userId;
  await setAuthContext(testDb, userId);
}

beforeAll(async () => {
  testDb = await createTestDb();
  await testDb.pg.query(`INSERT INTO users (id, email) VALUES ($1, $2)`, [
    USER_A,
    "a@boon.test",
  ]);
});

afterEach(async () => {
  await testDb.pg.query("DELETE FROM entries");
  await testDb.pg.query("DELETE FROM categories");
  await testDb.pg.query("DELETE FROM friends");
  currentUserId = null;
  await resetAuthContext(testDb);
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("entries × categories / friends 결합", () => {
  it("[시나리오 16] deleteCategory({id, migrateTo}) — entries 가 migrateTo 로 일괄 update 된 후 카테고리 hard delete", async () => {
    // 시드: 사용자 카테고리 "버릴거" (4) + "남길거" (5). 친구 1명. entries 3건이 "버릴거" 에 묶임.
    let toDelete = "";
    let migrateTo = "";
    let friendId = "";
    await asServiceRole(testDb, async () => {
      const c1 = await testDb.pg.query<{ id: string }>(
        `INSERT INTO categories (user_id, name, color, is_system, sort_order)
         VALUES ($1, '버릴거', '#22c55e', false, 4) RETURNING id`,
        [USER_A],
      );
      toDelete = c1.rows[0]!.id;
      const c2 = await testDb.pg.query<{ id: string }>(
        `INSERT INTO categories (user_id, name, color, is_system, sort_order)
         VALUES ($1, '남길거', '#84cc16', false, 5) RETURNING id`,
        [USER_A],
      );
      migrateTo = c2.rows[0]!.id;
      const f = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES ($1, '친구A') RETURNING id`,
        [USER_A],
      );
      friendId = f.rows[0]!.id;
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES
           ($1, $2, $3, 'e1', '2026-05-10', 'anytime', false),
           ($1, $2, $3, 'e2', '2026-05-11', 'anytime', false),
           ($1, $2, $3, 'e3', '2026-05-12', 'anytime', false)`,
        [USER_A, friendId, toDelete],
      );
    });

    await actAs(USER_A);
    const { deleteCategory } = await import(
      "@/app/(authenticated)/settings/actions"
    );

    // migrateTo 를 명시한 삭제 — entries 가 모두 migrateTo 로 옮겨진 뒤 카테고리 hard delete.
    await deleteCategory({ id: toDelete, migrateTo });

    // (a) "버릴거" 카테고리는 사라졌다.
    const catCount = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM categories WHERE id = $1`,
      [toDelete],
    );
    expect(catCount.rows[0]?.c).toBe("0");

    // (b) entries 3건이 모두 migrateTo 로 옮겨졌다 (FK 위반 없음, 데이터 손실 없음).
    const migrated = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM entries WHERE category_id = $1`,
      [migrateTo],
    );
    expect(migrated.rows[0]?.c).toBe("3");

    // (c) 어떤 entry 도 사라진 카테고리 id 를 그대로 들고 있지 않다.
    const orphan = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM entries WHERE category_id = $1`,
      [toDelete],
    );
    expect(orphan.rows[0]?.c).toBe("0");
  });

  it("[시나리오 16-b] deleteCategory 에 묶인 entries 가 있는데 migrateTo=null 이면 거절 (데이터 손실 방지)", async () => {
    let toDelete = "";
    let friendId = "";
    await asServiceRole(testDb, async () => {
      const c = await testDb.pg.query<{ id: string }>(
        `INSERT INTO categories (user_id, name, color, is_system, sort_order)
         VALUES ($1, '점유중', '#22c55e', false, 4) RETURNING id`,
        [USER_A],
      );
      toDelete = c.rows[0]!.id;
      const f = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES ($1, '친구A') RETURNING id`,
        [USER_A],
      );
      friendId = f.rows[0]!.id;
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES ($1, $2, $3, 'e1', '2026-05-10', 'anytime', false)`,
        [USER_A, friendId, toDelete],
      );
    });

    await actAs(USER_A);
    const { deleteCategory } = await import(
      "@/app/(authenticated)/settings/actions"
    );

    // entries 가 묶여 있는데 migrateTo 가 null → throw (사용자가 이전 대상 선택을 강제).
    await expect(
      deleteCategory({ id: toDelete, migrateTo: null }),
    ).rejects.toThrow();

    // 카테고리도 entries 도 그대로 살아 있다.
    const cat = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM categories WHERE id = $1`,
      [toDelete],
    );
    expect(cat.rows[0]?.c).toBe("1");
    const ent = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM entries WHERE category_id = $1`,
      [toDelete],
    );
    expect(ent.rows[0]?.c).toBe("1");
  });

  it("[시나리오 17] 친구 soft delete 후 listFriends 에서 친구가 빠지고, listEntriesByFriend 도 빈 배열 (entries DB row 자체는 보존)", async () => {
    let friendId = "";
    let categoryId = "";
    let entryId = "";
    await asServiceRole(testDb, async () => {
      const f = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES ($1, '곧 삭제될 친구') RETURNING id`,
        [USER_A],
      );
      friendId = f.rows[0]!.id;
      const c = await testDb.pg.query<{ id: string }>(
        `INSERT INTO categories (user_id, name, color, is_system, sort_order)
         VALUES ($1, '물질', '#22c55e', true, 1) RETURNING id`,
        [USER_A],
      );
      categoryId = c.rows[0]!.id;
      const r = await testDb.pg.query<{ id: string }>(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES ($1, $2, $3, '보존되어야 함', '2026-05-10', 'anytime', false)
         RETURNING id`,
        [USER_A, friendId, categoryId],
      );
      entryId = r.rows[0]!.id;
    });

    // 친구 soft delete.
    await actAs(USER_A);
    const { deleteFriend } = await import(
      "@/app/(authenticated)/friends/actions"
    );
    await deleteFriend(friendId);

    // (a) listFriends 결과에서 빠진다.
    const { listFriends } = await import("@/lib/friends/queries");
    const friends = await listFriends();
    expect(friends.map((f) => f.id)).not.toContain(friendId);

    // (b) listEntriesByFriend 는 빈 배열 (PRD §F D-017).
    const { listEntriesByFriend } = await import("@/lib/entries/queries");
    const entries = await listEntriesByFriend(friendId);
    expect(entries).toEqual([]);

    // (c) entries DB row 자체는 그대로 — RLS 우회로 확인. soft delete 의 본질은 "노출 안 함" 이지 "제거" 가 아님.
    let dbRowExists = false;
    await asServiceRole(testDb, async () => {
      const r = await testDb.pg.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM entries WHERE id = $1`,
        [entryId],
      );
      dbRowExists = r.rows[0]?.c === "1";
    });
    expect(dbRowExists).toBe(true);
  });

  it("[시나리오 18] countEntriesByCategory — soft-deleted 친구의 entries 도 카테고리 count 에 포함된다 (PR #5 리뷰 💬 #5 (b) 채택)", async () => {
    // 시드: 카테고리 1개, 친구 2명 (살아있음 + soft deleted), 각자 entry 2건씩.
    let categoryId = "";
    let aliveFriend = "";
    let deletedFriend = "";
    await asServiceRole(testDb, async () => {
      const c = await testDb.pg.query<{ id: string }>(
        `INSERT INTO categories (user_id, name, color, is_system, sort_order)
         VALUES ($1, '마음', '#4ade80', true, 3) RETURNING id`,
        [USER_A],
      );
      categoryId = c.rows[0]!.id;

      const a = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES ($1, '살아있음') RETURNING id`,
        [USER_A],
      );
      aliveFriend = a.rows[0]!.id;
      const d = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name, is_deleted) VALUES ($1, '삭제됨', true) RETURNING id`,
        [USER_A],
      );
      deletedFriend = d.rows[0]!.id;

      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES
           ($1, $2, $3, 'alive-1',   '2026-05-01', 'anytime', false),
           ($1, $2, $3, 'alive-2',   '2026-05-02', 'anytime', false),
           ($1, $4, $3, 'deleted-1', '2026-05-03', 'anytime', false),
           ($1, $4, $3, 'deleted-2', '2026-05-04', 'anytime', false)`,
        [USER_A, aliveFriend, categoryId, deletedFriend],
      );
    });

    await actAs(USER_A);
    const { countEntriesByCategory } = await import(
      "@/lib/entries/category-counts"
    );

    const map = await countEntriesByCategory();
    // 4건 모두 합산 — soft-deleted 친구의 entries 도 포함된다 ((b) 정책).
    expect(map.get(categoryId)).toBe(4);
  });
});
