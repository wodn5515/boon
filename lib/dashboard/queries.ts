import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { categories } from "@/db/schema/categories";
import { entries } from "@/db/schema/entries";
import { friends } from "@/db/schema/friends";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";
import { listEntriesFiltered } from "@/lib/entries-list/queries";
import { daysUntilBirthday } from "@/lib/friends/birthday";

import type {
  FriendCategoryDistribution,
  FriendGridCell,
  RecentEntry,
  ThisMonthSummary,
  UpcomingBirthday,
} from "./types";

/**
 * 대시보드 위젯이 사용하는 read 쿼리 본체 (결정 로그 007 §A·§C·§D·§E + 정정-1 패턴).
 *
 *   - **application-layer 단일 방어선**: 모든 query 가 `eq(*.user_id, currentUser.id)` 를
 *     명시한다 (정정-1, 004 §"sfx 라운드 1 🔴 #1"). RLS 는 두 번째 방어선.
 *   - **친구 soft delete 처리**: `friends.is_deleted = false` 만 노출 (006 §G).
 *   - **JOIN 평탄화**: 표시용 필드(friend_name / category_name / category_icon / category_color)를
 *     SQL JOIN 결과로 함께 평탄화.
 *   - **E2E bypass 모드 (`E2E_BYPASS_AUTH=1`)**: in-memory e2e-store 위에서 같은 의미의 결과를 모사.
 *     pglite 가 dev 서버 WASM 충돌로 안정적이지 않아 JS-only 모사 (004 §H 패턴).
 *
 * 통합 테스트(`tests/integration/dashboard/queries.test.ts`) 가 application + RLS 이중 통과를 함께 검증.
 */

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    // middleware 가 게이트하지만 사일런트 격리 사고 방지를 위해 명시적 throw.
    throw new Error("인증되지 않은 요청입니다.");
  }
  return user.id;
}

// ============================================================
// 위젯 A — 받은 신세 리스트
// ============================================================

/**
 * 위젯 A — 최근 받은 신세 N건.
 *
 * 008 §F·§"M Task C": `listEntriesFiltered({ sort: "recent", limit })` 의 자연 케이스라
 * 본 함수는 그 위로 위임된다. SQL 규약(정정-1 / friends.is_deleted=false / JOIN 평탄화 /
 * received_date DESC + created_at DESC) 은 listEntriesFiltered 가 단일 진실 원천으로 보유.
 *
 * 결과 형태(RecentEntry = Entry)도 동일 — 별도 변환 없음.
 *
 * @param limit 노출 건수. 기본 5.
 */
export async function getRecentEntries(
  limit: number = 5,
): Promise<ReadonlyArray<RecentEntry>> {
  return await listEntriesFiltered({ sort: "recent", limit });
}

// ============================================================
// 위젯 B — 친구별 카드 그리드
// ============================================================

/**
 * 위젯 B — 신세 많이 받은 친구 그리드 (007 §C + 결정 로그 011 §C-3).
 *
 * 정렬: 받은 신세 수 DESC, name ASC tiebreak. count=0 친구도 포함 (LEFT JOIN).
 * 각 친구의 가장 최근 entry.memo 한 줄 동봉 (received_date DESC 의 1건).
 * 필터: 본인 user_id + friends.is_deleted=false.
 *
 * 결정 로그 011 §C-3 — N+1 제거:
 *   - 이전 구현은 친구 + count 집계 1회 + 친구별 최근 메모 N회 = 총 N+1 쿼리.
 *   - 본 구현은 PR #8 `matchFriendsByName` 패턴 (LEFT JOIN LATERAL) 을 재활용해 단일 SQL.
 *   - inner subquery 도 `user_id = ${userId}` 명시 — 정정-1 패턴 (CLAUDE.md §10 / 004 §sfx 🔴 #1)
 *     이 application-layer 양 끝에서 격리됨을 잠금. RLS 가 두 번째 방어선이지만 application 단에서
 *     명시하면 RLS 가 잠시 비활성된 환경에서도 사일런트 격리 사고를 차단한다.
 *
 * @param limit 노출 건수. 기본 6.
 */
