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

// ============================================================
// [B-1] TZ 정착 — next.config.ts + vitest 환경에 TZ=Asia/Seoul 강제 (011 §B-1)
// ============================================================
//
// 결정 로그 011 §B-1: `next.config.ts` 의 env.TZ + vitest 의 test.env(TZ) 가
// 함께 "Asia/Seoul" 로 잠겨야 한다. 시스템/CI 시간대에 따라 aggregateMonthlyTrend 의
// todayKey 가 UTC 기준으로 흔들리던 PR #6/#9 회귀를 방어한다.
//
// 빨강 시드: 현재 vitest.setup.ts / vitest.config.ts 어디에도 TZ 가 강제되어 있지 않다.
// worker 청산 후에는 vitest 가 어떤 호스트에서 돌든 process.env.TZ === "Asia/Seoul" 이고,
// Intl.DateTimeFormat 의 resolvedOptions().timeZone 도 동일하게 잠긴다.
describe("[B-1] TZ 정착 회귀 방어", () => {
  it("vitest 프로세스의 TZ 가 'Asia/Seoul' 로 잠겨 있다", () => {
    expect(process.env.TZ).toBe("Asia/Seoul");
  });

  it("Intl.DateTimeFormat 의 기본 timeZone 도 'Asia/Seoul' 로 잠겨 있다", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Seoul");
  });

  it("UTC 자정 경계(UTC 12-31 16:00 = KST 01-01 01:00)에서 aggregateMonthlyTrend 가 KST 기준 새해 월을 todayKey 로 잡는다", () => {
    // 이 Date 는 KST 기준 2025-01-01 01:00 — 실시점이 '새해'.
    // TZ=Asia/Seoul 가 잠기면 now.getMonth() 는 0(1월), getFullYear()=2025 가 된다.
    const newYearMomentKst = new Date("2024-12-31T16:00:00.000Z");
    // entries 는 모두 11월 안쪽 → endKey = max(maxKey, todayKey).
    // worker 가 TZ 를 KST 로 정착하면 todayKey="2025-01" 이라 마지막 month = "2025-01".
    const result = aggregateMonthlyTrend(
      [entry("2024-11-15")],
      newYearMomentKst,
    );
    const lastMonth = result.at(-1)?.month;
    expect(lastMonth).toBe("2025-01");
  });
});

// ============================================================
// [C-4] enumerateMonths 1000개월 가드 — 주석 의도(빈 배열) 채택 (011 §C-4)
// ============================================================
//
// `lib/friends/stats.ts::enumerateMonths` 주석은 "1000개월 (~83년) 이상이면 비정상 입력 →
// 빈 배열 반환" 이라 명시하지만, 현재 코드는 1000번 누적 후 잘린 결과를 그대로 반환한다.
// PR #9 review nit 후속: 주석과 동작을 일관화 — guard 초과 시 [] 반환.
//
// 본 spec 은 aggregateMonthlyTrend(=enumerateMonths 호출자) 의 외부 동작으로 잠근다.
// 1000개월 초과 윈도우(예: 1930-01 ~ 2025-04 ≒ 1144개월) 입력 시 결과가 빈 배열이어야 한다.
describe("[C-4] enumerateMonths 1000개월 가드 (비정상 입력 → 빈 배열)", () => {
  it("first ~ end 가 1000개월을 초과하면 aggregateMonthlyTrend 가 빈 배열을 반환한다", () => {
    // 1930-01 ~ 2025-04 = (2025-1930)*12 + (4-1) = 1140 + 3 = 1143 개월 폭.
    const now = new Date(2025, 3, 30); // 2025-04-30
    const result = aggregateMonthlyTrend(
      [entry("1930-01-15"), entry("2025-04-12")],
      now,
    );
    expect(result).toEqual([]);
  });

  it("정상 범위(1000개월 이내)에선 동일 입력 대비 결과가 비어 있지 않다 (가드가 정상 케이스를 잠식하지 않음)", () => {
    // 90개월 폭 — 가드 한참 아래.
    const now = new Date(2024, 6, 30);
    const result = aggregateMonthlyTrend(
      [entry("2017-01-15"), entry("2024-06-12")],
      now,
    );
    expect(result.length).toBeGreaterThan(0);
  });
});
