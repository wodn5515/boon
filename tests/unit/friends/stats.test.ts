import { describe, expect, it } from "vitest";

import {
  aggregateMonthlyTrend,
  formatKoreanDate,
  summarizeActivity,
  type MonthlyTrendDatum,
} from "@/lib/friends/stats";
import type { Entry } from "@/lib/entries/types";

/**
 * `lib/friends/stats.ts` 의 순수 헬퍼 3종 단위 테스트 (PR #9 — 통계 보강 슬라이스).
 *
 * 디자이너 골격(컴포넌트 결합) 을 잠그는 spec — 결정 로그 010 (예정) 의 채택 사항을
 * 후속 worker 가 단위 레이어에서 깨뜨리지 않도록 회귀 방어선을 깐다.
 *
 * 주요 잠금 포인트:
 *   - `MonthlyTrendDatum` 은 `{ month, label, count }` 3-필드 (디자이너 자율 결정으로 label 이 별도 노출됨).
 *   - 가변 윈도우: first → max(last, now) 사이를 0 포함 채우되,
 *     윈도우가 6개월 미만이면 endKey 기준 -5개월까지 패딩(총 6개월 폭) 보장.
 *   - 라벨 포맷 동적: 윈도우 ≤ 12개월 → "M월", 그 외 → "YY.M" (구분점 = 마침표).
 *   - `summarizeActivity` 의 평균 = round((lastDate - firstDate)일수 / (N - 1)).
 *
 * 테스트 친화: `aggregateMonthlyTrend` 는 `now` 두 번째 인자(Date) 를 받아 결정성을 확보한다.
 */

