import { and, asc, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { categories } from "@/db/schema/categories";
import { entries } from "@/db/schema/entries";
import { friends } from "@/db/schema/friends";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";
import type { Entry } from "@/lib/entries/types";
import { escapeLike } from "@/lib/utils/like-escape";

/**
 * `/entries` 페이지의 통합 검색·필터 쿼리 (결정 로그 008 §F + 정정-1 패턴).
 *
 *   - **application-layer 단일 방어선**: `eq(entries.user_id, currentUserId)` 명시.
 *     drizzle-orm 의 postgres-js 직결은 SUPERUSER 권한이라 RLS 가 자동 우회됨.
 *     application-layer 필터가 본 방어선, RLS 는 두 번째 방어선 (004 §"정정-1").
 *   - **친구 soft delete 처리**: `eq(friends.is_deleted, false)` — 삭제된 친구의 entries 미노출.
 *   - **카테고리 JOIN 평탄화**: category_name / category_icon / category_color.
 *   - **친구 JOIN 평탄화**: friend_name (UI 가 `showFriend` 모드에 사용).
 *   - **메모 검색 (q)**: PostgreSQL ILIKE + escapeLike (004 §D 친구 검색과 동일 패턴).
 *     `ILIKE '%' || escape(q) || '%'`. 빈/공백만 q 는 필터 미적용.
 *   - **친구·카테고리 필터**: id 등치 비교. 본인 소유 cross-check 는 user_id eq 가 자동 흡수.
 *   - **날짜 범위 (from/to)**: ISO 'YYYY-MM-DD' 문자열 그대로 비교 (received_date 가 date 타입).
 *     양 경계 inclusive. from/to 둘 중 하나 또는 둘 다 미지정 가능.
 *   - **정렬**: `received_date {DESC|ASC}, created_at {DESC|ASC}` (sort 토글에 따라 둘 다 같은 방향).
 *   - **limit 기본 50** — V1 페이지네이션 없음 (008 §D).
 *   - **E2E bypass 분기**: e2e-store(friends/categories/entries) 위에서 같은 의미의 결과 모사.
 *
 * 본 함수는 대시보드 위젯 A `getRecentEntries(limit)` 의 자연 superset 이다.
 * 008 §F "후속 영향": `getRecentEntries` 는 본 함수 위로 위임됐다 (008 §"M Task C" 채택).
 *
 * 통합 테스트(`tests/integration/entries-list/queries.test.ts`) 시나리오 13~19 가 의미 잠금.
 */

export type EntriesSort = "recent" | "oldest";

export type ListEntriesFilteredParams = {
  /** 메모 텍스트 검색 (case-insensitive substring). trim 후 빈 문자열은 무시. */
  q?: string;
  /** 친구 id 필터. 단일 친구. */
  friendId?: string;
  /** 카테고리 id 필터. 단일 카테고리. */
  categoryId?: string;
  /** received_date 시작 (ISO YYYY-MM-DD, 포함). */
  from?: string;
  /** received_date 끝 (ISO YYYY-MM-DD, 포함). */
  to?: string;
  /** 정렬. 기본 "recent" (received_date DESC, created_at DESC). */
  sort?: EntriesSort;
  /** 최대 반환 건수. 기본 50 (008 §D). */
  limit?: number;
};

const DEFAULT_LIMIT = 50;

/**
 * spec(`tests/unit/entries-list/escape-like.test.ts` 시나리오 20)이 본 모듈에서
 * `escapeLike` 가 export 되기를 요구한다. 008 §J 의 공용 util 통합 후에도
 * spec import 경로(`@/lib/entries-list/queries`)는 그대로 유지하기 위해 re-export.
 */
export { escapeLike };

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    // middleware 가 게이트하지만 사일런트 격리 사고 방지를 위해 명시적 throw.
    throw new Error("인증되지 않은 요청입니다.");
  }
  return user.id;
}

/**
 * /entries 통합 검색·필터 쿼리.
 *
 * 본격 SQL 결합 — 본인 user_id + friends.is_deleted=false + categories JOIN + 필터/정렬/limit.
 * E2E bypass 분기는 e2e-store 위에서 동일 의미로 동작.
 */
