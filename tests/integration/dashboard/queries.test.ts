import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * dashboard read 쿼리 통합 테스트 (PRD §3, 결정 로그 007-dashboard-widgets).
 *
 * 대상: `lib/dashboard/queries.ts` 의 4개 placeholder 함수 본격 결합.
 *
 *   9.  getRecentEntries(limit) — 본인 user_id + RLS + JOIN(친구·카테고리),
 *       received_date DESC, 동률 created_at DESC, soft-deleted 친구 entries 제외.
 *  10.  getTopFriends(limit) — is_deleted=false, count DESC + name ASC tiebreak,
 *       count 0 친구 포함 (LEFT JOIN), 최근 entry 메모 1줄.
 *  11.  getUpcomingBirthdays(days) — 본인 user_id + is_deleted=false,
 *       birthday_month/day not null, D-N ASC, 30일 윈도우 (월말→월초 자연 연결),
 *       각 친구의 최근 entries 메모 1~3건.
 *  12.  getThisMonthSummary() — 이번 달 count + byCategory(sortCategories 순) + topFriends 3명.
 *
 * 사전 가정:
 *   - 005 / 006 슬라이스의 pglite + setAuthContext 헬퍼 그대로.
 *   - getCurrentUser 는 vi.mock 으로 본인 user 갈아끼움 (다른 도메인 테스트 패턴 정합).
 *   - lib/dashboard/queries.ts 는 `getCurrentUser()` + drizzle ORM 으로 결합 — placeholder throw 가 풀린다.
 *
 * 테스트 도메인 격리:
 *   - 각 테스트 직전 setAuthContext 로 user_id 주입. afterEach 가 entries/categories/friends DELETE.
 *   - 시드는 asServiceRole 로 RLS 우회.
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
  // FK 의존 순서.
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
 * 이번 달 yyyy-mm-dd 와 지난 달 yyyy-mm-dd 를 생성하는 헬퍼.
 *
 * 본 spec 은 "이번 달" 의 자연어 정의를 호출 시점 사용자의 로컬 month 로 받는다 (lib/dashboard/queries.ts 주석).
 * pglite + Node 의 시스템 시간을 그대로 사용 — Asia/Seoul 가정.
 */
function thisMonthDate(day: number, now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-${String(day).padStart(2, "0")}`;
}
function lastMonthDate(day: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-${String(day).padStart(2, "0")}`;
}

/**
 * 오늘 + N일 후의 month/day. 위젯 C 의 30일 슬라이딩 윈도우 검증용.
 */
function dateInDays(deltaDays: number): { month: number; day: number } {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  return { month: d.getMonth() + 1, day: d.getDate() };
}

