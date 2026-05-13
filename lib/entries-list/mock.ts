import type { Entry } from "@/lib/entries/types";
import type { FriendComboboxOption } from "@/components/entries/friend-combobox";

/**
 * `/entries` 페이지·필터 시연용 mock (결정 로그 008 §G).
 *
 * 디자이너 라운드 한정 — worker 가 `lib/entries-list/queries.ts::listEntriesFiltered` 의
 * SQL 본체 결합 시 본 파일과 mock 분기를 모두 제거한다.
 *
 * 데이터 형태는 PRD §4 데이터 모델 그대로 + 표시용 JOIN 필드(friend_name / category_*).
 *
 * 디자이너 의도:
 *   - 5명의 친구 × 카테고리 3종 × 보답 시점 4종을 골고루 섞은 16건. 필터 5종(검색/친구/카테고리/날짜/정렬) 각각이
 *     의미 있는 매칭을 만들도록 시간·내용·이름을 분포.
 *   - 가장 최근(2026-05-11 = 오늘) 부터 약 1년치(2025-05-20 까지). 정렬 토글 시연 가능.
 *   - 갚음 상태가 다양하도록 일부 entries 는 is_repaid=true (carded opacity-60 시연).
 *   - 카테고리 색상은 기본 3종(물질/시간/마음) 그대로.
 *
 * 친구·카테고리 옵션 mock 도 같이 제공 — page.tsx 가 listFriends / listCategories 결과 대신
 * 본 mock 을 props 로 주입 (worker 결합 시 실제 query 결과로 교체).
 */

export const MOCK_FRIEND_OPTIONS: ReadonlyArray<FriendComboboxOption> = [
  { id: "f1", name: "민지" },
  { id: "f2", name: "수현" },
  { id: "f3", name: "지훈" },
  { id: "f4", name: "예린" },
  { id: "f5", name: "도윤" },
] as const;

export const MOCK_CATEGORY_OPTIONS: ReadonlyArray<{
  id: string;
  name: string;
  icon: string | null;
  color: string;
}> = [
  { id: "c1", name: "물질", icon: "💰", color: "#22c55e" },
  { id: "c2", name: "시간·행동", icon: "⏰", color: "#84cc16" },
  { id: "c3", name: "마음", icon: "💝", color: "#4ade80" },
] as const;

/**
 * 친구 이름·카테고리 표시 필드를 미리 평탄화해 둔다 (실제 listEntriesFiltered 결과와 동일 형태).
 */
function build(
  partial: Omit<
    Entry,
    "friend_name" | "category_name" | "category_icon" | "category_color"
  >,
): Entry {
  const friend = MOCK_FRIEND_OPTIONS.find((f) => f.id === partial.friend_id);
  const category = MOCK_CATEGORY_OPTIONS.find(
    (c) => c.id === partial.category_id,
  );
  return {
    ...partial,
    friend_name: friend?.name,
    category_name: category?.name,
    category_icon: category?.icon ?? null,
    category_color: category?.color,
  };
}

