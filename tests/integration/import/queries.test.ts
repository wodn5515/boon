import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * `lib/import/queries.ts::matchFriendsByName` + `bulkImportEntries` 통합 테스트 (시나리오 8~11).
 *
 * 결정 로그 009 + lib/import/queries.ts JSDoc 의 SQL 규약을 회귀 잠금:
 *
 *  - matchFriendsByName (시나리오 8):
 *     · 정정-1 패턴 — `eq(friends.user_id, currentUser.id)` 본인 user 격리.
 *     · 친구 풀에서 case-insensitive trim 매칭 (LOWER(name) IN ...).
 *     · soft delete 친구 제외 (`is_deleted=false`).
 *     · LEFT JOIN LATERAL — 친구 메모(`note`) + 최근 신세 1건 (memo, received_date) 결합.
 *     · 동명이인 자동 감지 — 같은 이름 친구 2건이면 candidates 2건.
 *     · 빈 names → 빈 결과 (no-op).
 *
 *  - bulkImportEntries (시나리오 9~11):
 *     · 단일 트랜잭션 — 새 친구 insert + entries bulk insert 가 원자적 (시나리오 10).
 *     · 동일 newFriendName 이 여러 row 면 friend 1건만 생성 (시나리오 9 dedup, case-insensitive trim).
 *     · 카테고리 본인 소유 cross-check — 다른 user 의 category_id 로는 거절 (정정-1).
 *     · 메모 빌더 잠금: "이벤트명 · 친구이름 · 금액 N원 · 비고" (Step 5 buildMemo 와 동일 규약, 시나리오 9).
 *     · 빈 rows → 0건 처리, throw 아님 (시나리오 11).
 *     · 성공 시 BulkImportResult { entriesCreated, friendsCreated } 반환.
 *
 * 사전 가정 (worker 가 결합):
 *   - lib/import/queries.ts 의 `matchFriendsByName` / `bulkImportEntries` 가 placeholder throw 를
 *     떼고 drizzle + transaction 본체로 결합되어 있다.
 *   - getCurrentUser 는 vi.mock 으로 본인 user 갈아끼움 (entries/dashboard 패턴 정합).
 *   - 메모 빌더가 별도 util 파일(`lib/import/memo-builder.ts::buildMemo`) 로 추출되어
 *     bulkImportEntries 와 ImportWizard Step 5 가 같은 함수를 공유한다.
 *     (worker 자율 — 추출 안 하고 queries.ts 안에 인라인으로 두는 경우 본 spec 의 memo 비교는
 *      regex 정도로 약화 가능. Lead 결정.)
 *
 * 본 spec 은 placeholder throw 상태에서 모두 빨갛게 실패한다.
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
 * 한 명당 친구·카테고리 한 묶음 시드.
 * 반환: 본인 user 의 카테고리 id (bulkImportEntries 시나리오에서 재사용).
 */
async function seedBaseCategory(userId: string): Promise<{ categoryId: string }> {
  let categoryId = "";
  await asServiceRole(testDb, async () => {
    const c = await testDb.pg.query<{ id: string }>(
      `INSERT INTO categories (user_id, name, color, is_system, sort_order)
       VALUES ($1, '물질', '#22c55e', true, 1) RETURNING id`,
      [userId],
    );
    categoryId = c.rows[0]!.id;
  });
  return { categoryId };
}

