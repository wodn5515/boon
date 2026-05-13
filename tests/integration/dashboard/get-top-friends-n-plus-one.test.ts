import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * `getTopFriends` N+1 → 단일 쿼리 회귀 잠금 (011 §C-3).
 *
 * 회귀 시드 (PR #6 review §):
 *   - 현재 `lib/dashboard/queries.ts::getTopFriends` 는 친구 + count 집계 쿼리 1회 후,
 *     각 친구의 최근 메모 1줄을 fetch 하기 위해 `Promise.all(friendRows.map(async (f) => db.select...))`
 *     로 N개의 추가 쿼리를 발생시킨다. top 5 친구면 총 6 쿼리.
 *   - PR #8 의 `matchFriendsByName` 패턴(LEFT JOIN LATERAL 결합)을 재활용하면 단일 쿼리로 가능.
 *
 * 본 spec 은 drizzle 의 raw client(`db.$client`) `.query` 호출 횟수를 직접 카운트해 잠근다.
 *
 * worker 청산 후 기대:
 *   - getTopFriends 가 LEFT JOIN LATERAL (또는 동등한 window function) 로 친구·count·recent_memo
 *     를 한 번에 가져온다 → top N 친구 시나리오에서 `.query` 호출이 **정확히 1회** (혹은 0회 — 빈 결과
 *     케이스 처리).
 *
 * 빨강 시드:
 *   - 현재 코드는 top 5 친구 노출 시 6회 호출 → `≤ 1` assert 실패.
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
  await testDb.pg.query(
    `INSERT INTO users (id, email) VALUES ($1, $2)`,
    [USER_A, "a@boon.test"],
  );
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

describe("[C-3] getTopFriends — N+1 제거 (LEFT JOIN LATERAL 단일 쿼리)", () => {
  it("top 5 친구 노출 시 db.$client.query 호출이 1회 (현재는 6회 — 회귀 잠금)", async () => {
    let cat = "";
    let friendIds: string[] = [];
    await asServiceRole(testDb, async () => {
      const c = await testDb.pg.query<{ id: string }>(
        `INSERT INTO categories (user_id, name, color, is_system, sort_order)
         VALUES ($1, '마음', '#4ade80', true, 3) RETURNING id`,
        [USER_A],
      );
      cat = c.rows[0]!.id;

      // 친구 5명 + 각 1건씩 entries.
      const rows = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES
           ($1, '가나'),
           ($1, '나라'),
           ($1, '다람'),
           ($1, '라마'),
           ($1, '마바')
         RETURNING id`,
        [USER_A],
      );
      friendIds = rows.rows.map((r) => r.id);

      for (let i = 0; i < friendIds.length; i += 1) {
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES ($1, $2, $3, $4, $5, 'anytime', false)`,
          [USER_A, friendIds[i], cat, `memo-${i}`, "2026-05-10"],
        );
      }
    });

    await actAs(USER_A);

    // raw pg client (drizzle 의 $client) 의 query 메서드를 spy.
    // drizzle 이 발행하는 모든 SQL 은 이 메서드를 거친다.
    const rawClient = (
      testDb.db as unknown as { $client: { query: (...args: unknown[]) => unknown } }
    ).$client;
    const querySpy = vi.spyOn(rawClient, "query");

    const { getTopFriends } = await import("@/lib/dashboard/queries");
    const result = await getTopFriends(5);

    expect(result.length).toBe(5);
    // recent_memo 가 비어있지 않아야 한다 (결합 회귀 — JOIN LATERAL 이 메모를 빠뜨리지 않음 잠금).
    for (const r of result) {
      expect(r.recent_memo).not.toBeNull();
    }

    // 핵심 잠금: drizzle 쿼리 호출 횟수 = 1회.
    expect(querySpy).toHaveBeenCalledTimes(1);

    querySpy.mockRestore();
  });

  it("친구가 0명일 때 db.$client.query 호출이 1회 이하 (빈 결과 가드)", async () => {
    await actAs(USER_A);

    const rawClient = (
      testDb.db as unknown as { $client: { query: (...args: unknown[]) => unknown } }
    ).$client;
    const querySpy = vi.spyOn(rawClient, "query");

    const { getTopFriends } = await import("@/lib/dashboard/queries");
    const result = await getTopFriends(5);

    expect(result).toEqual([]);
    // 빈 결과여도 추가 메모 fetch 가 없어야 한다.
    expect(querySpy.mock.calls.length).toBeLessThanOrEqual(1);

    querySpy.mockRestore();
  });
});
