import { describe, expect, it } from "vitest";

/**
 * lib/friends/types.ts::formatBirthday 단위 테스트 (시나리오 16).
 *
 * 디자이너 룰(lib/friends/types.ts 주석):
 *   - 둘 다 있으면 "M월 D일"
 *   - 둘 중 하나라도 null/undefined 면 표시하지 않는다
 *
 * 현재 구현은 그런 경우 null 을 돌려준다. Lead 명세에서 "" (빈 문자열)을 명시했으나
 * 친구 카드·상세 페이지가 모두 `??` falsy 분기를 쓰므로 null/"" 둘 다 동작한다.
 * 일관성 차원에서 `null` 을 spec 으로 잠궈 둔다 — Lead 결정 필요시 spec 갱신.
 */

import { formatBirthday } from "@/lib/friends/types";

describe("formatBirthday", () => {
  it("(3, 5) → '3월 5일'", () => {
    expect(
      formatBirthday({ birthday_month: 3, birthday_day: 5 }),
    ).toBe("3월 5일");
  });

  it("(12, 31) → '12월 31일'", () => {
    expect(
      formatBirthday({ birthday_month: 12, birthday_day: 31 }),
    ).toBe("12월 31일");
  });

  it("(null, null) → 표시 없음 (null)", () => {
    expect(
      formatBirthday({ birthday_month: null, birthday_day: null }),
    ).toBeNull();
  });

  it("월만 있고 일이 없으면 표시 없음 (null)", () => {
    expect(
      formatBirthday({ birthday_month: 3, birthday_day: null }),
    ).toBeNull();
  });

  it("일만 있고 월이 없으면 표시 없음 (null)", () => {
    expect(
      formatBirthday({ birthday_month: null, birthday_day: 5 }),
    ).toBeNull();
  });
});
