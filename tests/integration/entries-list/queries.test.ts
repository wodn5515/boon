import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * `lib/entries-list/queries.ts::listEntriesFiltered` 본격 SQL 결합 통합 테스트 (시나리오 13~19).
 *
 * 결정 로그 008 §F + lib/entries-list/queries.ts JSDoc 의 SQL 규약을 회귀 잠금:
 *   - 정정-1 패턴: `eq(entries.user_id, currentUser.id)` 명시.
 *   - 친구 soft delete 처리: `eq(friends.is_deleted, false)` JOIN.
 *   - 카테고리 JOIN 평탄화: category_name / category_icon / category_color.
 *   - 메모 검색 (q): ILIKE + escapeLike (와일드카드 escape).
 *   - 친구·카테고리·날짜 범위 필터.
 *   - 정렬: recent (DESC, DESC) / oldest (ASC, ASC).
 *   - limit 기본 50.
 *
 * 사전 가정 (worker 가 결합):
 *   - lib/entries-list/queries.ts 가 mock 분기를 떼고 drizzle 본체로 결합되어 있다.
 *   - 디자이너 라운드의 MOCK_ENTRIES / lib/entries-list/mock.ts 파일은 제거되어 있다 (그래도 spec 은 mock 미참조).
 *   - getCurrentUser 는 vi.mock 으로 본인 user 갈아끼움 (dashboard / entries 패턴 정합).
 *
 * 시나리오 19 (getRecentEntries 위임 — worker 자율 결합) 는 별도 it 로 두되 그 검증은
 * "두 함수가 같은 데이터 소스 위에서 같은 의미의 결과를 만든다" 정도로 약하게 잡는다.
 * 위임 안 해도 본 spec 이 약하게 통과 가능 — Lead 결정 로그 008 §"후속 영향" 의 자율 판단 그대로.
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
 * 본인 user 의 친구·카테고리·entries 한 묶음을 시드.
 *
 * 반환:
 *   - friendIds: { keep, drop, deleted }
 *   - categoryIds: { material, time, mind }
 *   - entryMemos: 시드된 메모 라벨 모음 (검증에 사용)
 */
async function seedWorld(userId: string): Promise<{
  friendIds: { keep: string; drop: string; deleted: string };
  categoryIds: { material: string; time: string; mind: string };
}> {
  let keepFriend = "";
  let dropFriend = "";
  let deletedFriend = "";
  let cMaterial = "";
  let cTime = "";
  let cMind = "";
  await asServiceRole(testDb, async () => {
    const fk = await testDb.pg.query<{ id: string }>(
      `INSERT INTO friends (user_id, name) VALUES ($1, '민지-KEEP') RETURNING id`,
      [userId],
    );
    keepFriend = fk.rows[0]!.id;
    const fd = await testDb.pg.query<{ id: string }>(
      `INSERT INTO friends (user_id, name) VALUES ($1, '수현-DROP') RETURNING id`,
      [userId],
    );
    dropFriend = fd.rows[0]!.id;
    const fx = await testDb.pg.query<{ id: string }>(
      `INSERT INTO friends (user_id, name, is_deleted) VALUES ($1, '예린-DELETED', true) RETURNING id`,
      [userId],
    );
    deletedFriend = fx.rows[0]!.id;

    const c1 = await testDb.pg.query<{ id: string }>(
      `INSERT INTO categories (user_id, name, color, icon, is_system, sort_order)
       VALUES ($1, '물질', '#22c55e', '💰', true, 1) RETURNING id`,
      [userId],
    );
    cMaterial = c1.rows[0]!.id;
    const c2 = await testDb.pg.query<{ id: string }>(
      `INSERT INTO categories (user_id, name, color, icon, is_system, sort_order)
       VALUES ($1, '시간·행동', '#84cc16', '⏰', true, 2) RETURNING id`,
      [userId],
    );
    cTime = c2.rows[0]!.id;
    const c3 = await testDb.pg.query<{ id: string }>(
      `INSERT INTO categories (user_id, name, color, icon, is_system, sort_order)
       VALUES ($1, '마음', '#4ade80', '💝', true, 3) RETURNING id`,
      [userId],
    );
    cMind = c3.rows[0]!.id;
  });

  return {
    friendIds: { keep: keepFriend, drop: dropFriend, deleted: deletedFriend },
    categoryIds: { material: cMaterial, time: cTime, mind: cMind },
  };
}