export async function listEntriesFiltered(
  params: ListEntriesFilteredParams = {},
): Promise<ReadonlyArray<Entry>> {
  const {
    q,
    friendId,
    categoryId,
    from,
    to,
    sort = "recent",
    limit = DEFAULT_LIMIT,
  } = params;

  if (isE2EBypassEnabled()) {
    return e2eListEntriesFiltered({
      q,
      friendId,
      categoryId,
      from,
      to,
      sort,
      limit,
    });
  }

  const userId = await requireUserId();

  const conditions: SQL[] = [
    eq(entries.user_id, userId),
    eq(friends.is_deleted, false),
  ];

  const qTrimmed = q?.trim();
  if (qTrimmed && qTrimmed.length > 0) {
    // PostgreSQL ILIKE + 와일드카드 escape. friends/queries.ts::listFriends 와 동일 패턴.
    conditions.push(ilike(entries.memo, `%${escapeLike(qTrimmed)}%`));
  }
  if (friendId) {
    // 본인 소유 cross-check 는 user_id eq 가 흡수 — 다른 user 의 friend_id 면 빈 결과.
    conditions.push(eq(entries.friend_id, friendId));
  }
  if (categoryId) {
    conditions.push(eq(entries.category_id, categoryId));
  }
  if (from) {
    conditions.push(gte(entries.received_date, from));
  }
  if (to) {
    conditions.push(lte(entries.received_date, to));
  }

  const orderDir = sort === "oldest" ? asc : desc;

  const rows = await db
    .select({
      id: entries.id,
      friend_id: entries.friend_id,
      category_id: entries.category_id,
      memo: entries.memo,
      received_date: entries.received_date,
      repayment_timing: entries.repayment_timing,
      repayment_specific_date: entries.repayment_specific_date,
      is_repaid: entries.is_repaid,
      created_at: entries.created_at,
      updated_at: entries.updated_at,
      friend_name: friends.name,
      category_name: categories.name,
      category_icon: categories.icon,
      category_color: categories.color,
    })
    .from(entries)
    .innerJoin(friends, eq(entries.friend_id, friends.id))
    .innerJoin(categories, eq(entries.category_id, categories.id))
    .where(and(...conditions))
    .orderBy(orderDir(entries.received_date), orderDir(entries.created_at))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    friend_id: r.friend_id,
    category_id: r.category_id,
    memo: r.memo,
    received_date: String(r.received_date),
    repayment_timing: r.repayment_timing,
    repayment_specific_date: r.repayment_specific_date
      ? String(r.repayment_specific_date)
      : null,
    is_repaid: r.is_repaid,
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    updated_at:
      r.updated_at instanceof Date
        ? r.updated_at.toISOString()
        : String(r.updated_at),
    friend_name: r.friend_name,
    category_name: r.category_name,
    category_icon: r.category_icon,
    category_color: r.category_color,
  }));
}

// ============================================================
// E2E bypass — in-memory e2e-store 위 모사 (006 §J + 007 §"E2E" 패턴)
// ============================================================

/**
 * E2E 분기: drizzle 대신 e2e-store(friends/entries/categories) 위에서 같은 의미의 결과를 만든다.
 * 통합 spec(시나리오 13~19) 은 pglite + drizzle 본체로 검증 — 본 함수는 Playwright 시나리오용.
 *
 * 친구 soft delete: e2eListFriends 가 이미 is_deleted=false 만 반환 → 그 친구들의 entries 만 합친다.
 */
async function e2eListEntriesFiltered(
  params: Required<
    Pick<ListEntriesFilteredParams, "sort" | "limit">
  > &
    Omit<ListEntriesFilteredParams, "sort" | "limit">,
): Promise<ReadonlyArray<Entry>> {
  const [{ e2eListFriends }, { e2eListCategories }, entriesModule] =
    await Promise.all([
      import("@/lib/friends/e2e-store"),
      import("@/lib/categories/e2e-store"),
      import("@/lib/entries/e2e-store"),
    ]);

  const liveFriends = e2eListFriends({});
  const cats = e2eListCategories();
  const catMap = new Map(cats.map((c) => [c.id, c] as const));
  const friendMap = new Map(liveFriends.map((f) => [f.id, f] as const));

  // soft-deleted 친구 entries 자연 제외 — e2eListEntriesByFriend 가 친구 lookup 시 null 이면 [] 반환.
  const all: Entry[] = [];
  for (const f of liveFriends) {
    const rows = await entriesModule.e2eListEntriesByFriend(f.id);
    for (const r of rows) {
      const friend = friendMap.get(r.friend_id);
      const cat = catMap.get(r.category_id);
      all.push({
        id: r.id,
        friend_id: r.friend_id,
        category_id: r.category_id,
        memo: r.memo,
        received_date: String(r.received_date),
        repayment_timing: r.repayment_timing,
        repayment_specific_date: r.repayment_specific_date
          ? String(r.repayment_specific_date)
          : null,
        is_repaid: r.is_repaid,
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
        updated_at:
          r.updated_at instanceof Date
            ? r.updated_at.toISOString()
            : String(r.updated_at),
        friend_name: friend?.name,
        category_name: r.category_name ?? cat?.name ?? "",
        category_icon: r.category_icon ?? cat?.icon ?? null,
        category_color: r.category_color ?? cat?.color ?? "#999999",
      });
    }
  }

  // 필터.
  const qTrimmed = params.q?.trim();
  const qLower = qTrimmed && qTrimmed.length > 0 ? qTrimmed.toLowerCase() : "";
  const filtered = all.filter((e) => {
    if (qLower && !e.memo.toLowerCase().includes(qLower)) return false;
    if (params.friendId && e.friend_id !== params.friendId) return false;
    if (params.categoryId && e.category_id !== params.categoryId) return false;
    if (params.from && e.received_date < params.from) return false;
    if (params.to && e.received_date > params.to) return false;
    return true;
  });

  // 정렬 — SQL 본체와 동일 규약.
  //
  // Array.sort 의미:
  //   - compare(a,b) < 0 → a 가 b 보다 앞.
  //   - compare(a,b) > 0 → a 가 b 보다 뒤.
  //
  // oldest (ASC): 작은 날짜가 앞 → a < b 이면 a 가 앞 → return 음수.
  // recent (DESC): 큰 날짜가 앞 → a < b 이면 a 가 뒤 → return 양수.
  //
  // 따라서 oldest 일 때 dir=-1, recent 일 때 dir=1 로 두면
  // `a.received_date < b.received_date ? dir : -dir` 가 양방향 모두 자연스럽게 정합한다.
  filtered.sort((a, b) => {
    const dir = params.sort === "oldest" ? -1 : 1;
    if (a.received_date !== b.received_date) {
      return a.received_date < b.received_date ? dir : -dir;
    }
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? dir : -dir;
    }
    return 0;
  });

  return filtered.slice(0, params.limit);
}