function entry(received_date: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id: `id-${received_date}-${Math.random().toString(36).slice(2, 8)}`,
    friend_id: "friend-1",
    category_id: "cat-1",
    memo: "",
    received_date,
    repayment_timing: "anytime",
    repayment_specific_date: null,
    is_repaid: false,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("aggregateMonthlyTrend", () => {
  it("[시나리오 5] 빈 배열 → 빈 배열", () => {
    expect(aggregateMonthlyTrend([])).toEqual([]);
  });

  it("[시나리오 6] 1건만 있고 6개월 미만이면 endKey 기준 6개월 패딩 — 마지막 달만 1, 나머지 0", () => {
    const now = new Date(2024, 10, 30); // 2024-11-30 (month 0-based)
    const result = aggregateMonthlyTrend([entry("2024-11-23")], now);

    // months: 2024-06 ~ 2024-11 (총 6개)
    expect(result.map((d) => d.month)).toEqual([
      "2024-06",
      "2024-07",
      "2024-08",
      "2024-09",
      "2024-10",
      "2024-11",
    ]);
    expect(result.map((d) => d.count)).toEqual([0, 0, 0, 0, 0, 1]);
    // 라벨 = "M월" (12개월 이내 동적 라벨).
    expect(result.map((d) => d.label)).toEqual([
      "6월",
      "7월",
      "8월",
      "9월",
      "10월",
      "11월",
    ]);
  });

  it("[시나리오 7] 4개월 폭 (2024-01 ~ 2024-04) — 윈도우가 6개월 미만이라 endKey 기준 -5개월로 패딩", () => {
    // now 를 endKey(2024-04) 이하로 잡아 endKey = max(last, now) = 2024-04 로 결정성 확보.
    const now = new Date(2024, 3, 30); // 2024-04-30 — endKey 후보가 same 이라 패딩 정책만 작동.
    const result = aggregateMonthlyTrend(
      [entry("2024-01-05"), entry("2024-04-12")],
      now,
    );

    // 디자이너 골격: enumerateMonths(startKey, endKey) — startKey 는 endKey-5개월 = 2023-11.
    expect(result.map((d) => d.month)).toEqual([
      "2023-11",
      "2023-12",
      "2024-01",
      "2024-02",
      "2024-03",
      "2024-04",
    ]);
    expect(result.map((d) => d.count)).toEqual([0, 0, 1, 0, 0, 1]);
  });

  it("[시나리오 8] 같은 달 여러 건이면 count 누적 (3건 → 마지막 달 count = 3)", () => {
    const now = new Date(2024, 10, 30); // 2024-11-30
    const result = aggregateMonthlyTrend(
      [
        entry("2024-11-01"),
        entry("2024-11-15"),
        entry("2024-11-30"),
      ],
      now,
    );

    // 패딩 후 마지막 month = 2024-11, count = 3.
    const last = result[result.length - 1];
    expect(last.month).toBe("2024-11");
    expect(last.count).toBe(3);
    // 그 외 달은 모두 0.
    expect(
      result.slice(0, -1).every((d: MonthlyTrendDatum) => d.count === 0),
    ).toBe(true);
  });

  it("[추가] 윈도우가 12개월 초과면 라벨 포맷이 'YY.M' 으로 전환된다", () => {
    // first 2022-01, end(now) 2024-04 → 28개월 폭, 라벨은 "22.1", "22.2", ... "24.4"
    const now = new Date(2024, 3, 30);
    const result = aggregateMonthlyTrend(
      [entry("2022-01-15"), entry("2024-04-12")],
      now,
    );
    expect(result.length).toBeGreaterThan(12);
    expect(result[0].label).toBe("22.1");
    expect(result[result.length - 1].label).toBe("24.4");
  });
});

describe("summarizeActivity", () => {
  it("[시나리오 9] 빈 배열 → 모든 필드 null", () => {
    expect(summarizeActivity([])).toEqual({
      firstDate: null,
      lastDate: null,
      averageIntervalDays: null,
    });
  });

  it("[시나리오 10] 1건만 있으면 first/last 동일, averageIntervalDays = null", () => {
    expect(summarizeActivity([entry("2024-11-23")])).toEqual({
      firstDate: "2024-11-23",
      lastDate: "2024-11-23",
      averageIntervalDays: null,
    });
  });

  it("[시나리오 11] 2건 (2024-01-01, 2024-07-01) → 평균 간격 = 182일 ((N-1)=1 분모)", () => {
    const summary = summarizeActivity([
      entry("2024-01-01"),
      entry("2024-07-01"),
    ]);
    expect(summary.firstDate).toBe("2024-01-01");
    expect(summary.lastDate).toBe("2024-07-01");
    expect(summary.averageIntervalDays).toBe(182);
  });

  it("[시나리오 12] 3건 (2024-01-01, 2024-04-01, 2024-07-01) → 평균 = 91일 ((N-1)=2 분모)", () => {
    const summary = summarizeActivity([
      entry("2024-01-01"),
      entry("2024-04-01"),
      entry("2024-07-01"),
    ]);
    expect(summary.firstDate).toBe("2024-01-01");
    expect(summary.lastDate).toBe("2024-07-01");
    expect(summary.averageIntervalDays).toBe(91);
  });

  it("[추가] 입력 순서가 뒤섞여 있어도 내부에서 정렬해 first/last 가 정확하다", () => {
    const summary = summarizeActivity([
      entry("2024-07-01"),
      entry("2024-01-01"),
      entry("2024-04-01"),
    ]);
    expect(summary.firstDate).toBe("2024-01-01");
    expect(summary.lastDate).toBe("2024-07-01");
    expect(summary.averageIntervalDays).toBe(91);
  });
});

describe("formatKoreanDate", () => {
  it("[시나리오 13] '2024-11-23' → '2024년 11월 23일'", () => {
    expect(formatKoreanDate("2024-11-23")).toBe("2024년 11월 23일");
  });

  it("[시나리오 14] '2024-01-05' → '2024년 1월 5일' (zero-padding 없음, 자연어)", () => {
    expect(formatKoreanDate("2024-01-05")).toBe("2024년 1월 5일");
  });

  it("[추가] '2024-12-31' → '2024년 12월 31일'", () => {
    expect(formatKoreanDate("2024-12-31")).toBe("2024년 12월 31일");
  });
});
