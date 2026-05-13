import { describe, expect, it } from "vitest";

/**
 * `lib/entries/types.ts` 의 표시용 포매터 단위 테스트 (시나리오 18·19).
 *
 * 디자이너 골격(types.ts) 의 룰을 회귀 잠금한다 — worker 가 본 슬라이스에서 mock 을 제거하고
 * db 결합을 하더라도 포매터의 표시 의도가 흔들리지 않도록 한다.
 *
 * 검증 룰:
 *   formatReceivedDate
 *     - 0일 차이 → "오늘"
 *     - 1일 차이 → "어제"
 *     - 그 외   → "YYYY.M.D" (구분점 = 마침표, 월·일은 패딩 없음 — 예: "2026.5.12")
 *     - 형식이 어긋난 입력은 graceful 하게 그대로 반환
 *   formatRepaymentBadge
 *     - "anytime"            → "언제든"
 *     - "friend_birthday"    → "생일에"
 *     - "specific_event"     → "이벤트 때"
 *     - "specific_date" + 날짜 → "M.D에" (예: "2026-05-20" → "5.20에")
 *     - "specific_date" + null → fallback "날짜 지정"
 *
 * 참고: 디자이너 골격의 REPAYMENT_TIMING_OPTIONS 가 정의한 badge 문자열 그대로 잠근다.
 * Lead 명세의 자연어 ("그 사람 생일") 와 다르면 본 spec 이 빨갛게 막아 디자이너 골격이
 * 변할 때 사용자 가시 카피가 같이 흔들리지 않게 한다. (디자이너 카피가 정답 — UI 일관성).
 */

import {
  formatReceivedDate,
  formatRepaymentBadge,
} from "@/lib/entries/types";

describe("formatReceivedDate", () => {
  // 고정 now — 시스템 시계와 무관하게 결정적.
  // 2026-05-12 (오늘 = 사용자 컨텍스트 currentDate).
  const NOW = new Date(2026, 4, 12); // 월은 0-indexed.

  it("같은 날짜 → '오늘'", () => {
    expect(formatReceivedDate("2026-05-12", NOW)).toBe("오늘");
  });

  it("1일 전 → '어제'", () => {
    expect(formatReceivedDate("2026-05-11", NOW)).toBe("어제");
  });

  it("2일 전 → 'YYYY.M.D' (월·일 zero-pad 없음)", () => {
    expect(formatReceivedDate("2026-05-10", NOW)).toBe("2026.5.10");
  });

  it("월·일이 한 자릿수일 때도 패딩 없이 마침표 구분", () => {
    expect(formatReceivedDate("2026-03-05", NOW)).toBe("2026.3.5");
  });

  it("형식이 어긋난 입력은 그대로 반환 (graceful)", () => {
    expect(formatReceivedDate("2026/05/12", NOW)).toBe("2026/05/12");
    expect(formatReceivedDate("", NOW)).toBe("");
  });
});

describe("formatRepaymentBadge", () => {
  it("anytime → '언제든'", () => {
    expect(formatRepaymentBadge("anytime", null)).toBe("언제든");
  });

  it("friend_birthday → '생일에' (디자이너 골격 badge)", () => {
    expect(formatRepaymentBadge("friend_birthday", null)).toBe("생일에");
  });

  it("specific_event → '이벤트 때'", () => {
    expect(formatRepaymentBadge("specific_event", null)).toBe("이벤트 때");
  });

  it("specific_date + 날짜 → 'M.D에' (월·일 패딩 없음)", () => {
    expect(formatRepaymentBadge("specific_date", "2026-05-20")).toBe("5.20에");
    expect(formatRepaymentBadge("specific_date", "2026-12-03")).toBe("12.3에");
  });

  it("specific_date + null → fallback ('날짜 지정')", () => {
    // 디자이너 골격의 REPAYMENT_TIMING_OPTIONS 가 정의한 badge 그대로.
    expect(formatRepaymentBadge("specific_date", null)).toBe("날짜 지정");
  });
});