// ============================================================
// [시나리오 8] matchFriendsByName
// ============================================================
describe("lib/import/queries::matchFriendsByName", () => {
  it("[시나리오 8-a] 본인 user 격리 + case-insensitive trim 매칭 + soft-deleted 친구 제외", async () => {
    // USER_A 의 친구: "박지원" 1명 (대문자/공백 변형 매칭 검증용), "이서윤" 1명, "삭제된친구" (soft delete).
    // USER_B 의 친구: "박지원" (동명) — A 의 매칭에 새 들어오면 안 됨 (정정-1).
    await asServiceRole(testDb, async () => {
      await testDb.pg.query(
        `INSERT INTO friends (user_id, name, note, is_deleted) VALUES
           ($1, '박지원', '회사 동료', false),
           ($1, '이서윤', null, false),
           ($1, '삭제된친구', null, true),
           ($2, '박지원', '타user 친구', false)`,
        [USER_A, USER_B],
      );
    });

    await actAs(USER_A);
    const { matchFriendsByName } = await import("@/lib/import/queries");

    // 변형 입력 — 양쪽 공백 + 대문자 변형 (한글에는 대소문자가 없지만 영문 혼합 케이스 정합 잠금).
    const results = await matchFriendsByName([
      "  박지원  ",
      "이서윤",
      "삭제된친구",
      "없는이름",
    ]);

    // 입력 순서대로 4건 반환 (매칭 안 된 이름도 candidates: []).
    expect(results.length).toBe(4);

    const byName = new Map(results.map((r) => [r.name.trim(), r]));
    // "박지원" — 본인 친구 1건만 (USER_B 친구는 절대 안 새어 들어옴).
    const parkJiwon = byName.get("박지원");
    expect(parkJiwon).toBeDefined();
    expect(parkJiwon!.candidates.length).toBe(1);
    expect(parkJiwon!.candidates[0]!.friend_name).toBe("박지원");
    expect(parkJiwon!.candidates[0]!.friend_note).toBe("회사 동료");

    // "이서윤" 1건 + friend_note null.
    const leeSeoyun = byName.get("이서윤");
    expect(leeSeoyun!.candidates.length).toBe(1);
    expect(leeSeoyun!.candidates[0]!.friend_note).toBeNull();

    // soft-deleted 친구는 후보 0건.
    const deleted = byName.get("삭제된친구");
    expect(deleted!.candidates.length).toBe(0);

    // 매칭 안 된 이름도 candidates: [].
    const missing = byName.get("없는이름");
    expect(missing!.candidates.length).toBe(0);
  });

  it("[시나리오 8-b] 동명이인 자동 감지 — 같은 이름 친구 2건이면 candidates 2건", async () => {
    await asServiceRole(testDb, async () => {
      await testDb.pg.query(
        `INSERT INTO friends (user_id, name, note, is_deleted) VALUES
           ($1, '김민준', '회사 동료', false),
           ($1, '김민준', '고등학교 동창', false)`,
        [USER_A],
      );
    });

    await actAs(USER_A);
    const { matchFriendsByName } = await import("@/lib/import/queries");

    const results = await matchFriendsByName(["김민준"]);
    expect(results.length).toBe(1);
    expect(results[0]!.candidates.length).toBe(2);
    const notes = results[0]!.candidates.map((c) => c.friend_note).sort();
    expect(notes).toEqual(["고등학교 동창", "회사 동료"]);
  });

  it("[시나리오 8-c] 1건 매칭 시 LEFT JOIN LATERAL 으로 최근 신세 1건 (memo + received_date) 동봉, 없으면 null", async () => {
    const { categoryId } = await seedBaseCategory(USER_A);
    let friendIdWithEntry = "";
    let friendIdNoEntry = "";
    await asServiceRole(testDb, async () => {
      const f1 = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name, note) VALUES ($1, '이서윤', '대학 동기') RETURNING id`,
        [USER_A],
      );
      friendIdWithEntry = f1.rows[0]!.id;
      const f2 = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name, note) VALUES ($1, '최은우', '사촌') RETURNING id`,
        [USER_A],
      );
      friendIdNoEntry = f2.rows[0]!.id;

      // 이서윤 친구에게 신세 2건 — 가장 최근 1건이 LATERAL 로 채워져야 한다.
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES
           ($1, $2, $3, '오래된 신세', '2026-01-10', 'anytime', false),
           ($1, $2, $3, '가장 최근 신세', '2026-04-20', 'anytime', false)`,
        [USER_A, friendIdWithEntry, categoryId],
      );
    });

    await actAs(USER_A);
    const { matchFriendsByName } = await import("@/lib/import/queries");

    const results = await matchFriendsByName(["이서윤", "최은우"]);
    const byName = new Map(results.map((r) => [r.name, r]));

    // 이서윤 — 최근 신세 1건 (LATERAL ORDER BY received_date DESC LIMIT 1).
    const seoyun = byName.get("이서윤")!;
    expect(seoyun.candidates.length).toBe(1);
    expect(seoyun.candidates[0]!.recent_entry_memo).toBe("가장 최근 신세");
    // received_date 가 string 또는 Date 로 직렬화될 수 있어 양쪽 허용 (pglite vs Supabase 호환).
    // 타입 시그니처(string|null)와 무관히 런타임에 Date 객체가 올 가능성을 unknown 통해 흡수.
    const rd: unknown = seoyun.candidates[0]!.recent_entry_date;
    const rdStr =
      rd instanceof Date ? rd.toISOString().slice(0, 10) : String(rd ?? "");
    expect(rdStr).toBe("2026-04-20");

    // 최은우 — entry 없음 → null 동봉.
    const eunwoo = byName.get("최은우")!;
    expect(eunwoo.candidates.length).toBe(1);
    expect(eunwoo.candidates[0]!.recent_entry_memo).toBeNull();
    expect(eunwoo.candidates[0]!.recent_entry_date).toBeNull();
  });

  it("[시나리오 8-d] 빈 names 배열 → 빈 결과 (no-op, throw 아님)", async () => {
    await actAs(USER_A);
    const { matchFriendsByName } = await import("@/lib/import/queries");

    const results = await matchFriendsByName([]);
    expect(results).toEqual([]);
  });
});

// ============================================================
// [시나리오 9~11] bulkImportEntries
// ============================================================
describe("lib/import/queries::bulkImportEntries", () => {
  // ============================================================
  // [시나리오 9] dedup + 메모 빌더 + 본인 카테고리 본격 결합
  // ============================================================
  it("[시나리오 9] 동일 newFriendName 여러 row 시 friend 1건만 dedup 생성 + 메모 빌더 잠금", async () => {
    const { categoryId } = await seedBaseCategory(USER_A);

    await actAs(USER_A);
    const { bulkImportEntries } = await import("@/lib/import/queries");

    const eventName = "결혼식축의금-9";
    // 같은 newFriendName "박지원" 이 3 row → friend 1건만 생성, entries 3건.
    // 동시에 다른 newFriendName "이서윤" 1 row → friend 1건 + entry 1건.
    const rows = [
      {
        friendId: null,
        newFriendName: "박지원",
        memo: `${eventName} · 박지원 · 금액 100,000원 · 회사 동료`,
        receivedDate: "2026-05-13",
        categoryId,
        repaymentTiming: "specific_event" as const,
      },
      {
        friendId: null,
        newFriendName: "박지원",
        memo: `${eventName} · 박지원 · 금액 150,000원`,
        receivedDate: "2026-05-13",
        categoryId,
        repaymentTiming: "specific_event" as const,
      },
      {
        friendId: null,
        newFriendName: "박지원",
        memo: `${eventName} · 박지원 · 금액 50,000원`,
        receivedDate: "2026-05-13",
        categoryId,
        repaymentTiming: "specific_event" as const,
      },
      {
        friendId: null,
        newFriendName: "이서윤",
        memo: `${eventName} · 이서윤 · 금액 200,000원 · 대학 친구`,
        receivedDate: "2026-05-13",
        categoryId,
        repaymentTiming: "specific_event" as const,
      },
    ];

    const result = await bulkImportEntries(rows);

    // 카운트.
    expect(result.entriesCreated).toBe(4);
    expect(result.friendsCreated).toBe(2);

    // DB 확인 — "박지원" 친구 1건만 생성, 그 friend_id 로 entry 3건 묶임.
    const friendsRows = await testDb.pg.query<{
      id: string;
      name: string;
    }>(`SELECT id, name FROM friends WHERE user_id = $1 ORDER BY name`, [
      USER_A,
    ]);
    expect(friendsRows.rows.length).toBe(2);
    const names = friendsRows.rows.map((r) => r.name).sort();
    expect(names).toEqual(["박지원", "이서윤"]);

    // 박지원 친구 id 로 묶인 entry 3건.
    const parkId = friendsRows.rows.find((r) => r.name === "박지원")!.id;
    const parkEntries = await testDb.pg.query<{
      memo: string;
      friend_id: string;
      category_id: string;
      repayment_timing: string;
    }>(
      `SELECT memo, friend_id, category_id, repayment_timing
       FROM entries WHERE user_id = $1 AND friend_id = $2 ORDER BY memo`,
      [USER_A, parkId],
    );
    expect(parkEntries.rows.length).toBe(3);
    // 메모 빌더 잠금 — eventName prefix + " · " 구분자.
    for (const row of parkEntries.rows) {
      expect(row.memo.startsWith(`${eventName} · 박지원`)).toBe(true);
      expect(row.memo.includes(" · 금액 ")).toBe(true);
      expect(row.category_id).toBe(categoryId);
      expect(row.repayment_timing).toBe("specific_event");
    }
  });

  // ============================================================
  // [시나리오 10] 카테고리 본인 소유 cross-check + 트랜잭션 atomicity
  // ============================================================
  it("[시나리오 10] 정상 row + 다른 user 의 category_id row 가 섞이면 → 전체 롤백 (정상 row 도 DB 미반영)", async () => {
    // 본인 카테고리 + 다른 user 의 카테고리를 모두 시드.
    const { categoryId: aCategoryId } = await seedBaseCategory(USER_A);
    const { categoryId: bCategoryId } = await seedBaseCategory(USER_B);

    await actAs(USER_A);
    const { bulkImportEntries } = await import("@/lib/import/queries");

    // (a) 정상 row — 본인 카테고리, 통과 가능 조건. (b) 위반 row — 다른 user 카테고리.
    // 트랜잭션이 잘 잡혔다면 (a) 의 친구·entry 도 함께 롤백된다. application-layer 거절 후에도
    // pre-validate (모든 row 의 categoryId 본인 소유 확인) 단계에서 막혀야 한다.
    const rows = [
      {
        friendId: null,
        newFriendName: "정상친구",
        memo: "장례식조의금 · 정상친구 · 금액 100,000원",
        receivedDate: "2026-05-13",
        categoryId: aCategoryId,
        repaymentTiming: "specific_event" as const,
      },
      {
        friendId: null,
        newFriendName: "롤백후보",
        memo: "장례식조의금 · 롤백후보 · 금액 100,000원",
        receivedDate: "2026-05-13",
        categoryId: bCategoryId, // USER_B 소유 — 거절되어야 함.
        repaymentTiming: "specific_event" as const,
      },
    ];

    await bulkImportEntries(rows).catch(() => {
      /* application-layer 또는 RLS 거절 — 본질은 (a) 까지 같이 롤백되었는지 */
    });

    // 본질: 친구 "정상친구" 와 "롤백후보" 모두 0건이어야 한다 (전체 롤백).
    const friends = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM friends
       WHERE user_id = $1 AND name IN ('정상친구', '롤백후보')`,
      [USER_A],
    );
    expect(friends.rows[0]?.c).toBe("0");

    const entries = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM entries WHERE user_id = $1`,
      [USER_A],
    );
    expect(entries.rows[0]?.c).toBe("0");
  });

  // ============================================================
  // [시나리오 11] 빈 입력 — 0건 처리, throw 아님
  // ============================================================
  it("[시나리오 11] 빈 rows 입력 → BulkImportResult { entriesCreated:0, friendsCreated:0 }, throw 아님", async () => {
    await actAs(USER_A);
    const { bulkImportEntries } = await import("@/lib/import/queries");

    const result = await bulkImportEntries([]);
    expect(result.entriesCreated).toBe(0);
    expect(result.friendsCreated).toBe(0);
  });

  // ============================================================
  // [시나리오 10-b] 기존 friend_id 가 본인 소유 아닐 때도 거절 (정정-1 강화) + 전체 롤백
  // ============================================================
  it("[시나리오 10-b] 정상 row + 다른 user 의 friend_id row 섞이면 → 거절, 전체 롤백 (정상 row 도 DB 미반영)", async () => {
    // USER_A 본인 카테고리 시드.
    const { categoryId: aCategoryId } = await seedBaseCategory(USER_A);
    // USER_B 친구 시드.
    let bFriendId = "";
    await asServiceRole(testDb, async () => {
      const f = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES ($1, 'B친구') RETURNING id`,
        [USER_B],
      );
      bFriendId = f.rows[0]!.id;
    });

    await actAs(USER_A);
    const { bulkImportEntries } = await import("@/lib/import/queries");

    const rows = [
      // (a) 정상 row — 새 친구 생성 + entry insert 가능한 조건.
      {
        friendId: null,
        newFriendName: "정상친구B",
        memo: "이벤트 · 정상친구B · 금액 100,000원",
        receivedDate: "2026-05-13",
        categoryId: aCategoryId,
        repaymentTiming: "anytime" as const,
      },
      // (b) 위반 row — 다른 user 의 friend_id.
      {
        friendId: bFriendId, // USER_B 친구 — 거절되어야 함.
        newFriendName: null,
        memo: "이벤트 · B친구 · 탈취 시도",
        receivedDate: "2026-05-13",
        categoryId: aCategoryId,
        repaymentTiming: "anytime" as const,
      },
    ];

    await bulkImportEntries(rows).catch(() => {
      /* 거절 — 본질은 (a) 의 정상 friend·entry 도 같이 롤백 */
    });

    // 본질: 정상 row 의 친구·entry 도 0건 (트랜잭션 롤백).
    const friend = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM friends
       WHERE user_id = $1 AND name = '정상친구B'`,
      [USER_A],
    );
    expect(friend.rows[0]?.c).toBe("0");

    const entries = await testDb.pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM entries WHERE user_id = $1`,
      [USER_A],
    );
    expect(entries.rows[0]?.c).toBe("0");
  });
});