export const MOCK_ENTRIES: ReadonlyArray<Entry> = [
  build({
    id: "e16",
    friend_id: "f1",
    category_id: "c3",
    memo: "이사 첫날 직접 와서 짐 정리 도와줬다. 손 베어가며 박스 뜯어주던 모습.",
    received_date: "2026-05-11",
    repayment_timing: "specific_event",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2026-05-11T12:00:00.000Z",
    updated_at: "2026-05-11T12:00:00.000Z",
  }),
  build({
    id: "e15",
    friend_id: "f2",
    category_id: "c1",
    memo: "감기 걸렸을 때 죽이랑 비타민 한 박스 사다 줬다.",
    received_date: "2026-05-08",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2026-05-08T20:30:00.000Z",
    updated_at: "2026-05-08T20:30:00.000Z",
  }),
  build({
    id: "e14",
    friend_id: "f3",
    category_id: "c2",
    memo: "발표 자료 새벽까지 같이 봐줬다. 슬라이드 흐름 다시 잡아준 거 진짜 컸음.",
    received_date: "2026-05-05",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: true,
    created_at: "2026-05-05T03:10:00.000Z",
    updated_at: "2026-05-06T09:00:00.000Z",
  }),
  build({
    id: "e13",
    friend_id: "f4",
    category_id: "c3",
    memo: "할머니 장례식 와줬다. 말 없이 옆에 앉아만 있어 줬다.",
    received_date: "2026-04-28",
    repayment_timing: "friend_birthday",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2026-04-28T16:00:00.000Z",
    updated_at: "2026-04-28T16:00:00.000Z",
  }),
  build({
    id: "e12",
    friend_id: "f5",
    category_id: "c2",
    memo: "공항까지 새벽 5시에 픽업 와줬다. 잠도 못 잤을 텐데.",
    received_date: "2026-04-20",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2026-04-20T06:00:00.000Z",
    updated_at: "2026-04-20T06:00:00.000Z",
  }),
  build({
    id: "e11",
    friend_id: "f1",
    category_id: "c1",
    memo: "생일 선물로 좋아하는 책 골라줬다. 어떻게 알았지.",
    received_date: "2026-04-12",
    repayment_timing: "friend_birthday",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2026-04-12T19:00:00.000Z",
    updated_at: "2026-04-12T19:00:00.000Z",
  }),
  build({
    id: "e10",
    friend_id: "f2",
    category_id: "c3",
    memo: "이별했을 때 전화 두 시간 받아줬다. 울었는데도 끊지 않았다.",
    received_date: "2026-03-30",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: true,
    created_at: "2026-03-30T23:00:00.000Z",
    updated_at: "2026-04-01T10:00:00.000Z",
  }),
  build({
    id: "e9",
    friend_id: "f3",
    category_id: "c1",
    memo: "프로젝트 끝나고 비싼 한정식 사줬다. 본인 카드로.",
    received_date: "2026-03-15",
    repayment_timing: "specific_date",
    repayment_specific_date: "2026-06-01",
    is_repaid: false,
    created_at: "2026-03-15T21:00:00.000Z",
    updated_at: "2026-03-15T21:00:00.000Z",
  }),
  build({
    id: "e8",
    friend_id: "f4",
    category_id: "c2",
    memo: "이력서 검토 세 번이나 해줬다. 매번 다르게 꼼꼼히.",
    received_date: "2026-02-22",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2026-02-22T22:00:00.000Z",
    updated_at: "2026-02-22T22:00:00.000Z",
  }),
  build({
    id: "e7",
    friend_id: "f5",
    category_id: "c3",
    memo: "면접 떨어진 날 술 한잔 같이. 위로가 아니라 같이 욕해줘서 더 좋았다.",
    received_date: "2026-02-10",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2026-02-10T21:30:00.000Z",
    updated_at: "2026-02-10T21:30:00.000Z",
  }),
  build({
    id: "e6",
    friend_id: "f1",
    category_id: "c2",
    memo: "운전 면허 학원 따라와 줬다. 본인은 이미 면허 있는데도.",
    received_date: "2026-01-25",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: true,
    created_at: "2026-01-25T15:00:00.000Z",
    updated_at: "2026-02-15T11:00:00.000Z",
  }),
  build({
    id: "e5",
    friend_id: "f2",
    category_id: "c1",
    memo: "이사 축하한다고 화분 보내줬다. 잘 키우는 중.",
    received_date: "2025-12-30",
    repayment_timing: "specific_event",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2025-12-30T11:00:00.000Z",
    updated_at: "2025-12-30T11:00:00.000Z",
  }),
  build({
    id: "e4",
    friend_id: "f3",
    category_id: "c3",
    memo: "연말에 손편지 받았다. 1년 회상하니 좋더라.",
    received_date: "2025-12-24",
    repayment_timing: "friend_birthday",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2025-12-24T20:00:00.000Z",
    updated_at: "2025-12-24T20:00:00.000Z",
  }),
  build({
    id: "e3",
    friend_id: "f4",
    category_id: "c1",
    memo: "취업 축하 선물로 만년필. 첫 출근날 꺼냈다.",
    received_date: "2025-11-05",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2025-11-05T18:00:00.000Z",
    updated_at: "2025-11-05T18:00:00.000Z",
  }),
  build({
    id: "e2",
    friend_id: "f5",
    category_id: "c2",
    memo: "야근 끝나고 데려다 줬다. 본인 집 반대 방향인데.",
    received_date: "2025-08-18",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: true,
    created_at: "2025-08-18T23:30:00.000Z",
    updated_at: "2025-09-02T19:00:00.000Z",
  }),
  build({
    id: "e1",
    friend_id: "f1",
    category_id: "c3",
    memo: "처음 보던 친구한테 길 물어봤더니 30분이나 같이 찾아 줬다. 인연의 시작.",
    received_date: "2025-05-20",
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2025-05-20T14:00:00.000Z",
    updated_at: "2025-05-20T14:00:00.000Z",
  }),
] as const;
