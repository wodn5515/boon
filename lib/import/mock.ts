/**
 * 엑셀 import UI 골격용 mock 데이터 (009 / 디자이너 라운드).
 *
 * worker 가 본격 결합 시 — `matchFriendsByName` / `bulkImportEntries` 가 실데이터로 작동하면 —
 * 이 파일은 제거되거나 storybook/E2E 픽스처로만 잔존.
 *
 * 시나리오 구성 (PRD §3 + D-016):
 *   - 결혼식 축의금 가상 row 7개 → 0건 매칭 / 1건 매칭 / 동명이인 / 빈 행 케이스를 모두 시연.
 *   - 헤더 = ["이름", "금액", "비고"] — Step 2 컬럼 자동 감지를 한번에 통과시킴.
 */
import type { MatchCandidate, MatchResult, RawRow } from "@/lib/import/types";

/** UI 시연용 mock excel — Step 1·2 가 client 측 SheetJS 파싱 없이도 동작하도록 미리 정규화된 형태. */
export const MOCK_EXCEL_HEADERS: ReadonlyArray<string> = [
  "이름",
  "금액(원)",
  "비고",
];

export const MOCK_EXCEL_ROWS: ReadonlyArray<RawRow> = [
  { 이름: "김민준", "금액(원)": "100000", 비고: "회사 동료" },
  { 이름: "이서윤", "금액(원)": "200000", 비고: "대학 친구" },
  { 이름: "박도윤", "금액(원)": "50000", 비고: "" },
  { 이름: "최은우", "금액(원)": "300000", 비고: "사촌" },
  { 이름: "김민준", "금액(원)": "150000", 비고: "고등학교 친구 — 동명이인" },
  { 이름: "정하준", "금액(원)": "100000", 비고: "" },
  { 이름: "박지호", "금액(원)": "80000", 비고: "" },
];

/**
 * mock 매칭 결과 — Step 4 검토 UI 4가지 케이스 모두 시연:
 *   - "김민준" → 2건 (다건/동명이인)
 *   - "이서윤" → 1건 (단일 매칭 + 친구 메모 + 최근 신세)
 *   - "박도윤" → 0건 (새 친구)
 *   - "최은우" → 1건 (단일 매칭 — 최근 신세 없음)
 *   - "정하준" → 0건
 *   - "박지호" → 0건
 *
 * row index 는 MOCK_EXCEL_ROWS 와 1:1.
 */
const cKimMinjun1: MatchCandidate = {
  friend_id: "mock-friend-kim-minjun-1",
  friend_name: "김민준",
  friend_note: "회사 동료, 같은 팀 디자이너",
  recent_entry_memo: "이사할 때 가구 옮겨줌",
  recent_entry_date: "2026-02-14",
};
const cKimMinjun2: MatchCandidate = {
  friend_id: "mock-friend-kim-minjun-2",
  friend_name: "김민준",
  friend_note: "고등학교 동창",
  recent_entry_memo: "병문안 와줌",
  recent_entry_date: "2025-11-03",
};
const cLeeSeoyun: MatchCandidate = {
  friend_id: "mock-friend-lee-seoyun",
  friend_name: "이서윤",
  friend_note: "대학 동기, 친한 친구",
  recent_entry_memo: "생일 선물로 향수",
  recent_entry_date: "2026-03-22",
};
const cChoiEunwoo: MatchCandidate = {
  friend_id: "mock-friend-choi-eunwoo",
  friend_name: "최은우",
  friend_note: "사촌 동생",
  recent_entry_memo: null,
  recent_entry_date: null,
};

export const MOCK_MATCH_RESULTS: ReadonlyArray<MatchResult> = [
  { rowIndex: 0, name: "김민준", candidates: [cKimMinjun1, cKimMinjun2] },
  { rowIndex: 1, name: "이서윤", candidates: [cLeeSeoyun] },
  { rowIndex: 2, name: "박도윤", candidates: [] },
  { rowIndex: 3, name: "최은우", candidates: [cChoiEunwoo] },
  { rowIndex: 4, name: "김민준", candidates: [cKimMinjun1, cKimMinjun2] },
  { rowIndex: 5, name: "정하준", candidates: [] },
  { rowIndex: 6, name: "박지호", candidates: [] },
];
