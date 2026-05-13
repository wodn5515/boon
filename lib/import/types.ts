/**
 * 엑셀 import 도메인 타입 (PRD §3 엑셀 Import, D-016, D-026).
 *
 * V1 본 슬라이스(009)는 디자이너의 UI 골격이라 worker 가 본격 결합 시 동일 시그니처로
 * 채워질 placeholder 들이다. 모든 필드는 PRD §4 데이터 모델 그대로 snake_case 를 따른다.
 *
 * 핵심 시나리오: 결혼식/장례식 축의금 50~200명 엑셀 → 친구 매칭/생성 → entries 일괄 추가.
 *
 * - `ColumnMapping`: 엑셀 헤더 → "이름·금액·비고" 슬롯 매핑.
 *   "이름" 필수, "금액"·"비고"는 옵션. 매핑 안 된 컬럼은 무시된다.
 * - `RawRow`: 엑셀 시트의 단일 row (key = 헤더 셀 값, value = 셀 문자열).
 * - `MatchCandidate`: 사용자 친구 목록에서 이름이 일치하는 후보 (메모·최근 신세 1건 포함, D-026).
 * - `MatchResult`: 한 엑셀 row 에 대한 후보 0/1/N 건과 사용자 결정.
 * - `ImportRow`: Step 4 검토를 마친 row — bulkImportEntries 에 그대로 전달.
 *
 * 모두 read-only TS 타입. drizzle row 와 1:1 대응되도록 worker 시 결합.
 */
import type { RepaymentTiming } from "@/lib/entries/types";

/** 엑셀 컬럼 → 본 도메인 슬롯 매핑. value = 엑셀 헤더 텍스트(또는 null = 매핑 안 함). */
export type ColumnMapping = {
  /** 친구 이름 컬럼 — 필수. null 이면 진행 불가. */
  name: string | null;
  /** 금액 컬럼 — 옵션. 채워지면 memo 에 "금액: NN,NNN원" 으로 합쳐진다 (worker 결합). */
  amount: string | null;
  /** 비고 컬럼 — 옵션. 채워지면 memo 에 추가로 합쳐진다. */
  note: string | null;
};

/** 엑셀 시트의 raw row — SheetJS `sheet_to_json({header:1})` 후 key:value 객체로 정규화. */
export type RawRow = Readonly<Record<string, string>>;

/** 엑셀 한 줄에 대한 정규화된 입력 — name 은 trim 후 1자 이상. */
export type NormalizedRow = {
  /** 시트 내 원래 row index (0-based, 헤더 제외). 검토 UI 의 row key 로 활용. */
  rowIndex: number;
  name: string;
  /** 금액 문자열 그대로 — number 파싱은 미리보기 단계에서. */
  amount: string | null;
  note: string | null;
};

/** 매칭 후보 — D-026: 친구 메모 + 최근 신세 1건 표시. */
export type MatchCandidate = {
  friend_id: string;
  friend_name: string;
  /** D-026: 친구 메모 (note 필드, null 가능). */
  friend_note: string | null;
  /** D-026: 가장 최근 신세 1건 메모 (없으면 null). */
  recent_entry_memo: string | null;
  /** D-026: 가장 최근 신세 받은 날짜 (YYYY-MM-DD). 없으면 null. */
  recent_entry_date: string | null;
};

/** 매칭 결과 — row 별 후보 N건. */
export type MatchResult = {
  rowIndex: number;
  name: string;
  candidates: ReadonlyArray<MatchCandidate>;
};

/**
 * Step 4 검토 상태 — row 별 사용자 결정.
 *  - "new" = 0건 매칭. 사용자가 included=true 면 새 친구 + entry 추가.
 *  - "single-confirmed" = 1건 매칭 + "같은 사람" 체크.
 *  - "single-rejected" = 1건 매칭이지만 동명이인 → 새 친구로 추가.
 *  - "multiple-pick" = 다건 매칭 + 사용자가 후보 중 하나 선택.
 *  - "multiple-new" = 다건 매칭 + "새 친구로 만들기" 선택.
 *  - "skip" = 사용자가 included 해제 → import 에서 제외.
 */
export type RowDecisionKind =
  | "new"
  | "single-confirmed"
  | "single-rejected"
  | "multiple-pick"
  | "multiple-new"
  | "skip";

export type RowDecision = {
  rowIndex: number;
  kind: RowDecisionKind;
  /** "multiple-pick" / "single-confirmed" 일 때 선택된 friend_id. 그 외 null. */
  selectedFriendId: string | null;
  /** included=false 면 미리보기에서 빠짐. UI 의 일괄 액션 토글이 일관되게 작동하기 위한 명시 필드. */
  included: boolean;
};

/** 일괄 설정 — Step 3 입력. */
export type BatchSettings = {
  /** 이벤트명 = 모든 entry 의 memo prefix. 예: "결혼식 축의금". */
  eventName: string;
  /** 받은 날짜 (YYYY-MM-DD). 기본 = 오늘. */
  receivedDate: string;
  /** 카테고리 id. 기본 = "물질" (UI 상단에서 listCategories 결과의 첫 시스템 카테고리). */
  categoryId: string;
  /** 보답 시점. 기본 = "specific_event" (결혼식·장례식 시나리오의 기본값, D-012). */
  repaymentTiming: RepaymentTiming;
};

/**
 * bulkImportEntries 입력 — Step 4 의 RowDecision + Step 3 BatchSettings + raw 메모 정보를
 * 평탄화한 형태. worker 가 트랜잭션 1회로 새 친구 insert + entries bulk insert 처리.
 */
export type ImportRow = {
  /** 매핑된 기존 친구 id. null 이면 newFriendName 으로 신규 생성. */
  friendId: string | null;
  /** 신규 친구 이름 — friendId 가 null 일 때만 채워짐. */
  newFriendName: string | null;
  /** 최종 memo = eventName + ((amount) ? " · 금액 NN원" : "") + ((note) ? " · 비고" : ""). */
  memo: string;
  receivedDate: string;
  categoryId: string;
  repaymentTiming: RepaymentTiming;
};

export type BulkImportResult = {
  entriesCreated: number;
  friendsCreated: number;
};
