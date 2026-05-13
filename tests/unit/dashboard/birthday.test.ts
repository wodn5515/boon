import { describe, expect, it } from "vitest";

/**
 * `daysUntilBirthday` 의 30일 윈도우 케이스 (시나리오 13).
 *
 * 기존 unit spec(`tests/unit/friends/types.test.ts`)은 formatBirthday 만 잡았다.
 * dashboard 슬라이스에서 위젯 C 가 "이번 달 생일 = 30일 슬라이딩 윈도우" 로 정의되었기 때문에
 * (lib/dashboard/queries.ts::getUpcomingBirthdays days=30 주석) 연말 → 연초 wraparound 처리를
 * 명시적으로 잠근다.
 *
 * 검증 룰 (lib/friends/birthday.ts::daysUntilBirthday):
 *   - 오늘과 같은 month/day → 0
 *   - 올해 생일이 아직 안 지났으면 그 날짜까지 일수
 *   - 올해 생일이 이미 지났으면 내년 생일까지 일수 (wraparound)
 *   - month 또는 day 가 null 이면 null
 *   - 1~12 / 1~31 범위 밖이면 null (방어)
 *
 * 30일 윈도우 안 = (0 <= d <= 30). 다음 슬라이스에서 worker 가 위젯 C 의 SQL 조건을 어떻게
 * 짜든 (PostgreSQL date arithmetic 직접 or daysUntilBirthday 결과 필터링) 본 함수의 의미는
 * 같은 것을 가리킨다.
 */

import { daysUntilBirthday } from "@/lib/friends/birthday";

describe("daysUntilBirthday — 30일 슬라이딩 윈도우 케이스", () => {
  it("오늘과 같은 month/day → 0", () => {
    // 2026-05-13 기준.
    const now = new Date(2026, 4, 13);
    expect(daysUntilBirthday(5, 13, now)).toBe(0);
  });

  it("올해 생일이 25일 후 → 25", () => {
    // 2026-05-13 → 2026-06-07 = 25일.
    const now = new Date(2026, 4, 13);
    expect(daysUntilBirthday(6, 7, now)).toBe(25);
  });

  it("연말 wraparound — 12월 28일에서 1월 5일 생일 → 8일 후 (윈도우 30 안)", () => {
    const now = new Date(2026, 11, 28); // 2026-12-28
    // 다음 생일: 2027-01-05 = 8일 후.
    expect(daysUntilBirthday(1, 5, now)).toBe(8);
  });

  it("연말 wraparound — 12월 31일에서 1월 1일 생일 → 1", () => {
    const now = new Date(2026, 11, 31);
    expect(daysUntilBirthday(1, 1, now)).toBe(1);
  });

  it("연말 wraparound — 12월 1일에서 11월 30일 생일은 거의 1년 뒤 → 윈도우 30 밖 (>30)", () => {
    const now = new Date(2026, 11, 1); // 2026-12-01
    // 11월 30일은 이미 지남 → 다음 생일 = 2027-11-30 → 364일.
    expect(daysUntilBirthday(11, 30, now)).toBeGreaterThan(30);
  });

  it("month/day null 이면 null", () => {
    expect(daysUntilBirthday(null, 5)).toBeNull();
    expect(daysUntilBirthday(3, null)).toBeNull();
    expect(daysUntilBirthday(null, null)).toBeNull();
  });

  it("범위 밖 month/day → null (방어)", () => {
    expect(daysUntilBirthday(0, 5)).toBeNull();
    expect(daysUntilBirthday(13, 5)).toBeNull();
    expect(daysUntilBirthday(5, 0)).toBeNull();
    expect(daysUntilBirthday(5, 32)).toBeNull();
  });
});
