import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * entries Server Action 통합 테스트 (시나리오 11~15).
 *
 * Lead 명세 (entries-crud 진입):
 *   - pglite + 마이그레이션 0000~0007 모두 적용 (worker 가 0006/0007 추가).
 *   - users 행 직접 시드. RLS 우회는 `asServiceRole` (callback handler 의 service_role 흐름과 정합).
 *   - `getCurrentUser` 는 vi.mock 으로 본인 user 갈아끼움 (friends/categories 패턴 그대로).
 *
 * 시나리오:
 *   11. createEntry — user_id 서버 자동 주입 + friend_id·category_id 본인 소유 cross-check
 *       (정정-1 패턴): 다른 user 의 friend_id 로 생성 시도 → throw 또는 row 미생성.
 *   12. createEntry 인라인 친구 트랜잭션 — pendingNewFriendName 으로 friend+entry 한 트랜잭션 생성.
 *       (실패 케이스 회귀는 시나리오 12-b 로 잠근다.)
 *   13. listEntriesByFriend — user_id + friend_id 격리, 카테고리 JOIN 결과.
 *   14. updateEntry — 본인 entry 만, friend_id/category_id 변경 시 본인 소유 재검증.
 *   15. deleteEntry — hard delete (D-017): row 자체가 사라진다.
 *
 * worker 가 정해야 할 액션 경로:
 *   - Lead 후보 1: `app/(authenticated)/entries/actions.ts`
 *   - Lead 후보 2: `app/(authenticated)/friends/[id]/actions.ts`
 *   본 spec 은 후보 1 (`@/app/(authenticated)/entries/actions`) 을 잠근다. 디렉토리 형식이
 *   친구 종속이 아니라 도메인 단위라 다른 진입점(메인 FAB)에서도 import 자연스러움.
 *   worker 가 후보 2 를 선택할 경우 Lead 가 spec 경로 갱신 결정.
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
const USER_B = "00000000-0000-0000-0000-0000000000bb";

async function actAs(userId: string) {
  currentUserId = userId;
  await setAuthContext(testDb, userId);
}

beforeAll(async () => {
  testDb = await createTestDb();
  await testDb.pg.query(
    `INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)`,
    [USER_A, "a@boon.test", USER_B, "b@boon.test"],
  );
});

afterEach(async () => {
  // entries 가 먼저, 그 다음 categories / friends (FK 의존성).
  await testDb.pg.query("DELETE FROM entries");
  await testDb.pg.query("DELETE FROM categories");
  await testDb.pg.query("DELETE FROM friends");
  currentUserId = null;
  await resetAuthContext(testDb);
});

afterAll(async () => {
  await testDb.cleanup();
});

/**
 * 시나리오마다 반복되는 시드. 친구 한 명, 카테고리 한 개를 본인 user 로 만들어 둔다.
 * RLS 우회로 시드 (callback handler 의 service role 흐름과 정합).
 */
async function seedFriendAndCategory(userId: string): Promise<{
  friendId: string;
  categoryId: string;
}> {
  let friendId = "";
  let categoryId = "";
  await asServiceRole(testDb, async () => {
    const f = await testDb.pg.query<{ id: string }>(
      `INSERT INTO friends (user_id, name) VALUES ($1, '친구A') RETURNING id`,
      [userId],
    );
    friendId = f.rows[0]!.id;
    const c = await testDb.pg.query<{ id: string }>(
      `INSERT INTO categories (user_id, name, color, is_system, sort_order)
       VALUES ($1, '물질', '#22c55e', true, 1) RETURNING id`,
      [userId],
    );
    categoryId = c.rows[0]!.id;
  });
  return { friendId, categoryId };
}