export async function getTopFriends(
  limit: number = 6,
): Promise<ReadonlyArray<FriendGridCell>> {
  if (isE2EBypassEnabled()) {
    return e2eGetTopFriends(limit);
  }
  const userId = await requireUserId();

  // 단일 SQL — recent_memo 는 SELECT 절의 scalar subquery 로 인라인.
  //   - 외부: friends LEFT JOIN entries — count=0 친구 보존 + GROUP BY 집계.
  //   - scalar subquery: 각 친구의 entries 중 received_date DESC, created_at DESC LIMIT 1 메모.
  //     subquery 안에서 `entries.user_id = ${userId}` 를 명시 (정정-1).
  //   - drizzle 의 query builder 위에서 1번의 `$client.query` 만 발생 — N+1 제거 (011 §C-3).
  //   - LEFT JOIN LATERAL 대신 scalar subquery 채택 사유: GROUP BY 의 recent.memo 추가 의존성을
  //     피해 의미를 명료하게. 두 방식 모두 단일 쿼리이고 PostgreSQL 옵티마이저가 동등 plan 을 만든다.
  const friendRows = await db
    .select({
      id: friends.id,
      name: friends.name,
      birthday_month: friends.birthday_month,
      birthday_day: friends.birthday_day,
      entry_count: sql<number>`count(${entries.id})::int`,
      recent_memo: sql<string | null>`(
        SELECT ${entries.memo}
        FROM ${entries}
        WHERE ${entries.friend_id} = ${friends.id}
          AND ${entries.user_id} = ${userId}
        ORDER BY ${entries.received_date} DESC, ${entries.created_at} DESC
        LIMIT 1
      )`,
    })
    .from(friends)
    .leftJoin(
      entries,
      and(
        eq(entries.friend_id, friends.id),
        eq(entries.user_id, userId),
      ),
    )
    .where(
      and(
        eq(friends.user_id, userId),
        eq(friends.is_deleted, false),
      ),
    )
    .groupBy(friends.id, friends.name, friends.birthday_month, friends.birthday_day)
    .orderBy(
      desc(sql`count(${entries.id})`),
      asc(friends.name),
    )
    .limit(limit);

  return friendRows.map((f) => ({
    id: f.id,
    name: f.name,
    birthday_month: f.birthday_month,
    birthday_day: f.birthday_day,
    entry_count: Number(f.entry_count ?? 0),
    recent_memo: f.recent_memo ?? null,
  }));
}

// ============================================================
// 위젯 C — 다가오는 생일
// ============================================================

/**
 * 위젯 C — 30일 슬라이딩 윈도우 안의 친구 생일 + 최근 메모 1~3건 (007 §D).
 *
 * 1) 후보 친구: 본인 + is_deleted=false + birthday_month·day not null.
 * 2) JS 단에서 daysUntilBirthday() 계산 후 (0 ≤ d ≤ days) 필터 + D-N ASC 정렬.
 *    - PostgreSQL date arithmetic 으로 SQL 안에서 처리할 수도 있으나, 친구 수가 보통 수십이라
 *      JS aggregate 가 충분히 저렴하고 lib/friends/birthday.ts::daysUntilBirthday 와 의미 일관.
 * 3) 결과 친구들의 최근 entries 메모 1~3건을 한 쿼리에 묶어 가져옴 (N+1 회피).
 *
 * @param days "오늘부터 N 일 이내" 윈도우. 기본 30 (PRD §3 "이번 달 생일").
 */
