/**
 * Entry (받은 신세) UI 도메인 타입.
 *
 * V1 entries 슬라이스 UI 골격에서 컴포넌트들이 공유하는 props 형태.
 * worker 가 drizzle 스키마(`db/schema/entries.ts`)로 결합할 때 동일 필드명을 갖도록
 * PRD §4 데이터 모델 그대로 snake_case 를 유지한다.
 *
 * 결정 로그:
 *   - D-010: 점수 X, 항목 단위. 신세는 "기록"이지 "정량"이 아니다 → amount/value 필드 없음.
 *   - D-011: V1 받은 신세만 (sent/given 방향 없음).
 *   - D-012: 보답 시점 4종 — anytime / friend_birthday / specific_event / specific_date.
 *     특정 날짜만 `repayment_specific_date` 가 필요. 나머지 3종은 null.
 *   - D-017: 신세는 hard delete (휴지통 없음).
 *
 * 표시용 join 필드 (`friend_name`, `category_name`, `category_icon`, `category_color`) 는
 * SQL JOIN 결과로 함께 따라온다. UI 컴포넌트는 Entry 단일 객체로 충분히 렌더되게 한다.
 */
export type RepaymentTiming =
  | "anytime"
  | "friend_birthday"
  | "specific_event"
  | "specific_date";

export type Entry = {
  id: string;
  friend_id: string;
  category_id: string;
  memo: string;
  /** ISO date (YYYY-MM-DD). 시각 없이 날짜만. */
  received_date: string;
  repayment_timing: RepaymentTiming;
  /** repayment_timing === "specific_date" 일 때만 채워진다. 그 외엔 null. */
  repayment_specific_date: string | null;
  is_repaid: boolean;
  created_at: string;
  updated_at: string;

  // === JOIN-derived 표시 필드 (entries 테이블 컬럼 아님) ===
  /** worker 가 SQL JOIN 으로 결합. UI 골격에선 mock 에 직접 채워둔다. */
  friend_name?: string;
  category_name?: string;
  category_icon?: string | null;
  category_color?: string;
};

/**
 * 보답 시점 4종 옵션 (D-012).
 *
 * UI 카피는 디자이너 자율 결정. PRD §3 "보답 시점 4종" 원문 그대로의 자연어 라벨.
 *  - "언제든"        anytime         — 마음의 빚으로만 남기고 시점은 자유.
 *  - "그 사람 생일"  friend_birthday — 생일 D-Day 추천 알람에 후크.
 *  - "특정 이벤트 대기" specific_event — 결혼/이사 같은 다음 이벤트가 오면.
 *  - "특정 날짜"     specific_date   — 사용자가 직접 지정. 추가 date picker 노출.
 *
 * 정렬 순서 = 위 정의 순서 그대로 (가벼움 → 무거움, anytime 이 안전 기본값).
 */
export const REPAYMENT_TIMING_OPTIONS: ReadonlyArray<{
  value: RepaymentTiming;
  label: string;
  /** 친구 상세 타임라인 카드에 노출되는 짧은 배지 라벨. */
  badge: string;
}> = [
  { value: "anytime", label: "언제든", badge: "언제든" },
  { value: "friend_birthday", label: "그 사람 생일", badge: "생일에" },
  { value: "specific_event", label: "특정 이벤트 대기", badge: "이벤트 때" },
  { value: "specific_date", label: "특정 날짜", badge: "날짜 지정" },
] as const;

export const DEFAULT_REPAYMENT_TIMING: RepaymentTiming = "anytime";

/**
 * "오늘"·"어제"·"YYYY.M.D" 친근 포맷.
 *
 * 디자이너 결정 (Lead 위임):
 *   - 받은 날짜는 시간이 아니라 "기억"의 단위라 분·초 노출 안 함.
 *   - 0일 차이 = "오늘", 1일 차이 = "어제", 그 외엔 "YYYY.M.D" (구분점 = 마침표).
 *   - 7일 안 = "N일 전" 같은 relative 후보는 거절: 카드 좁은 폭에서 가독성 떨어지고
 *     같은 주 안에서도 절대 날짜 비교가 더 회상에 유리.
 *
 * `now` 매개변수는 테스트 친화 (기본 = 현재 시각).
 */
export function formatReceivedDate(date: string, now: Date = new Date()): string {
  // received_date 가 "YYYY-MM-DD" 라고 가정. 잘못된 입력은 그대로 반환 (graceful).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  const target = new Date(Number(y), Number(mo) - 1, Number(d));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  return `${Number(y)}.${Number(mo)}.${Number(d)}`;
}

