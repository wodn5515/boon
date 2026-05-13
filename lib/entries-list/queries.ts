import type { Entry } from "@/lib/entries/types";

import { MOCK_ENTRIES } from "./mock";

/**
 * `/entries` 페이지의 통합 검색·필터 쿼리 시그니처 (결정 로그 008 §F).
 *
 * 디자이너 라운드 — 시그니처와 mock 위 골격 필터만 정의한다. worker 라운드에서
 * drizzle 본체로 교체 + E2E bypass 분기 + mock 분기/파일 삭제.
 *
 * 본 함수는 대시보드 위젯 A 의 `getRecentEntries(limit)` 의 자연 superset 이다.
 *   - `listEntriesFiltered({ limit, sort: "recent" })` == `getRecentEntries(limit)` (필터 미지정 시).
 *   - worker 가 두 함수를 한 본체로 통합할지(`getRecentEntries` 가 본 함수 위로 위임)는
 *     본격 SQL 결합 시 판단. 시그니처는 같은 의미를 유지.
 *
 * SQL 결합 시 worker 가 따라야 할 규약 (006 §B·§G + 정정-1 패턴):
 *   - **application-layer 단일 방어선**: `eq(entries.user_id, currentUserId)` 명시.
 *   - **친구 soft delete 처리**: `eq(friends.is_deleted, false)` — 삭제된 친구의 entries 미노출.
 *   - **카테고리 JOIN 평탄화**: category_name / category_icon / category_color.
 *   - **친구 JOIN 평탄화**: friend_name (UI 가 `showFriend` 모드에 사용).
 *   - **메모 검색 (q)**: PostgreSQL ILIKE + escapeLike (004 §D 친구 검색과 동일 패턴).
 *     `ILIKE '%' || escape(q) || '%'`.
 *   - **친구·카테고리 필터**: id 등치 비교, 본인 소유 cross-check 는 위 user_id 필터로 충분.
 *   - **날짜 범위 (from/to)**: ISO 'YYYY-MM-DD' 문자열 그대로 비교 (received_date 가 date 타입).
 *     from/to 둘 중 하나 또는 둘 다 미지정 가능.
 *   - **정렬**: `received_date {DESC|ASC}, created_at {DESC|ASC}` (sort 토글에 따라 둘 다 같은 방향).
 *   - **limit 기본 50** — V1 페이지네이션 없음 (008 §D).
 *   - **E2E bypass 분기**: e2e-store(friends/categories/entries) 위 모사 — 기존 dashboard.queries 패턴.
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
 * /entries 통합 검색·필터 쿼리.
 *
 * **디자이너 라운드 placeholder**: 현재 MOCK_ENTRIES 위에서 모든 필터 조건을 동일 의미로 골격 구현.
 * worker 가 본격 SQL 결합 시 본 mock 분기를 모두 drizzle 본체로 교체한다.
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

  const qNorm = q?.trim().toLowerCase();
  const fromNorm = from?.trim();
  const toNorm = to?.trim();

  let rows: Entry[] = MOCK_ENTRIES.filter((e) => {
    if (qNorm && qNorm.length > 0 && !e.memo.toLowerCase().includes(qNorm)) {
      return false;
    }
    if (friendId && e.friend_id !== friendId) return false;
    if (categoryId && e.category_id !== categoryId) return false;
    if (fromNorm && e.received_date < fromNorm) return false;
    if (toNorm && e.received_date > toNorm) return false;
    return true;
  });

  rows.sort((a, b) => {
    // 1차: received_date, 2차: created_at. 정렬 방향은 sort 에 따라 결정.
    const dir = sort === "oldest" ? 1 : -1;
    if (a.received_date !== b.received_date) {
      return a.received_date < b.received_date ? dir : -dir;
    }
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? dir : -dir;
    }
    return 0;
  });

  rows = rows.slice(0, limit);
  return rows;
}