describe("lib/entries-list/queries::listEntriesFiltered", () => {
  // ============================================================
  // [시나리오 13] 기본 — 본인 user_id + soft delete 친구 제외 + default sort/limit
  // ============================================================
  it("[시나리오 13] 본인 user_id 격리 + friends.is_deleted=false JOIN + 기본 sort=recent + 기본 limit=50", async () => {
    const a = await seedWorld(USER_A);
    const b = await seedWorld(USER_B);

    await asServiceRole(testDb, async () => {
      // A 의 entries — keep / drop / deleted-friend 친구 각각 1건.
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid, created_at)
         VALUES
           ($1, $2, $3, 'A-keep-newer',  '2026-05-12', 'anytime', false, '2026-05-12 12:00+09'),
           ($1, $2, $3, 'A-keep-older',  '2026-05-01', 'anytime', false, '2026-05-01 09:00+09'),
           ($1, $4, $3, 'A-drop-friend', '2026-05-10', 'anytime', false, '2026-05-10 09:00+09'),
           ($1, $5, $3, 'A-soft-deleted-friend', '2026-05-09', 'anytime', false, '2026-05-09 09:00+09')`,
        [USER_A, a.friendIds.keep, a.categoryIds.material, a.friendIds.drop, a.friendIds.deleted],
      );
      // B 의 entry — 격리 검증.
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES ($1, $2, $3, 'B-leak-check', '2026-05-13', 'anytime', false)`,
        [USER_B, b.friendIds.keep, b.categoryIds.material],
      );
    });

    await actAs(USER_A);
    const { listEntriesFiltered } = await import(
      "@/lib/entries-list/queries"
    );
    const rows = await listEntriesFiltered({});

    const memos = rows.map((r) => r.memo);
    // USER_B 의 entry 는 절대 안 새고, soft-deleted 친구의 entry 도 제외된다.
    expect(memos).not.toContain("B-leak-check");
    expect(memos).not.toContain("A-soft-deleted-friend");

    // 기본 정렬: received_date DESC → created_at DESC. drop 친구 것도 본인 entry 라 포함.
    expect(memos).toEqual(["A-keep-newer", "A-drop-friend", "A-keep-older"]);

    // JOIN 평탄화 검증 — 첫 row.
    const first = rows[0];
    expect(first?.category_name).toBe("물질");
    expect(first?.category_color).toBe("#22c55e");
    expect(first?.category_icon).toBe("💰");
    expect(first?.friend_name).toBe("민지-KEEP");
  });

  it("[시나리오 13-b] limit 기본값 50 — 51건 이상 시드해도 50건까지만 반환", async () => {
    const a = await seedWorld(USER_A);
    await asServiceRole(testDb, async () => {
      const values: string[] = [];
      const params: unknown[] = [USER_A, a.friendIds.keep, a.categoryIds.material];
      for (let i = 0; i < 55; i += 1) {
        // 모든 received_date 를 다르게 줘 정렬·tiebreak 영향 회피.
        const day = String((i % 28) + 1).padStart(2, "0");
        const monthOffset = Math.floor(i / 28);
        const month = String(1 + monthOffset).padStart(2, "0");
        const date = `2026-${month}-${day}`;
        values.push(
          `($1, $2, $3, 'limit-${i}', '${date}', 'anytime', false)`,
        );
      }
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES ${values.join(", ")}`,
        params,
      );
    });

    await actAs(USER_A);
    const { listEntriesFiltered } = await import(
      "@/lib/entries-list/queries"
    );
    const rows = await listEntriesFiltered({});
    expect(rows.length).toBe(50);
  });

  // ============================================================
  // [시나리오 14] q (메모 ILIKE + 와일드카드 escape)
  // ============================================================
  it("[시나리오 14] q 검색 — case-insensitive substring + LIKE 와일드카드(%, _) escape", async () => {
    const a = await seedWorld(USER_A);
    await asServiceRole(testDb, async () => {
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES
           ($1, $2, $3, '이사 도와줌 keepwordABC', '2026-05-10', 'anytime', false),
           ($1, $2, $3, 'KEEPWORDabc 두번째', '2026-05-11', 'anytime', false),
           ($1, $2, $3, '그냥 평범한 메모', '2026-05-12', 'anytime', false),
           ($1, $2, $3, '와일드카드 100%% 매칭 metoo', '2026-05-13', 'anytime', false),
           ($1, $2, $3, '와일드카드 1009 metoo', '2026-05-14', 'anytime', false)`,
        [USER_A, a.friendIds.keep, a.categoryIds.material],
      );
    });

    await actAs(USER_A);
    const { listEntriesFiltered } = await import(
      "@/lib/entries-list/queries"
    );

    // 14-a 대소문자 무시 substring.
    const lowerHits = await listEntriesFiltered({ q: "keepword" });
    expect(lowerHits.map((r) => r.memo).sort()).toEqual(
      [
        "KEEPWORDabc 두번째",
        "이사 도와줌 keepwordABC",
      ].sort(),
    );
    const upperHits = await listEntriesFiltered({ q: "KEEPWORD" });
    expect(upperHits.length).toBe(2);

    // 14-b 와일드카드 % 가 literal 로 escape — "100%" 정확 매칭만 1건, "1009" 는 제외.
    const pct = await listEntriesFiltered({ q: "100%" });
    expect(pct.length).toBe(1);
    expect(pct[0]?.memo).toBe("와일드카드 100% 매칭 metoo");

    // 14-c 와일드카드 _ 도 literal — "10_" 같은 패턴이 임의 1글자 매칭으로 새지 않는다.
    // (위 데이터에는 "10_" 정확 매칭 없음 → 0 건이어야 한다. escape 안 하면 "100", "1009" 가 새 들어옴.)
    const underscore = await listEntriesFiltered({ q: "10_" });
    expect(underscore.length).toBe(0);

    // 14-d 빈/공백 q 는 필터 미적용 — 시드한 5건 모두 반환.
    const blank = await listEntriesFiltered({ q: "   " });
    expect(blank.length).toBe(5);
  });

  // ============================================================
  // [시나리오 15] friend 필터
  // ============================================================
  it("[시나리오 15] friendId 필터 — 본인 소유 친구의 entries 만, 타 user 친구 id 로는 결과 미노출", async () => {
    const a = await seedWorld(USER_A);
    const b = await seedWorld(USER_B);
    await asServiceRole(testDb, async () => {
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES
           ($1, $2, $3, 'A-keep-1', '2026-05-10', 'anytime', false),
           ($1, $2, $3, 'A-keep-2', '2026-05-11', 'anytime', false),
           ($1, $4, $3, 'A-drop-1', '2026-05-12', 'anytime', false),
           ($5, $6, $7, 'B-keep-leak', '2026-05-13', 'anytime', false)`,
        [
          USER_A,
          a.friendIds.keep,
          a.categoryIds.material,
          a.friendIds.drop,
          USER_B,
          b.friendIds.keep,
          b.categoryIds.material,
        ],
      );
    });

    await actAs(USER_A);
    const { listEntriesFiltered } = await import(
      "@/lib/entries-list/queries"
    );

    // a.friendIds.keep 만 — 본인 친구.
    const own = await listEntriesFiltered({ friendId: a.friendIds.keep });
    expect(own.map((r) => r.memo).sort()).toEqual(["A-keep-1", "A-keep-2"].sort());

    // B 의 친구 id 로 시도 → 본인 user_id 격리로 빈 결과.
    const cross = await listEntriesFiltered({ friendId: b.friendIds.keep });
    expect(cross.length).toBe(0);
  });

  // ============================================================
  // [시나리오 16] category 필터
  // ============================================================
  it("[시나리오 16] categoryId 필터 — 본인 소유 카테고리의 entries 만, 타 user 카테고리 id 로는 결과 미노출", async () => {
    const a = await seedWorld(USER_A);
    const b = await seedWorld(USER_B);
    await asServiceRole(testDb, async () => {
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES
           ($1, $2, $3, 'A-mat', '2026-05-10', 'anytime', false),
           ($1, $2, $4, 'A-time', '2026-05-11', 'anytime', false),
           ($1, $2, $5, 'A-mind', '2026-05-12', 'anytime', false)`,
        [
          USER_A,
          a.friendIds.keep,
          a.categoryIds.material,
          a.categoryIds.time,
          a.categoryIds.mind,
        ],
      );
    });

    await actAs(USER_A);
    const { listEntriesFiltered } = await import(
      "@/lib/entries-list/queries"
    );

    const material = await listEntriesFiltered({
      categoryId: a.categoryIds.material,
    });
    expect(material.map((r) => r.memo)).toEqual(["A-mat"]);

    // B 의 카테고리 id 로 → 본인 user_id 격리로 빈 결과.
    const cross = await listEntriesFiltered({
      categoryId: b.categoryIds.material,
    });
    expect(cross.length).toBe(0);
  });

  // ============================================================
  // [시나리오 17] 날짜 범위 (inclusive 양 경계)
  // ============================================================
  it("[시나리오 17] from/to 날짜 범위 — 양 경계 inclusive, from 만 / to 만 / 둘 다 미지정 모두 정상", async () => {
    const a = await seedWorld(USER_A);
    await asServiceRole(testDb, async () => {
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid)
         VALUES
           ($1, $2, $3, 'before',     '2026-04-30', 'anytime', false),
           ($1, $2, $3, 'edge-from',  '2026-05-01', 'anytime', false),
           ($1, $2, $3, 'middle',     '2026-05-15', 'anytime', false),
           ($1, $2, $3, 'edge-to',    '2026-05-31', 'anytime', false),
           ($1, $2, $3, 'after',      '2026-06-01', 'anytime', false)`,
        [USER_A, a.friendIds.keep, a.categoryIds.material],
      );
    });

    await actAs(USER_A);
    const { listEntriesFiltered } = await import(
      "@/lib/entries-list/queries"
    );

    // 둘 다 — 양 경계 포함.
    const both = await listEntriesFiltered({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(both.map((r) => r.memo).sort()).toEqual(
      ["edge-from", "middle", "edge-to"].sort(),
    );

    // from 만.
    const fromOnly = await listEntriesFiltered({ from: "2026-05-15" });
    expect(fromOnly.map((r) => r.memo).sort()).toEqual(
      ["after", "edge-to", "middle"].sort(),
    );

    // to 만.
    const toOnly = await listEntriesFiltered({ to: "2026-05-01" });
    expect(toOnly.map((r) => r.memo).sort()).toEqual(
      ["before", "edge-from"].sort(),
    );
  });

  // ============================================================
  // [시나리오 18] 정렬 (recent / oldest)
  // ============================================================
  it("[시나리오 18] 정렬 — recent = received_date DESC + created_at DESC, oldest = ASC + ASC", async () => {
    const a = await seedWorld(USER_A);
    await asServiceRole(testDb, async () => {
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid, created_at)
         VALUES
           ($1, $2, $3, 'd1-c-early', '2026-05-10', 'anytime', false, '2026-05-10 06:00+09'),
           ($1, $2, $3, 'd1-c-late',  '2026-05-10', 'anytime', false, '2026-05-10 18:00+09'),
           ($1, $2, $3, 'd2',         '2026-05-12', 'anytime', false, '2026-05-12 09:00+09'),
           ($1, $2, $3, 'd0',         '2026-05-01', 'anytime', false, '2026-05-01 09:00+09')`,
        [USER_A, a.friendIds.keep, a.categoryIds.material],
      );
    });

    await actAs(USER_A);
    const { listEntriesFiltered } = await import(
      "@/lib/entries-list/queries"
    );

    const recent = await listEntriesFiltered({ sort: "recent" });
    expect(recent.map((r) => r.memo)).toEqual([
      "d2",
      "d1-c-late",
      "d1-c-early",
      "d0",
    ]);

    const oldest = await listEntriesFiltered({ sort: "oldest" });
    expect(oldest.map((r) => r.memo)).toEqual([
      "d0",
      "d1-c-early",
      "d1-c-late",
      "d2",
    ]);
  });

  // ============================================================
  // [시나리오 19] getRecentEntries 위임 정합 — 같은 데이터에서 같은 의미의 결과
  // ============================================================
  it("[시나리오 19] getRecentEntries(limit) 와 listEntriesFiltered({sort:'recent', limit}) 는 같은 memo 시퀀스를 만든다", async () => {
    const a = await seedWorld(USER_A);
    await asServiceRole(testDb, async () => {
      await testDb.pg.query(
        `INSERT INTO entries
           (user_id, friend_id, category_id, memo, received_date, repayment_timing, is_repaid, created_at)
         VALUES
           ($1, $2, $3, 'm-newest',     '2026-05-13', 'anytime', false, '2026-05-13 09:00+09'),
           ($1, $2, $3, 'm-tie-late',   '2026-05-12', 'anytime', false, '2026-05-12 12:00+09'),
           ($1, $2, $3, 'm-tie-early',  '2026-05-12', 'anytime', false, '2026-05-12 06:00+09'),
           ($1, $2, $3, 'm-old',        '2026-05-01', 'anytime', false, '2026-05-01 09:00+09')`,
        [USER_A, a.friendIds.keep, a.categoryIds.material],
      );
    });

    await actAs(USER_A);
    const { getRecentEntries } = await import("@/lib/dashboard/queries");
    const { listEntriesFiltered } = await import(
      "@/lib/entries-list/queries"
    );

    const recentByDashboard = await getRecentEntries(3);
    const recentByList = await listEntriesFiltered({ sort: "recent", limit: 3 });

    expect(recentByDashboard.map((r) => r.memo)).toEqual(
      recentByList.map((r) => r.memo),
    );
    // 양쪽 모두 정렬·limit 의미가 같음을 추가로 잠근다.
    expect(recentByList.map((r) => r.memo)).toEqual([
      "m-newest",
      "m-tie-late",
      "m-tie-early",
    ]);
  });
});