/**
 * 보답 시점 → 배지 텍스트 헬퍼.
 *
 * "특정 날짜" 는 timeline 카드에서 "5.20에" 같은 구체 날짜로 보여주는 게 더 유용하므로
 * `specific_date` + repayment_specific_date 가 있으면 그 날짜 포맷을 우선한다.
 */
export function formatRepaymentBadge(
  timing: RepaymentTiming,
  specificDate: string | null,
): string {
  if (timing === "specific_date" && specificDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(specificDate);
    if (m) {
      const [, , mo, d] = m;
      return `${Number(mo)}.${Number(d)}에`;
    }
  }
  return (
    REPAYMENT_TIMING_OPTIONS.find((o) => o.value === timing)?.badge ?? "언제든"
  );
}

// ============================================================================
// Mock — 디자이너 골격용. worker 가 db 결합 시 제거한다.
// ============================================================================
/**
 * 받은 신세 mock — `/`(메인) FAB 시연·`/friends/[id]` 타임라인 시연에 사용한다.
 *
 * worker 가 본 슬라이스에서 db 결합 후 제거. friend_id 는 lib/friends 의 mock 친구 id 와
 * 정합되도록 worker 가 결합 시 다시 매핑한다.
 */
export const MOCK_ENTRIES: Entry[] = [
  {
    id: "mock-entry-1",
    friend_id: "mock-friend-1",
    category_id: "mock-cat-material",
    memo: "이사할 때 트럭 빌려주고 같이 짐 옮겨줌. 점심도 사줬다.",
    received_date: "2026-05-11",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2026-05-11T10:00:00Z",
    updated_at: "2026-05-11T10:00:00Z",
    friend_name: "김민준",
    category_name: "물질",
    category_icon: "💰",
    category_color: "#22c55e",
  },
  {
    id: "mock-entry-2",
    friend_id: "mock-friend-1",
    category_id: "mock-cat-mind",
    memo: "회사 일로 힘들 때 새벽까지 통화해 줬다. 그 한마디로 버텼다.",
    received_date: "2026-05-10",
    repayment_timing: "friend_birthday",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2026-05-10T22:00:00Z",
    updated_at: "2026-05-10T22:00:00Z",
    friend_name: "김민준",
    category_name: "마음",
    category_icon: "💝",
    category_color: "#4ade80",
  },
  {
    id: "mock-entry-3",
    friend_id: "mock-friend-1",
    category_id: "mock-cat-time",
    memo: "면접 준비 같이 봐주고 모의 면접 두 번.",
    received_date: "2026-04-22",
    repayment_timing: "specific_date",
    repayment_specific_date: "2026-06-15",
    is_repaid: true,
    created_at: "2026-04-22T09:00:00Z",
    updated_at: "2026-04-25T09:00:00Z",
    friend_name: "김민준",
    category_name: "시간·행동",
    category_icon: "⏰",
    category_color: "#84cc16",
  },
];

/**
 * 친구 combobox 시연용 mock — `/`(메인) FAB 모달에서 선택지 노출.
 *
 * worker 가 본 슬라이스에서 listFriends() 로 교체. shape 는 Friend 도메인 타입과 호환되도록
 * 최소 필드만 (id + name).
 */
export const MOCK_FRIENDS_FOR_COMBOBOX: ReadonlyArray<{ id: string; name: string }> = [
  { id: "mock-friend-1", name: "김민준" },
  { id: "mock-friend-2", name: "이서연" },
  { id: "mock-friend-3", name: "박지후" },
  { id: "mock-friend-4", name: "정하늘" },
];

/**
 * 카테고리 select 시연용 mock — `/`(메인) FAB 모달.
 *
 * worker 가 본 슬라이스에서 listCategories() 로 교체. UI 골격은 시스템 우선 정렬을 유지.
 */
export const MOCK_CATEGORIES_FOR_SELECT: ReadonlyArray<{
  id: string;
  name: string;
  icon: string | null;
  color: string;
}> = [
  { id: "mock-cat-material", name: "물질", icon: "💰", color: "#22c55e" },
  { id: "mock-cat-time", name: "시간·행동", icon: "⏰", color: "#84cc16" },
  { id: "mock-cat-mind", name: "마음", icon: "💝", color: "#4ade80" },
];