export async function getUpcomingBirthdays(
  days: number = 30,
): Promise<ReadonlyArray<UpcomingBirthday>> {
  if (isE2EBypassEnabled()) {
    return e2eGetUpcomingBirthdays(days);
  }
  const userId = await requireUserId();

  const candidates = await db
    .select({
      id: friends.id,
      name: friends.name,
      birthday_month: friends.birthday_month,
      birthday_day: friends.birthday_day,
    })
    .from(friends)
    .where(
      and(
        eq(friends.user_id, userId),
        eq(friends.is_deleted, false),
        isNotNull(friends.birthday_month),
        isNotNull(friends.birthday_day),
      ),
    );

  const now = new Date();
  const within = candidates
    .map((f) => {
      const d = daysUntilBirthday(f.birthday_month, f.birthday_day, now);
      if (d == null) return null;
      if (d < 0 || d > days) return null;
      return {
        friend_id: f.id,
        friend_name: f.name,
        // null 체크는 isNotNull 로 보장됐지만 타입 좁히기 위해 한번 더.
        birthday_month: f.birthday_month!,
        birthday_day: f.birthday_day!,
        days_until: d,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => a.days_until - b.days_until);

  if (within.length === 0) return [];

  // 각 친구의 최근 entries 메모 최대 3건 — N+1 쿼리. 윈도우 안 친구 수가 적어 비용 무시.
  const memoMap = new Map<string, string[]>();
  await Promise.all(
    within.map(async (w) => {
      const rows = await db
        .select({ memo: entries.memo })
        .from(entries)
        .where(
          and(
            eq(entries.user_id, userId),
            eq(entries.friend_id, w.friend_id),
          ),
        )
        .orderBy(desc(entries.received_date), desc(entries.created_at))
        .limit(3);
      memoMap.set(
        w.friend_id,
        rows.map((r) => r.memo),
      );
    }),
  );

  return within.map((w) => ({
    friend_id: w.friend_id,
    friend_name: w.friend_name,
    birthday_month: w.birthday_month,
    birthday_day: w.birthday_day,
    days_until: w.days_until,
    recent_memos: memoMap.get(w.friend_id) ?? [],
  }));
}

// ============================================================
// 위젯 D — 이번 달 요약
// ============================================================

/**
 * 위젯 D — 이번 달 요약 (007 §E).
 *
 *   - count        = 이번 달 received_date 의 entries 수.
 *   - prev_month_count = 지난 달 entries 수 (없는 사용자는 null — 첫 사용 시 비교 카피 회피).
 *   - by_category  = 이번 달 entries 를 category_id 로 GROUP BY, **sortCategories 순** 으로 정렬
 *                    (is_system DESC + sort_order ASC). count DESC 거절 — 시각 안정성 우선 (007 §E).
 *   - top_friends  = 이번 달 entries 를 friend_id 로 GROUP BY, count DESC LIMIT 3 + count>0 만.
 *
 * 본 슬라이스에서 "이번 달" 의 자연어 정의는 호출 시점 사용자의 로컬 month (Asia/Seoul 가정 — PRD §6 ko-KR).
 * pglite + Node 의 시스템 시간을 그대로 사용 — 테스트 spec(`thisMonthDate` 헬퍼)과 정합.
 */
export async function getThisMonthSummary(): Promise<ThisMonthSummary> {
  if (isE2EBypassEnabled()) {
    return e2eGetThisMonthSummary();
  }
  const userId = await requireUserId();

  const now = new Date();
  const { from: thisMonthFrom, to: thisMonthTo } = monthRange(now, 0);
  const { from: lastMonthFrom, to: lastMonthTo } = monthRange(now, -1);

  // 이번 달 count.
  const [thisCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entries)
    .where(
      and(
        eq(entries.user_id, userId),
        sql`${entries.received_date} >= ${thisMonthFrom}`,
        sql`${entries.received_date} <= ${thisMonthTo}`,
      ),
    );
  const count = Number(thisCountRow?.count ?? 0);

  // 지난 달 count — null fallback 없이 0 도 표시할 수 있도록 number 로 반환.
  // 결정 로그 007 §E 와 디자이너 결정 (mock 의 prev_month_count: 7) 모두 number 그대로.
  const [prevCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entries)
    .where(
      and(
        eq(entries.user_id, userId),
        sql`${entries.received_date} >= ${lastMonthFrom}`,
        sql`${entries.received_date} <= ${lastMonthTo}`,
      ),
    );
  const prevMonthCount = Number(prevCountRow?.count ?? 0);

  // byCategory — 이번 달 GROUP BY + 카테고리 JOIN + sortCategories 순 정렬.
  // SQL 단에서 ORDER BY is_system DESC, sort_order ASC 로 sortCategories 와 동일.
  const byCategoryRows = await db
    .select({
      category_id: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      is_system: categories.is_system,
      sort_order: categories.sort_order,
      count: sql<number>`count(${entries.id})::int`,
    })
    .from(entries)
    .innerJoin(categories, eq(entries.category_id, categories.id))
    .where(
      and(
        eq(entries.user_id, userId),
        sql`${entries.received_date} >= ${thisMonthFrom}`,
        sql`${entries.received_date} <= ${thisMonthTo}`,
      ),
    )
    .groupBy(
      categories.id,
      categories.name,
      categories.icon,
      categories.color,
      categories.is_system,
      categories.sort_order,
    )
    .orderBy(desc(categories.is_system), asc(categories.sort_order));

  // topFriends — 이번 달 GROUP BY friend_id, count DESC LIMIT 3 + count>0 만.
  const topFriendRows = await db
    .select({
      friend_id: friends.id,
      name: friends.name,
      count: sql<number>`count(${entries.id})::int`,
    })
    .from(entries)
    .innerJoin(friends, eq(entries.friend_id, friends.id))
    .where(
      and(
        eq(entries.user_id, userId),
        eq(friends.is_deleted, false),
        sql`${entries.received_date} >= ${thisMonthFrom}`,
        sql`${entries.received_date} <= ${thisMonthTo}`,
      ),
    )
    .groupBy(friends.id, friends.name)
    .orderBy(desc(sql`count(${entries.id})`), asc(friends.name))
    .limit(3);

  return {
    count,
    prev_month_count: prevMonthCount,
    by_category: byCategoryRows.map((r) => ({
      category_id: r.category_id,
      name: r.name,
      icon: r.icon,
      color: r.color,
      count: Number(r.count ?? 0),
    })),
    top_friends: topFriendRows.map((r) => ({
      friend_id: r.friend_id,
      name: r.name,
      count: Number(r.count ?? 0),
    })),
  };
}

// ============================================================
// /friends/[id] 통계 카드 — 옵션 (in-memory aggregate 가 기본, 007 §F)
// ============================================================

/**
 * /friends/[id] 통계 카드 — 그 친구한테 받은 entries 의 카테고리 분포 (007 §F).
 *
 * 운영상 친구 상세 페이지는 이미 listEntriesByFriend 결과를 받아 in-memory aggregate 로
 * 처리한다 (`app/(authenticated)/friends/[id]/page.tsx::aggregateByCategory`). 본 함수는
 * 다른 호출자(예: V2 API)에서 직접 SQL aggregate 가 필요할 때 쓰는 보조 export.
 *
 * 정렬: count DESC, name ASC tiebreak (페이지 단의 aggregateByCategory 와 동일 규약).
 * 친구 soft delete 시 빈 배열.
 */
export async function getFriendCategoryDistribution(
  friendId: string,
): Promise<FriendCategoryDistribution> {
  if (isE2EBypassEnabled()) {
    return e2eGetFriendCategoryDistribution(friendId);
  }
  const userId = await requireUserId();

  // soft delete 친구는 빈 결과.
  const [friend] = await db
    .select({ id: friends.id })
    .from(friends)
    .where(
      and(
        eq(friends.id, friendId),
        eq(friends.user_id, userId),
        eq(friends.is_deleted, false),
      ),
    )
    .limit(1);
  if (!friend) return [];

  const rows = await db
    .select({
      category_id: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      count: sql<number>`count(${entries.id})::int`,
    })
    .from(entries)
    .innerJoin(categories, eq(entries.category_id, categories.id))
    .where(
      and(
        eq(entries.user_id, userId),
        eq(entries.friend_id, friendId),
      ),
    )
    .groupBy(categories.id, categories.name, categories.icon, categories.color)
    .orderBy(desc(sql`count(${entries.id})`), asc(categories.name));

  return rows.map((r) => ({
    category_id: r.category_id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    count: Number(r.count ?? 0),
  }));
}

// ============================================================
// 헬퍼 — 월 범위 (YYYY-MM-DD)
// ============================================================

/**
 * 호출 시점 기준 month offset 의 첫 날 / 마지막 날 ISO date 문자열 반환.
 * offset = 0 이면 이번 달, -1 이면 지난 달.
 *
 * received_date 는 date 컬럼이라 시각이 없다 → 문자열 비교가 자연. 시간대 흔들림 없음.
 */
function monthRange(now: Date, offsetMonths: number): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth() + offsetMonths; // -1 = 지난 달
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0); // 다음 달 0일 = 이번 달 말일
  return { from: toIsoDate(first), to: toIsoDate(last) };
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

// ============================================================
// E2E bypass 모드 — in-memory e2e-store 위 모사
// ============================================================

/**
 * E2E 분기: drizzle 대신 e2e-store(friends/entries/categories) 위에서 같은 의미의 결과를 만든다.
 * 통합 테스트가 아니라 Playwright 시나리오 통과용 모사. RLS/정합성은 pglite 통합이 담당.
 */

// e2eGetRecentEntries / toRecentEntry 는 getRecentEntries 가 listEntriesFiltered 로 위임되며 제거됐다.
// E2E 분기는 lib/entries-list/queries.ts::e2eListEntriesFiltered 가 단일 진실 원천.

async function e2eGetTopFriends(
  limit: number,
): Promise<ReadonlyArray<FriendGridCell>> {
  const [{ e2eListFriends }, entriesModule] = await Promise.all([
    import("@/lib/friends/e2e-store"),
    import("@/lib/entries/e2e-store"),
  ]);
  const friendsRows = e2eListFriends({});
  const cells: FriendGridCell[] = [];
  for (const f of friendsRows) {
    const ents = await entriesModule.e2eListEntriesByFriend(f.id);
    // listEntriesByFriend 가 이미 received_date DESC + created_at DESC 정렬.
    const recent = ents[0]?.memo ?? null;
    cells.push({
      id: f.id,
      name: f.name,
      birthday_month: f.birthday_month,
      birthday_day: f.birthday_day,
      entry_count: ents.length,
      recent_memo: recent,
    });
  }
  cells.sort((a, b) => {
    if (b.entry_count !== a.entry_count) return b.entry_count - a.entry_count;
    return a.name.localeCompare(b.name, "ko");
  });
  return cells.slice(0, limit);
}

async function e2eGetUpcomingBirthdays(
  days: number,
): Promise<ReadonlyArray<UpcomingBirthday>> {
  const [{ e2eListFriends }, entriesModule] = await Promise.all([
    import("@/lib/friends/e2e-store"),
    import("@/lib/entries/e2e-store"),
  ]);
  const all = e2eListFriends({});
  const now = new Date();
  const items: UpcomingBirthday[] = [];
  for (const f of all) {
    if (f.birthday_month == null || f.birthday_day == null) continue;
    const d = daysUntilBirthday(f.birthday_month, f.birthday_day, now);
    if (d == null || d < 0 || d > days) continue;
    const ents = await entriesModule.e2eListEntriesByFriend(f.id);
    const recent_memos = ents.slice(0, 3).map((e) => e.memo);
    items.push({
      friend_id: f.id,
      friend_name: f.name,
      birthday_month: f.birthday_month,
      birthday_day: f.birthday_day,
      days_until: d,
      recent_memos,
    });
  }
  items.sort((a, b) => a.days_until - b.days_until);
  return items;
}

async function e2eGetThisMonthSummary(): Promise<ThisMonthSummary> {
  const [{ e2eListFriends }, { e2eListCategories }, entriesModule] =
    await Promise.all([
      import("@/lib/friends/e2e-store"),
      import("@/lib/categories/e2e-store"),
      import("@/lib/entries/e2e-store"),
    ]);
  const now = new Date();
  const { from, to } = monthRange(now, 0);
  const { from: pFrom, to: pTo } = monthRange(now, -1);

  const allFriends = e2eListFriends({});
  // friend 별 entries 를 모두 모은다 (e2e 시연 규모는 작아 비용 무시).
  let count = 0;
  let prevCount = 0;
  const byCatCount = new Map<string, number>();
  const byFriendCount = new Map<string, { friend_id: string; name: string; count: number }>();
  for (const f of allFriends) {
    const ents = await entriesModule.e2eListEntriesByFriend(f.id);
    for (const e of ents) {
      const rd = String(e.received_date);
      if (rd >= from && rd <= to) {
        count += 1;
        byCatCount.set(e.category_id, (byCatCount.get(e.category_id) ?? 0) + 1);
        const prev = byFriendCount.get(f.id);
        byFriendCount.set(f.id, {
          friend_id: f.id,
          name: f.name,
          count: (prev?.count ?? 0) + 1,
        });
      } else if (rd >= pFrom && rd <= pTo) {
        prevCount += 1;
      }
    }
  }

  // byCategory: sortCategories 순 (is_system DESC + sort_order ASC).
  const cats = e2eListCategories();
  const by_category = cats
    .filter((c) => (byCatCount.get(c.id) ?? 0) > 0)
    .map((c) => ({
      category_id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      count: byCatCount.get(c.id) ?? 0,
    }));

  const top_friends = [...byFriendCount.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, "ko");
    })
    .slice(0, 3);

  return {
    count,
    prev_month_count: prevCount,
    by_category,
    top_friends,
  };
}

async function e2eGetFriendCategoryDistribution(
  friendId: string,
): Promise<FriendCategoryDistribution> {
  const entriesModule = await import("@/lib/entries/e2e-store");
  const ents = await entriesModule.e2eListEntriesByFriend(friendId);
  if (ents.length === 0) return [];

  const bucket = new Map<
    string,
    {
      category_id: string;
      name: string;
      icon: string | null;
      color: string;
      count: number;
    }
  >();
  for (const e of ents) {
    const prev = bucket.get(e.category_id);
    if (prev) {
      bucket.set(e.category_id, { ...prev, count: prev.count + 1 });
    } else {
      bucket.set(e.category_id, {
        category_id: e.category_id,
        name: e.category_name,
        icon: e.category_icon,
        color: e.category_color,
        count: 1,
      });
    }
  }
  return [...bucket.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name, "ko");
  });
}
