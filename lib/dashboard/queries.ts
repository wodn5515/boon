/**
 * 대시보드 위젯이 사용하는 read 쿼리 시그니처.
 *
 * 본 파일은 디자이너 골격 단계에서 **placeholder** 만 정의한다. 위젯 컴포넌트들은
 * 시그니처와 반환 타입만 의지하고, worker 는 다음 결합 라운드에서 실제 drizzle 쿼리
 * 본체를 채워 넣는다.
 *
 * 동작 원칙 (다른 도메인 read 쿼리와 동일 — 정정-1 패턴):
 *   - application-layer 단일 방어선: `user_id` WHERE 절을 명시.
 *   - 친구 soft delete 처리: `friends.is_deleted = false` 만 노출.
 *   - 카테고리·친구 JOIN: 표시용 필드(name/icon/color/recent_memo) 평탄화.
 *   - E2E bypass 모드(`isE2EBypassEnabled()`): 인메모리 스토어 분기 — worker 가 채움.
 *
 * 디자이너 골격은 mock 데이터(`lib/dashboard/mock.ts`) 로 시연하며, 본 placeholder 들은
 * `throw new Error(...)` 로 호출 시 명확히 실패한다 — page 가 mock 으로 직결되는 동안
 * 실수로 결합되지 않게 하기 위한 가드.
 */

import type {
  FriendCategoryDistribution,
  FriendGridCell,
  RecentEntry,
  ThisMonthSummary,
  UpcomingBirthday,
} from "./types";

const NOT_YET = "[dashboard] worker 결합 대기 중 — placeholder. mock 을 사용 중일 것.";

/**
 * 위젯 A — 받은 신세 리스트.
 *
 * 정렬: received_date DESC, created_at DESC (entries.queries 와 동일 규약).
 * JOIN: friends.name + categories.{name,icon,color} 평탄화.
 * 필터: 본인 user_id + friends.is_deleted=false.
 *
 * @param limit 노출 건수. 기본 5.
 */
export async function getRecentEntries(
  _limit: number = 5,
): Promise<ReadonlyArray<RecentEntry>> {
  void _limit;
  throw new Error(NOT_YET);
}

/**
 * 위젯 B — 친구별 카드 그리드.
 *
 * 정렬 기준: 디자이너 위임 결정 → **받은 신세 수 DESC**.
 *   - 회상 노트 톤상 "최근 활동" 보다 "누적 인연" 이 위젯 B 의 의도에 부합.
 *   - 다만 신세 0 인 친구도 노출되어야 친구 추가 직후 친구 그리드가 비어보이지 않으므로,
 *     count DESC 후 name ASC tiebreak.
 *
 * JOIN: friends + 각 친구의 entries 집계(count) + 가장 최근 entry.memo.
 * 필터: 본인 user_id + friends.is_deleted=false.
 *
 * @param limit 노출 건수. 기본 6.
 */
export async function getTopFriends(
  _limit: number = 6,
): Promise<ReadonlyArray<FriendGridCell>> {
  void _limit;
  throw new Error(NOT_YET);
}

/**
 * 위젯 C — 다가오는 생일.
 *
 * 친구 중 birthday_month/day 가 모두 채워진 사람에 대해 D-N 을 계산하고,
 * 0 ≤ D-N ≤ days 범위만 노출. D-N ASC 정렬.
 *
 * 각 친구마다 그 친구한테 받은 entries 중 최근 0~3 건의 memo 를 함께 가져온다.
 *
 * @param days "오늘부터 N 일 이내" 윈도우. 기본 30 (PRD §3 "이번 달 생일").
 */
export async function getUpcomingBirthdays(
  _days: number = 30,
): Promise<ReadonlyArray<UpcomingBirthday>> {
  void _days;
  throw new Error(NOT_YET);
}

/**
 * 위젯 D — 이번 달 요약.
 *
 * "이번 달" = 호출 시점 사용자의 로컬 month (Asia/Seoul 가정 — PRD §6 ko-KR).
 * 결과 한 덩어리로 묶어 반환 (페이지 RSC 가 한 번에 fetch).
 *
 * 산정:
 *   - count = 이번 달 entries 수
 *   - prev_month_count = 지난 달 entries 수 (null 가능 — 첫 사용자)
 *   - by_category = 이번 달 entries 를 category_id 로 GROUP BY 후 categories JOIN
 *   - top_friends = 이번 달 entries 를 friend_id 로 GROUP BY 후 friends JOIN, count DESC LIMIT 3
 */
export async function getThisMonthSummary(): Promise<ThisMonthSummary> {
  throw new Error(NOT_YET);
}

/**
 * /friends/[id] 통계 카드 — 그 친구한테 받은 entries 의 카테고리 분포.
 *
 * 정렬: count DESC, categories.sort_order ASC tiebreak.
 * 친구 soft delete 시 빈 배열.
 */
export async function getFriendCategoryDistribution(
  _friendId: string,
): Promise<FriendCategoryDistribution> {
  void _friendId;
  throw new Error(NOT_YET);
}