describe("entries Server Action 통합", () => {
  it("[시나리오 11] createEntry 가 user_id 자동 주입 + 본인 소유 friend/category 만 허용 (다른 user 의 friend_id 로는 row 미생성)", async () => {
    // USER_A 의 친구·카테고리.
    const aOwn = await seedFriendAndCategory(USER_A);
    // USER_B 의 친구 — 탈취 대상.
    let bFriendId = "";
    await asServiceRole(testDb, async () => {
      const f = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES ($1, 'B친구') RETURNING id`,
        [USER_B],
      );
      bFriendId = f.rows[0]!.id;
    });

    await actAs(USER_A);
    const { createEntry } = await import(
      "@/app/(authenticated)/entries/actions"
    );

    // (a) 본인 friend + 본인 category → 정상 생성.
    const happyFd = new FormData();
    happyFd.set("friend_id", aOwn.friendId);
    happyFd.set("new_friend_name", "");
    happyFd.set("category_id", aOwn.categoryId);
    happyFd.set("memo", "이사 도와줌");
    happyFd.set("received_date", "2026-05-11");
    happyFd.set("repayment_timing", "anytime");
    happyFd.set("repayment_specific_date", "");
    await createEntry(happyFd);

    const happyRows = await testDb.pg.query<{
      user_id: string;
      friend_id: string;
      category_id: string;
      memo: string;
      received_date: string | Date;
      repayment_timing: string;
      is_repaid: boolean;
    }>(`SELECT user_id, friend_id, category_id, memo, received_date,
        repayment_timing, is_repaid FROM entries`);
    expect(happyRows.rows).toHaveLength(1);
    expect(happyRows.rows[0]?.user_id).toBe(USER_A);
    expect(happyRows.rows[0]?.friend_id).toBe(aOwn.friendId);
    expect(happyRows.rows[0]?.category_id).toBe(aOwn.categoryId);
    expect(happyRows.rows[0]?.memo).toBe("이사 도와줌");
    expect(happyRows.rows[0]?.repayment_timing).toBe("anytime");
    expect(happyRows.rows[0]?.is_repaid).toBe(false);

    // (b) USER_B 의 friend_id 로 시도 → throw 또는 row 미생성 (구현 자율).
    const hackFd = new FormData();
    hackFd.set("friend_id", bFriendId);
    hackFd.set("new_friend_name", "");
    hackFd.set("category_id", aOwn.categoryId);
    hackFd.set("memo", "탈취 시도");
    hackFd.set("received_date", "2026-05-11");
    hackFd.set("repayment_timing", "anytime");
    hackFd.set("repayment_specific_date", "");

    await createEntry(hackFd).catch(() => {
      /* application-layer 거절 또는 RLS 거절 — DB 상태가 본질 */
    });

    // 본질: 새 entry 가 안 들어갔다.
    const after = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM entries WHERE user_id = $1`,
      [USER_A],
    );
    expect(after.rows[0]?.c).toBe("1");

    // 메모 "탈취 시도" 도 0건.
    const hackCount = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM entries WHERE memo = '탈취 시도'`,
    );
    expect(hackCount.rows[0]?.c).toBe("0");
  });

  it("[시나리오 12] createEntry 인라인 친구 빠른 생성 — pendingNewFriendName 으로 friend + entry 한 트랜잭션 생성", async () => {
    const aOwn = await seedFriendAndCategory(USER_A);

    await actAs(USER_A);
    const { createEntry } = await import(
      "@/app/(authenticated)/entries/actions"
    );

    // friend_id 가 비고 new_friend_name 만 채워진 경우 — 새 친구 row 도 함께 만든다.
    const fd = new FormData();
    fd.set("friend_id", "");
    fd.set("new_friend_name", "정민호");
    fd.set("category_id", aOwn.categoryId);
    fd.set("memo", "면접 봐줌");
    fd.set("received_date", "2026-05-12");
    fd.set("repayment_timing", "specific_date");
    fd.set("repayment_specific_date", "2026-06-15");

    await createEntry(fd);

    // 친구가 새로 들어갔다.
    const friendRows = await testDb.pg.query<{
      id: string;
      name: string;
      user_id: string;
    }>(
      `SELECT id, name, user_id FROM friends WHERE user_id = $1 AND name = '정민호'`,
      [USER_A],
    );
    expect(friendRows.rows).toHaveLength(1);
    const newFriendId = friendRows.rows[0]!.id;

    // entry 도 그 새 친구 id 로 묶여 들어갔다.
    const entryRows = await testDb.pg.query<{
      friend_id: string;
      memo: string;
      repayment_timing: string;
      repayment_specific_date: string | Date | null;
    }>(
      `SELECT friend_id, memo, repayment_timing, repayment_specific_date
       FROM entries WHERE user_id = $1 AND memo = '면접 봐줌'`,
      [USER_A],
    );
    expect(entryRows.rows).toHaveLength(1);
    expect(entryRows.rows[0]?.friend_id).toBe(newFriendId);
    expect(entryRows.rows[0]?.repayment_timing).toBe("specific_date");
    // 날짜 컬럼은 pglite 가 Date 또는 string 으로 직렬화할 수 있어 양쪽 모두 허용.
    const rsd = entryRows.rows[0]?.repayment_specific_date;
    const rsdStr =
      rsd instanceof Date ? rsd.toISOString().slice(0, 10) : String(rsd ?? "");
    expect(rsdStr).toBe("2026-06-15");
  });

  it("[시나리오 12-b] 인라인 친구 생성 트랜잭션 — entry 단계가 실패하면 새 친구도 롤백된다", async () => {
    // category 만 시드 (친구는 시드 안 함).
    let categoryId = "";
    await asServiceRole(testDb, async () => {
      const c = await testDb.pg.query<{ id: string }>(
        `INSERT INTO categories (user_id, name, color, is_system, sort_order)
         VALUES ($1, '물질', '#22c55e', true, 1) RETURNING id`,
        [USER_A],
      );
      categoryId = c.rows[0]!.id;
    });

    await actAs(USER_A);
    const { createEntry } = await import(
      "@/app/(authenticated)/entries/actions"
    );

    // category_id 를 다른 user 의 것으로 위조 → entry insert 단계에서 거절되어야 한다.
    // category 가 본인 소유가 아니어서 application-layer 또는 RLS 가 막는다.
    // 그 후 친구가 살아남으면 트랜잭션 없는 구현 — DB 에 부분적 잔여물이 남는다.
    let bCategoryId = "";
    await asServiceRole(testDb, async () => {
      const c = await testDb.pg.query<{ id: string }>(
        `INSERT INTO categories (user_id, name, color, is_system, sort_order)
         VALUES ($1, 'B카테고리', '#f472b6', false, 4) RETURNING id`,
        [USER_B],
      );
      bCategoryId = c.rows[0]!.id;
    });
    expect(bCategoryId).not.toBe("");
    // category_id 검증을 회피하려는 happy path 시드도 검증이 명확하지 않을 수 있어
    // 본 케이스의 본질만 명확히: "memo 누락"(NOT NULL) 으로 entry insert 실패를 강제.
    void categoryId;

    const fd = new FormData();
    fd.set("friend_id", "");
    fd.set("new_friend_name", "롤백후보");
    // memo 가 비어 있어 NOT NULL 위반 → entry insert 단계 실패.
    fd.set("category_id", bCategoryId); // 어차피 거절될 카테고리.
    fd.set("memo", "");
    fd.set("received_date", "2026-05-12");
    fd.set("repayment_timing", "anytime");
    fd.set("repayment_specific_date", "");

    await createEntry(fd).catch(() => {
      /* entry insert 실패 — 트랜잭션이 잘 잡혔다면 친구도 롤백된다 */
    });

    // 본질: 친구 "롤백후보" 가 살아남으면 안 된다.
    const lingering = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM friends
       WHERE user_id = $1 AND name = '롤백후보'`,
      [USER_A],
    );
    expect(lingering.rows[0]?.c).toBe("0");
  });

  it("[시나리오 13] listEntriesByFriend — 본인 user_id + friend_id 격리, 카테고리 JOIN 필드 노출", async () => {
    const aOwn = await seedFriendAndCategory(USER_A);
    const bOwn = await seedFriendAndCategory(USER_B);

    // USER_A 의 entry 2개 (해당 친구), USER_A 의 entry 1개 (다른 친구), USER_B 의 entry 1개.
    let otherFriendId = "";
    await asServiceRole(testDb, async () => {
      const f = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES ($1, '다른친구') RETURNING id`,
        [USER_A],
      );
      otherFriendId = f.rows[0]!.id;
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES
           ($1, $2, $3, 'A의 첫 신세', '2026-05-10', 'anytime', false),
           ($1, $2, $3, 'A의 둘째 신세', '2026-05-11', 'friend_birthday', false),
           ($1, $4, $3, 'A의 다른친구 신세', '2026-05-09', 'anytime', false),
           ($5, $6, $7, 'B의 신세', '2026-05-08', 'anytime', false)`,
        [
          USER_A,
          aOwn.friendId,
          aOwn.categoryId,
          otherFriendId,
          USER_B,
          bOwn.friendId,
          bOwn.categoryId,
        ],
      );
    });

    await actAs(USER_A);
    const { listEntriesByFriend } = await import("@/lib/entries/queries");
    // 반환 타입을 명시 — worker 가 lib/entries/queries.ts 를 만들기 전엔 모듈이 없어
    // 타입이 any 로 새지만, 명시적 annotation 으로 인라인 콜백 추론 실패는 방지.
    const list: Array<{
      id: string;
      memo: string;
      category_id: string;
      category_name?: string;
      category_color?: string;
    }> = await listEntriesByFriend(aOwn.friendId);

    const memos = list.map((e) => e.memo).sort();
    expect(memos).toEqual(["A의 둘째 신세", "A의 첫 신세"]);
    // 다른 친구·다른 user 의 entry 는 절대 섞이면 안 된다.
    expect(memos).not.toContain("A의 다른친구 신세");
    expect(memos).not.toContain("B의 신세");

    // 카테고리 JOIN 결과 — 표시용 필드.
    const sample = list[0]!;
    expect(sample.category_id).toBe(aOwn.categoryId);
    // worker 가 join 으로 노출하는 필드 — 이름은 디자이너 타입과 정합.
    expect(sample.category_name).toBe("물질");
    expect(sample.category_color).toBe("#22c55e");
  });

  it("[시나리오 14] updateEntry — 본인 entry 만 수정, friend_id/category_id 변경 시 본인 소유 재검증", async () => {
    const aOwn = await seedFriendAndCategory(USER_A);

    // USER_A 본인 entry.
    let aEntryId = "";
    await asServiceRole(testDb, async () => {
      const r = await testDb.pg.query<{ id: string }>(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES ($1, $2, $3, '원본 메모', '2026-05-10', 'anytime', false)
         RETURNING id`,
        [USER_A, aOwn.friendId, aOwn.categoryId],
      );
      aEntryId = r.rows[0]!.id;
    });

    // (a) 본인 entry 메모 수정 → 반영.
    await actAs(USER_A);
    const { updateEntry } = await import(
      "@/app/(authenticated)/entries/actions"
    );
    const happyFd = new FormData();
    happyFd.set("id", aEntryId);
    happyFd.set("friend_id", aOwn.friendId);
    happyFd.set("new_friend_name", "");
    happyFd.set("category_id", aOwn.categoryId);
    happyFd.set("memo", "수정된 메모");
    happyFd.set("received_date", "2026-05-10");
    happyFd.set("repayment_timing", "anytime");
    happyFd.set("repayment_specific_date", "");
    await updateEntry(happyFd);

    const afterHappy = await testDb.pg.query<{ memo: string }>(
      `SELECT memo FROM entries WHERE id = $1`,
      [aEntryId],
    );
    expect(afterHappy.rows[0]?.memo).toBe("수정된 메모");

    // (b) friend_id 를 USER_B 의 친구로 바꾸려는 시도 → 변경되면 안 된다.
    let bFriendId = "";
    await asServiceRole(testDb, async () => {
      const f = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES ($1, 'B친구') RETURNING id`,
        [USER_B],
      );
      bFriendId = f.rows[0]!.id;
    });

    const hackFd = new FormData();
    hackFd.set("id", aEntryId);
    hackFd.set("friend_id", bFriendId);
    hackFd.set("new_friend_name", "");
    hackFd.set("category_id", aOwn.categoryId);
    hackFd.set("memo", "탈취");
    hackFd.set("received_date", "2026-05-10");
    hackFd.set("repayment_timing", "anytime");
    hackFd.set("repayment_specific_date", "");

    await updateEntry(hackFd).catch(() => {
      /* 거절 — 본질은 friend_id 가 안 바뀐 것 */
    });

    const afterHack = await testDb.pg.query<{
      memo: string;
      friend_id: string;
    }>(`SELECT memo, friend_id FROM entries WHERE id = $1`, [aEntryId]);
    expect(afterHack.rows[0]?.friend_id).toBe(aOwn.friendId);
    // 메모도 "탈취" 로 안 바뀐다 (전체 update 가 거절되어야 함 — 부분 적용 금지).
    expect(afterHack.rows[0]?.memo).not.toBe("탈취");
  });

  it("[시나리오 15] deleteEntry — hard delete (D-017): row 자체가 사라진다", async () => {
    const aOwn = await seedFriendAndCategory(USER_A);

    let entryId = "";
    await asServiceRole(testDb, async () => {
      const r = await testDb.pg.query<{ id: string }>(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES ($1, $2, $3, '삭제 대상', '2026-05-10', 'anytime', false)
         RETURNING id`,
        [USER_A, aOwn.friendId, aOwn.categoryId],
      );
      entryId = r.rows[0]!.id;
    });

    await actAs(USER_A);
    const { deleteEntry } = await import(
      "@/app/(authenticated)/entries/actions"
    );
    await deleteEntry(entryId);

    // row 자체가 0건 (soft delete 가 아니라 hard delete — is_deleted 컬럼도 없음).
    const after = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM entries WHERE id = $1`,
      [entryId],
    );
    expect(after.rows[0]?.c).toBe("0");
  });
});
