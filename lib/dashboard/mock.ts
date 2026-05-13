/**
 * 대시보드 위젯 디자이너 골격 시연용 mock 데이터.
 *
 * **worker 가 db 결합 시 제거 대상**. 페이지(`app/(authenticated)/page.tsx`,
 * `app/(authenticated)/friends/[id]/page.tsx`)에서 import 하는 mock 함수만 교체하면 된다.
 *
 * 의도:
 *   - 각 위젯의 모든 분기(빈 상태 / 적은 데이터 / 차트 분포 / Top 3 / D-N 라벨)를
 *     디자이너가 한 번에 시각 검증할 수 있게 분포를 다양하게 잡았다.
 *   - 시각 검증용이라 PRD 데이터 모델과 정합한 snake_case + 4종 enum 그대로.
 *   - 빈 상태도 함께 시연하려면 USE_EMPTY 변수로 전환 — V1 골격에선 false (데이터 있는 톤).
 *
 * 디자이너 결정:
 *   - 메모는 회상 노트 톤("바람 빠진 자전거 같이 끌고 가줘서") — 강박 톤 회피
 *   - 카테고리 3종 + 사용자 카테고리 1종("취향") 로 차트 분포 4 슬라이스
 *   - 친구 5명 (Top 3 + 그 외 2명) — 위젯 B 6개 슬롯 중 5개 채워 빈 슬롯 1 시연
 *   - 다가오는 생일 2명 (이번 달 D-7, 다음 달 D-22) — 정렬 시연
 *
 * 시각화에 영향을 주지 않는 한 worker 가 자유롭게 교체 가능.
 */

import type {
  FriendCategoryDistribution,
  FriendGridCell,
  RecentEntry,
  ThisMonthSummary,
  UpcomingBirthday,
} from "./types";

/** 위젯 동작을 한 눈에 보여주는 mock 사용자 이메일. */
export const MOCK_USER_LABEL = "친구";

/* eslint-disable @typescript-eslint/no-unused-vars */

// 디자이너 골격은 "데이터 있는" 톤을 기본으로 시연. 빈 상태 시연이 필요하면 true 로 토글.
const USE_EMPTY = false;

/**
 * "오늘부터 N 일 전" 형식의 ISO date (YYYY-MM-DD). 페이지 렌더 시점 기준이라
 * 매 RSC 호출마다 받은 날짜가 자연스럽게 갱신된다.
 */
function daysAgo(n: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 이번 달 첫 날부터 며칠째인지로 카테고리 분포 사실감을 살린다. */
function dayOfMonth(n: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), n);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

// 안정된 mock UUID. 모든 위젯이 같은 friend_id 를 가리켜 일관된 시연.
const FRIEND_IDS = {
  hye: "00000000-0000-0000-0000-000000000001",
  jun: "00000000-0000-0000-0000-000000000002",
  min: "00000000-0000-0000-0000-000000000003",
  yu: "00000000-0000-0000-0000-000000000004",
  yoon: "00000000-0000-0000-0000-000000000005",
} as const;

const CATEGORY_IDS = {
  material: "00000000-0000-0000-0000-0000000000a1",
  time: "00000000-0000-0000-0000-0000000000a2",
  mind: "00000000-0000-0000-0000-0000000000a3",
  taste: "00000000-0000-0000-0000-0000000000a4",
} as const;

// === 위젯 A — 받은 신세 리스트 mock ============================

export async function mockGetRecentEntries(
  limit: number = 5,
): Promise<ReadonlyArray<RecentEntry>> {
  if (USE_EMPTY) return [];
  const rows: RecentEntry[] = [
    {
      id: "e1",
      friend_id: FRIEND_IDS.hye,
      category_id: CATEGORY_IDS.mind,
      memo: "이사 와서 힘들다고 했더니 따뜻한 죽을 들고 와줬어요.",
      received_date: daysAgo(1),
      repayment_timing: "friend_birthday",
      repayment_specific_date: null,
      is_repaid: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      friend_name: "혜정",
      category_name: "마음",
      category_icon: "💝",
      category_color: "#4ade80",
    },
    {
      id: "e2",
      friend_id: FRIEND_IDS.jun,
      category_id: CATEGORY_IDS.time,
      memo: "공항까지 새벽에 데려다 줬어요. 졸린 얼굴 잊을 수 없네.",
      received_date: daysAgo(3),
      repayment_timing: "anytime",
      repayment_specific_date: null,
      is_repaid: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      friend_name: "준영",
      category_name: "시간·행동",
      category_icon: "⏰",
      category_color: "#84cc16",
    },
    {
      id: "e3",
      friend_id: FRIEND_IDS.min,
      category_id: CATEGORY_IDS.material,
      memo: "결혼식 축의금. 액수보다 마음이 컸어요.",
      received_date: daysAgo(7),
      repayment_timing: "specific_event",
      repayment_specific_date: null,
      is_repaid: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      friend_name: "민수",
      category_name: "물질",
      category_icon: "💰",
      category_color: "#22c55e",
    },
    {
      id: "e4",
      friend_id: FRIEND_IDS.yu,
      category_id: CATEGORY_IDS.taste,
      memo: "취향 저격 LP 한 장. 어떻게 알았지.",
      received_date: daysAgo(12),
      repayment_timing: "anytime",
      repayment_specific_date: null,
      is_repaid: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      friend_name: "유나",
      category_name: "취향",
      category_icon: "🎵",
      category_color: "#f472b6",
    },
    {
      id: "e5",
      friend_id: FRIEND_IDS.hye,
      category_id: CATEGORY_IDS.time,
      memo: "바람 빠진 자전거 같이 끌고 가줘서.",
      received_date: daysAgo(20),
      repayment_timing: "specific_date",
      repayment_specific_date: "2026-06-15",
      is_repaid: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      friend_name: "혜정",
      category_name: "시간·행동",
      category_icon: "⏰",
      category_color: "#84cc16",
    },
  ];
  return rows.slice(0, limit);
}

