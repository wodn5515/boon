/**
 * 대시보드 위젯이 공유하는 UI 도메인 타입.
 *
 * 디자이너 골격에서 위젯 컴포넌트들이 받는 props 형태를 한 곳에 모은다.
 * worker 가 lib/dashboard/queries.ts 의 실제 SQL 결합 시 그대로 반환 타입을 채워주면 된다.
 *
 * PRD §3 메인 대시보드 위젯 A·B·C·D 명세 그대로 — 점수/잔고/소셜 필드 없음 (D-010, D-011).
 *
 * snake_case 유지 (PRD §4 데이터 모델 정합).
 */

import type { Entry } from "@/lib/entries/types";

/**
 * 위젯 A — 받은 신세 리스트.
 *
 * 기존 Entry UI 도메인 타입을 그대로 재사용한다 (EntryItem 호환).
 * 위젯 컴포넌트는 ReadonlyArray<Entry> 를 받아 EntryItem 으로 렌더한다.
 */
export type RecentEntry = Entry;

/**
 * 위젯 B — 친구별 카드 그리드 셀.
 *
 * 친구 정보 + 받은 신세 수 + 최근 신세 메모 + 생일 D-N (헬퍼로 라벨화).
 * `recent_memo` 는 표시 편의를 위한 가장 최근 received_date 의 entry.memo 한 줄.
 */
export type FriendGridCell = {
  id: string;
  name: string;
  birthday_month: number | null;
  birthday_day: number | null;
  entry_count: number;
  /** 가장 최근 받은 신세 메모 1줄 (없으면 null). */
  recent_memo: string | null;
};

/**
 * 위젯 C — 다가오는 생일 + 그 친구한테 받은 신세 모음.
 *
 * 이번 달(또는 오늘 ~ 30일 내) 생일 친구 1명에 대해
 * "선물 영감" 용으로 그 친구한테서 받은 entries 1~3건을 동봉한다.
 *
 * `recent_memos` 는 메모 string 1~3개. EntryItem 카드 풀스택이 아닌 텍스트 회상으로만 노출.
 */
export type UpcomingBirthday = {
  friend_id: string;
  friend_name: string;
  birthday_month: number;
  birthday_day: number;
  /** D-N 까지 일수. 0 = 오늘. */
  days_until: number;
  /** 그 친구한테서 받은 최근 신세 메모 0~3건. */
  recent_memos: ReadonlyArray<string>;
};

/**
 * 위젯 D — 이번 달 요약.
 *
 * 세 영역(숫자 강조 / 카테고리 분포 / Top 3 친구) 결합.
 *
 * `prev_month_count` 는 옵션 — 있으면 "지난 달 N건 → 이번 달 M건" 비교 카피로 노출.
 */
export type ThisMonthSummary = {
  /** 이번 달 받은 신세 총 건수. */
  count: number;
  /** 지난 달 건수 (null 이면 비교 카피 미노출). */
  prev_month_count: number | null;
  /** 카테고리별 분포. count DESC 정렬. */
  by_category: ReadonlyArray<{
    category_id: string;
    name: string;
    icon: string | null;
    color: string;
    count: number;
  }>;
  /** 신세 많이 받은 친구 Top 3 (count DESC). */
  top_friends: ReadonlyArray<{
    friend_id: string;
    name: string;
    count: number;
  }>;
};

/**
 * /friends/[id] 통계 카드.
 *
 * 친구 한 명에 대한 received entries 의 카테고리 분포.
 */
export type FriendCategoryDistribution = ReadonlyArray<{
  category_id: string;
  name: string;
  icon: string | null;
  color: string;
  count: number;
}>;