describe("lib/dashboard/queries", () => {
  // ============================================================
  // [시나리오 9] getRecentEntries
  // ============================================================
  describe("getRecentEntries", () => {
    it("본인 user_id 만, received_date DESC + created_at DESC tiebreak, 친구·카테고리 join 평탄화", async () => {
      let friendA = "";
      let friendB = "";
      let catMind = "";
      await asServiceRole(testDb, async () => {
        const a = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name) VALUES ($1, '혜정') RETURNING id`,
          [USER_A],
        );
        friendA = a.rows[0]!.id;
        const b = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name) VALUES ($1, '준영') RETURNING id`,
          [USER_A],
        );
        friendB = b.rows[0]!.id;
        // 다른 user 의 친구·카테고리·entry 도 만들어 격리 검증.
        const bFriend = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name) VALUES ($1, '다른사람친구') RETURNING id`,
          [USER_B],
        );
        const bCat = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, icon, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', '💝', true, 3) RETURNING id`,
          [USER_B],
        );

        const c = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, icon, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', '💝', true, 3) RETURNING id`,
          [USER_A],
        );
        catMind = c.rows[0]!.id;

        // USER_A 의 entries — 같은 received_date 2건은 created_at 으로 tiebreak.
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid, created_at)
           VALUES
             ($1, $2, $3, 'old',     '2026-05-01', 'anytime', false, '2026-05-01 09:00+09'),
             ($1, $2, $3, 'tie-first',  '2026-05-12', 'anytime', false, '2026-05-12 09:00+09'),
             ($1, $2, $3, 'tie-second', '2026-05-12', 'anytime', false, '2026-05-12 12:00+09'),
             ($1, $4, $3, 'newest',  '2026-05-13', 'anytime', false, '2026-05-13 09:00+09')`,
          [USER_A, friendA, catMind, friendB],
        );
        // USER_B 의 entry — 격리 검증.
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES ($1, $2, $3, 'leak-check', '2026-05-14', 'anytime', false)`,
          [USER_B, bFriend.rows[0]!.id, bCat.rows[0]!.id],
        );
      });

      await actAs(USER_A);
      const { getRecentEntries } = await import("@/lib/dashboard/queries");

      const rows = await getRecentEntries(5);
      // 4건 모두 USER_A 의 것 — USER_B 의 leak-check 가 새지 않는다.
      expect(rows.map((r) => r.memo)).toEqual([
        "newest",
        "tie-second",
        "tie-first",
        "old",
      ]);

      // JOIN 평탄화: 첫 row 의 친구·카테고리 표시 필드.
      const first = rows[0];
      expect(first.friend_name).toBe("준영");
      expect(first.category_name).toBe("마음");
      expect(first.category_color).toBe("#4ade80");
      expect(first.category_icon).toBe("💝");
    });

    it("limit 인자에 맞춰 잘라낸다 (기본 5)", async () => {
      let friend = "";
      let cat = "";
      await asServiceRole(testDb, async () => {
        const f = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name) VALUES ($1, '친구') RETURNING id`,
          [USER_A],
        );
        friend = f.rows[0]!.id;
        const c = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', true, 3) RETURNING id`,
          [USER_A],
        );
        cat = c.rows[0]!.id;
        for (let i = 0; i < 7; i += 1) {
          await testDb.pg.query(
            `INSERT INTO entries
               (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
             VALUES ($1, $2, $3, $4, $5, 'anytime', false)`,
            [USER_A, friend, cat, `memo-${i}`, `2026-05-0${i + 1}`],
          );
        }
      });

      await actAs(USER_A);
      const { getRecentEntries } = await import("@/lib/dashboard/queries");

      const rows = await getRecentEntries(3);
      expect(rows.length).toBe(3);
    });

    it("soft-deleted 친구의 entries 는 결과에서 제외된다 (PR #5 시나리오 17 일관)", async () => {
      let aliveFriend = "";
      let deletedFriend = "";
      let cat = "";
      await asServiceRole(testDb, async () => {
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
        const c = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', true, 3) RETURNING id`,
          [USER_A],
        );
        cat = c.rows[0]!.id;

        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES
             ($1, $2, $3, '보임',     '2026-05-01', 'anytime', false),
             ($1, $4, $3, '안 보임',  '2026-05-02', 'anytime', false)`,
          [USER_A, aliveFriend, cat, deletedFriend],
        );
      });

      await actAs(USER_A);
      const { getRecentEntries } = await import("@/lib/dashboard/queries");

      const rows = await getRecentEntries(5);
      expect(rows.map((r) => r.memo)).toEqual(["보임"]);
    });
  });

  // ============================================================
  // [시나리오 10] getTopFriends
  // ============================================================
  describe("getTopFriends", () => {
    it("받은 신세 수 DESC, 동률 name ASC, count=0 친구도 포함, soft-deleted 친구는 제외", async () => {
      let cat = "";
      let f1 = "";
      let f2 = "";
      let f3 = "";
      let f4 = "";
      let fDeleted = "";
      await asServiceRole(testDb, async () => {
        const c = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', true, 3) RETURNING id`,
          [USER_A],
        );
        cat = c.rows[0]!.id;
        // friend1 = 3건, friend2 = 1건, friend3 = 1건 (이름순으로 f3 < f2 시 tie 정렬 검증),
        // friend4 = 0건 (신세 아직 없음), deleted = soft delete.
        const rows = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name) VALUES
             ($1, '가나'),
             ($1, '나라'),
             ($1, '다람'),
             ($1, '라마')
           RETURNING id`,
          [USER_A],
        );
        f1 = rows.rows[0]!.id; // 가나 — 3건
        f2 = rows.rows[1]!.id; // 나라 — 1건
        f3 = rows.rows[2]!.id; // 다람 — 1건 (나라와 동률 — 이름 ASC: 나라 < 다람)
        f4 = rows.rows[3]!.id; // 라마 — 0건
        const del = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name, is_deleted) VALUES ($1, '삭제친구', true) RETURNING id`,
          [USER_A],
        );
        fDeleted = del.rows[0]!.id;

        // 가나 3건.
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES
             ($1, $2, $3, '가나-1', '2026-05-01', 'anytime', false),
             ($1, $2, $3, '가나-2', '2026-05-02', 'anytime', false),
             ($1, $2, $3, '가나-3', '2026-05-10', 'anytime', false)`,
          [USER_A, f1, cat],
        );
        // 나라 1건.
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES ($1, $2, $3, '나라-1', '2026-05-05', 'anytime', false)`,
          [USER_A, f2, cat],
        );
        // 다람 1건.
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES ($1, $2, $3, '다람-1', '2026-05-06', 'anytime', false)`,
          [USER_A, f3, cat],
        );
        // 라마 0건. deleted-friend 도 entries 1건 (soft delete 인데 entry 보존 — count 합산 X 검증).
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES ($1, $2, $3, '삭제친구-1', '2026-05-07', 'anytime', false)`,
          [USER_A, fDeleted, cat],
        );
      });

      await actAs(USER_A);
      const { getTopFriends } = await import("@/lib/dashboard/queries");

      const rows = await getTopFriends(6);

      // soft-deleted 친구는 없다.
      expect(rows.map((r) => r.id)).not.toContain(fDeleted);

      // 정렬: count DESC, name ASC tiebreak.
      expect(rows.map((r) => ({ name: r.name, count: r.entry_count }))).toEqual([
        { name: "가나", count: 3 },
        { name: "나라", count: 1 },
        { name: "다람", count: 1 },
        { name: "라마", count: 0 },
      ]);

      // 가나의 가장 최근 받은 entry 메모는 '가나-3' (2026-05-10).
      expect(rows[0].recent_memo).toBe("가나-3");
      // count=0 친구는 recent_memo 가 null.
      expect(rows[3].recent_memo).toBeNull();
    });

    it("limit 인자에 맞춰 잘라낸다", async () => {
      await asServiceRole(testDb, async () => {
        for (let i = 0; i < 4; i += 1) {
          await testDb.pg.query(
            `INSERT INTO friends (user_id, name) VALUES ($1, $2)`,
            [USER_A, `친구${i}`],
          );
        }
      });

      await actAs(USER_A);
      const { getTopFriends } = await import("@/lib/dashboard/queries");

      const rows = await getTopFriends(2);
      expect(rows.length).toBe(2);
    });

    it("다른 user 의 친구는 결과에 섞이지 않는다", async () => {
      await asServiceRole(testDb, async () => {
        await testDb.pg.query(
          `INSERT INTO friends (user_id, name) VALUES ($1, '내친구'), ($2, '남친구')`,
          [USER_A, USER_B],
        );
      });

      await actAs(USER_A);
      const { getTopFriends } = await import("@/lib/dashboard/queries");

      const rows = await getTopFriends(6);
      expect(rows.map((r) => r.name)).toEqual(["내친구"]);
    });
  });

  // ============================================================
  // [시나리오 11] getUpcomingBirthdays
  // ============================================================
  describe("getUpcomingBirthdays", () => {
    it("30일 윈도우 안의 친구를 D-N ASC 로, 각 친구의 최근 entries 메모 1~3건 포함", async () => {
      const d5 = dateInDays(5);
      const d10 = dateInDays(10);
      const d40 = dateInDays(40); // 윈도우 밖.
      let cat = "";
      let friendD5 = "";
      let friendD10 = "";
      let friendD40 = "";
      let friendNoBirth = "";
      let friendDeleted = "";
      await asServiceRole(testDb, async () => {
        const c = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', true, 3) RETURNING id`,
          [USER_A],
        );
        cat = c.rows[0]!.id;

        const f1 = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name, birthday_month, birthday_day) VALUES ($1, 'D5친구', $2, $3) RETURNING id`,
          [USER_A, d5.month, d5.day],
        );
        friendD5 = f1.rows[0]!.id;
        const f2 = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name, birthday_month, birthday_day) VALUES ($1, 'D10친구', $2, $3) RETURNING id`,
          [USER_A, d10.month, d10.day],
        );
        friendD10 = f2.rows[0]!.id;
        const f3 = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name, birthday_month, birthday_day) VALUES ($1, 'D40친구', $2, $3) RETURNING id`,
          [USER_A, d40.month, d40.day],
        );
        friendD40 = f3.rows[0]!.id;
        const f4 = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name) VALUES ($1, '생일없는친구') RETURNING id`,
          [USER_A],
        );
        friendNoBirth = f4.rows[0]!.id;
        const f5 = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name, birthday_month, birthday_day, is_deleted)
           VALUES ($1, '삭제생일친구', $2, $3, true) RETURNING id`,
          [USER_A, d5.month, d5.day],
        );
        friendDeleted = f5.rows[0]!.id;

        // friendD5 에게 entries 4건 — 그 중 최근 3건이 노출되어야 한다.
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES
             ($1, $2, $3, 'D5-old',  '2026-04-01', 'anytime', false),
             ($1, $2, $3, 'D5-mid1', '2026-05-01', 'anytime', false),
             ($1, $2, $3, 'D5-mid2', '2026-05-02', 'anytime', false),
             ($1, $2, $3, 'D5-new',  '2026-05-10', 'anytime', false)`,
          [USER_A, friendD5, cat],
        );
      });

      await actAs(USER_A);
      const { getUpcomingBirthdays } = await import("@/lib/dashboard/queries");

      const rows = await getUpcomingBirthdays(30);

      // 윈도우 안의 D5친구·D10친구만 (D40, 생일없는친구, 삭제친구 제외) + D-N ASC.
      expect(rows.map((r) => r.friend_name)).toEqual(["D5친구", "D10친구"]);
      expect(rows[0].days_until).toBeLessThan(rows[1].days_until);
      expect(rows[0].days_until).toBeGreaterThanOrEqual(0);
      expect(rows[0].days_until).toBeLessThanOrEqual(30);

      // 회상 메모: 최근 3건 (D5-new, D5-mid2, D5-mid1) — 가장 오래된 D5-old 는 빠진다.
      expect(rows[0].recent_memos).toEqual(["D5-new", "D5-mid2", "D5-mid1"]);

      // D10 친구는 entries 0건 → 빈 배열.
      expect(rows[1].recent_memos).toEqual([]);
    });

    it("월말→월초 자연 연결 — 오늘이 12월 말이고 1월 초 생일 친구가 30일 윈도우 안에 들어온다", async () => {
      // 이 케이스는 daysUntilBirthday 가 연도 wraparound 를 처리한다는 가정에 의존.
      // 시스템 시간을 직접 조작하지 않고, "오늘 + 25일 후" 친구를 만들어 윈도우 안에 들어옴을 검증.
      // (연말 시점 시뮬레이션 자체는 단위 테스트(birthday.test.ts)에서 수행 — 본 spec 은 windowing 동작만)
      const future = dateInDays(25);
      await asServiceRole(testDb, async () => {
        await testDb.pg.query(
          `INSERT INTO friends (user_id, name, birthday_month, birthday_day)
           VALUES ($1, '25일후친구', $2, $3)`,
          [USER_A, future.month, future.day],
        );
      });

      await actAs(USER_A);
      const { getUpcomingBirthdays } = await import("@/lib/dashboard/queries");

      const rows = await getUpcomingBirthdays(30);
      expect(rows.map((r) => r.friend_name)).toEqual(["25일후친구"]);
      expect(rows[0].days_until).toBe(25);
    });

    it("days 인자가 윈도우 폭을 결정한다 (7일이면 7일 안 친구만)", async () => {
      const d5 = dateInDays(5);
      const d20 = dateInDays(20);
      await asServiceRole(testDb, async () => {
        await testDb.pg.query(
          `INSERT INTO friends (user_id, name, birthday_month, birthday_day)
           VALUES ($1, '가까운', $2, $3), ($1, '먼친구', $4, $5)`,
          [USER_A, d5.month, d5.day, d20.month, d20.day],
        );
      });

      await actAs(USER_A);
      const { getUpcomingBirthdays } = await import("@/lib/dashboard/queries");

      const rows = await getUpcomingBirthdays(7);
      expect(rows.map((r) => r.friend_name)).toEqual(["가까운"]);
    });

    it("다른 user 의 친구는 결과에 섞이지 않는다", async () => {
      const d5 = dateInDays(5);
      await asServiceRole(testDb, async () => {
        await testDb.pg.query(
          `INSERT INTO friends (user_id, name, birthday_month, birthday_day) VALUES ($1, '내친구', $3, $4), ($2, '남친구', $3, $4)`,
          [USER_A, USER_B, d5.month, d5.day],
        );
      });
      await actAs(USER_A);
      const { getUpcomingBirthdays } = await import("@/lib/dashboard/queries");

      const rows = await getUpcomingBirthdays(30);
      expect(rows.map((r) => r.friend_name)).toEqual(["내친구"]);
    });
  });

  // ============================================================
  // [시나리오 12] getThisMonthSummary
  // ============================================================
  describe("getThisMonthSummary", () => {
    it("이번 달 count + byCategory(sortCategories 순) + topFriends 3명 (count 0 친구 제외)", async () => {
      let catMaterial = "";
      let catTime = "";
      let catMind = "";
      let f1 = "";
      let f2 = "";
      let f3 = "";
      let f4 = "";
      await asServiceRole(testDb, async () => {
        const c1 = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, icon, is_system, sort_order)
           VALUES ($1, '물질', '#22c55e', '💰', true, 1) RETURNING id`,
          [USER_A],
        );
        catMaterial = c1.rows[0]!.id;
        const c2 = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, icon, is_system, sort_order)
           VALUES ($1, '시간·행동', '#84cc16', '⏰', true, 2) RETURNING id`,
          [USER_A],
        );
        catTime = c2.rows[0]!.id;
        const c3 = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, icon, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', '💝', true, 3) RETURNING id`,
          [USER_A],
        );
        catMind = c3.rows[0]!.id;

        const fr = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name) VALUES ($1, '혜정'), ($1, '준영'), ($1, '민수'), ($1, '없는친구') RETURNING id`,
          [USER_A],
        );
        f1 = fr.rows[0]!.id; // 혜정
        f2 = fr.rows[1]!.id; // 준영
        f3 = fr.rows[2]!.id; // 민수
        f4 = fr.rows[3]!.id; // 없는친구 — entries 0 → top 에 안 나옴

        // 이번 달 entries:
        //   - 혜정: 마음 3건 + 시간 1건 = 4
        //   - 준영: 마음 2건 = 2
        //   - 민수: 물질 1건 = 1
        //   - byCategory: 마음 5, 시간 1, 물질 1
        //   - sortCategories 순서 = is_system 먼저 + sort_order ASC = 물질→시간→마음
        const tm = (d: number) => thisMonthDate(d);
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES
             ($1, $2, $3, '혜-마1', $7, 'anytime', false),
             ($1, $2, $3, '혜-마2', $7, 'anytime', false),
             ($1, $2, $3, '혜-마3', $7, 'anytime', false),
             ($1, $2, $4, '혜-시1', $7, 'anytime', false),
             ($1, $5, $3, '준-마1', $7, 'anytime', false),
             ($1, $5, $3, '준-마2', $7, 'anytime', false),
             ($1, $6, $8, '민-물1', $7, 'anytime', false)`,
          [USER_A, f1, catMind, catTime, f2, f3, tm(5), catMaterial],
        );
        // 지난 달 entries — count 에 잡혀선 안 됨 (이번 달 카운트 분리 검증).
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES ($1, $2, $3, '지난달', $4, 'anytime', false)`,
          [USER_A, f1, catMind, lastMonthDate(15)],
        );
      });

      await actAs(USER_A);
      const { getThisMonthSummary } = await import("@/lib/dashboard/queries");

      const summary = await getThisMonthSummary();

      // count = 이번 달 entries 만 = 7 (지난달 1건 제외).
      expect(summary.count).toBe(7);

      // byCategory: sortCategories 순 = is_system 먼저 + sort_order ASC (물질→시간→마음).
      expect(summary.by_category.map((c) => c.name)).toEqual([
        "물질",
        "시간·행동",
        "마음",
      ]);
      const counts = Object.fromEntries(
        summary.by_category.map((c) => [c.name, c.count]),
      );
      expect(counts).toEqual({ 물질: 1, "시간·행동": 1, 마음: 5 });

      // topFriends: count DESC 3명, count=0 친구 제외.
      expect(summary.top_friends.map((t) => t.name)).toEqual([
        "혜정",
        "준영",
        "민수",
      ]);
      expect(summary.top_friends.map((t) => t.count)).toEqual([4, 2, 1]);
      expect(summary.top_friends.map((t) => t.name)).not.toContain("없는친구");
    });

    it("이번 달 entries 가 없으면 count=0, by_category·top_friends 빈 배열", async () => {
      await asServiceRole(testDb, async () => {
        await testDb.pg.query(
          `INSERT INTO categories (user_id, name, color, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', true, 3)`,
          [USER_A],
        );
      });
      await actAs(USER_A);
      const { getThisMonthSummary } = await import("@/lib/dashboard/queries");

      const summary = await getThisMonthSummary();
      expect(summary.count).toBe(0);
      expect(summary.by_category).toEqual([]);
      expect(summary.top_friends).toEqual([]);
    });

    it("다른 user 의 entries 는 합산되지 않는다", async () => {
      await asServiceRole(testDb, async () => {
        const fa = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name) VALUES ($1, '내친구') RETURNING id`,
          [USER_A],
        );
        const fb = await testDb.pg.query<{ id: string }>(
          `INSERT INTO friends (user_id, name) VALUES ($1, '남친구') RETURNING id`,
          [USER_B],
        );
        const ca = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', true, 3) RETURNING id`,
          [USER_A],
        );
        const cb = await testDb.pg.query<{ id: string }>(
          `INSERT INTO categories (user_id, name, color, is_system, sort_order)
           VALUES ($1, '마음', '#4ade80', true, 3) RETURNING id`,
          [USER_B],
        );
        await testDb.pg.query(
          `INSERT INTO entries
             (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
           VALUES
             ($1, $2, $3, '내것', $7, 'anytime', false),
             ($4, $5, $6, '남것', $7, 'anytime', false)`,
          [
            USER_A,
            fa.rows[0]!.id,
            ca.rows[0]!.id,
            USER_B,
            fb.rows[0]!.id,
            cb.rows[0]!.id,
            thisMonthDate(5),
          ],
        );
      });

      await actAs(USER_A);
      const { getThisMonthSummary } = await import("@/lib/dashboard/queries");

      const summary = await getThisMonthSummary();
      expect(summary.count).toBe(1);
      expect(summary.top_friends.map((t) => t.name)).toEqual(["내친구"]);
    });
  });
});