// === 위젯 B — 친구별 카드 그리드 mock ===========================

export async function mockGetTopFriends(
  limit: number = 6,
): Promise<ReadonlyArray<FriendGridCell>> {
  if (USE_EMPTY) return [];
  const rows: FriendGridCell[] = [
    {
      id: FRIEND_IDS.hye,
      name: "혜정",
      birthday_month: new Date().getMonth() + 1,
      birthday_day: Math.min(new Date().getDate() + 7, 28),
      entry_count: 8,
      recent_memo: "이사 와서 힘들다고 했더니 따뜻한 죽을 들고 와줬어요.",
    },
    {
      id: FRIEND_IDS.jun,
      name: "준영",
      birthday_month: null,
      birthday_day: null,
      entry_count: 5,
      recent_memo: "공항까지 새벽에 데려다 줬어요.",
    },
    {
      id: FRIEND_IDS.min,
      name: "민수",
      birthday_month: 8,
      birthday_day: 12,
      entry_count: 3,
      recent_memo: "결혼식 축의금. 액수보다 마음이 컸어요.",
    },
    {
      id: FRIEND_IDS.yu,
      name: "유나",
      birthday_month: 12,
      birthday_day: 3,
      entry_count: 2,
      recent_memo: "취향 저격 LP 한 장. 어떻게 알았지.",
    },
    {
      id: FRIEND_IDS.yoon,
      name: "윤서",
      birthday_month: null,
      birthday_day: null,
      entry_count: 1,
      recent_memo: null,
    },
  ];
  return rows.slice(0, limit);
}

// === 위젯 C — 다가오는 생일 mock ================================

export async function mockGetUpcomingBirthdays(
  _days: number = 30,
): Promise<ReadonlyArray<UpcomingBirthday>> {
  if (USE_EMPTY) return [];
  // 이번 달 친구 1명 (D-7), 다음 달 친구 1명 (D-22) — 정렬 시연
  return [
    {
      friend_id: FRIEND_IDS.hye,
      friend_name: "혜정",
      birthday_month: new Date().getMonth() + 1,
      birthday_day: Math.min(new Date().getDate() + 7, 28),
      days_until: 7,
      recent_memos: [
        "이사 와서 힘들다고 했더니 따뜻한 죽을 들고 와줬어요.",
        "바람 빠진 자전거 같이 끌고 가줘서.",
      ],
    },
    {
      friend_id: FRIEND_IDS.min,
      friend_name: "민수",
      birthday_month: 8,
      birthday_day: 12,
      days_until: 22,
      recent_memos: ["결혼식 축의금. 액수보다 마음이 컸어요."],
    },
  ];
}

// === 위젯 D — 이번 달 요약 mock ================================

export async function mockGetThisMonthSummary(): Promise<ThisMonthSummary> {
  if (USE_EMPTY) {
    return {
      count: 0,
      prev_month_count: null,
      by_category: [],
      top_friends: [],
    };
  }
  return {
    count: 12,
    prev_month_count: 7,
    by_category: [
      {
        category_id: CATEGORY_IDS.mind,
        name: "마음",
        icon: "💝",
        color: "#4ade80",
        count: 5,
      },
      {
        category_id: CATEGORY_IDS.time,
        name: "시간·행동",
        icon: "⏰",
        color: "#84cc16",
        count: 4,
      },
      {
        category_id: CATEGORY_IDS.material,
        name: "물질",
        icon: "💰",
        color: "#22c55e",
        count: 2,
      },
      {
        category_id: CATEGORY_IDS.taste,
        name: "취향",
        icon: "🎵",
        color: "#f472b6",
        count: 1,
      },
    ],
    top_friends: [
      { friend_id: FRIEND_IDS.hye, name: "혜정", count: 5 },
      { friend_id: FRIEND_IDS.jun, name: "준영", count: 3 },
      { friend_id: FRIEND_IDS.min, name: "민수", count: 2 },
    ],
  };
}

// === /friends/[id] 통계 카드 mock ===============================

export async function mockGetFriendCategoryDistribution(
  _friendId: string,
): Promise<FriendCategoryDistribution> {
  if (USE_EMPTY) return [];
  return [
    {
      category_id: CATEGORY_IDS.mind,
      name: "마음",
      icon: "💝",
      color: "#4ade80",
      count: 4,
    },
    {
      category_id: CATEGORY_IDS.time,
      name: "시간·행동",
      icon: "⏰",
      color: "#84cc16",
      count: 3,
    },
    {
      category_id: CATEGORY_IDS.material,
      name: "물질",
      icon: "💰",
      color: "#22c55e",
      count: 1,
    },
  ];
}
