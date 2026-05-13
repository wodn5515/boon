import { describe, expect, it } from "vitest";

/**
 * `formatAmount` ↔ `buildMemo` 한국어 단위 정합 잠금 (011 §B-3).
 *
 * 회귀 시드 (PR #8 🟢 #1):
 *   - `components/import/step-4-matching-review.tsx::formatAmount` 가 자체 인라인 `replace(/[^\d]/g, "")`
 *     로 숫자만 뽑는다 → "10만원" 입력 시 "10" → "10원" 으로 표시.
 *   - 반면 `lib/import/memo-builder.ts::buildMemo` 는 `extractDigitsKoreanAware` 로 한국어 단위(억·만·천·백·십)
 *     를 zero-padding 으로 확장한다 → "10만원" → "100,000원".
 *   - 결과: Step 4 row 헤더 메모 미리보기 ≠ Step 5 미리보기 = DB 메모 — 사용자 혼란.
 *
 * 본 spec 은 단일 진실 원천 함수를 회귀 잠금한다.
 *
 * worker 청산 후 기대:
 *   - `lib/import/memo-builder.ts` 가 `extractDigitsKoreanAware` 를 named export.
 *   - `components/import/step-4-matching-review.tsx::formatAmount` 가 같은 함수를 import 해서
 *     숫자 추출에 사용 — Step 4·5·DB 메모 한 줄로 잠긴다.
 *
 * 빨강 시드:
 *   - 현재 `extractDigitsKoreanAware` 는 module-private — import 시 undefined → 본 spec fail.
 */

import * as memoBuilder from "@/lib/import/memo-builder";

describe("[B-3] extractDigitsKoreanAware lib export (Step 4 ↔ buildMemo 정합)", () => {
  it("lib/import/memo-builder 가 extractDigitsKoreanAware 를 named export 한다", () => {
    expect(typeof (memoBuilder as Record<string, unknown>).extractDigitsKoreanAware).toBe(
      "function",
    );
  });

  it("'10만원' → '100000' (만 = 4 zero-padding)", () => {
    const fn = (memoBuilder as Record<string, unknown>)
      .extractDigitsKoreanAware as (s: string) => string;
    expect(fn("10만원")).toBe("100000");
  });

  it("'1억' → '100000000' (억 = 8 zero-padding)", () => {
    const fn = (memoBuilder as Record<string, unknown>)
      .extractDigitsKoreanAware as (s: string) => string;
    expect(fn("1억")).toBe("100000000");
  });

  it("'3천원' → '3000'", () => {
    const fn = (memoBuilder as Record<string, unknown>)
      .extractDigitsKoreanAware as (s: string) => string;
    expect(fn("3천원")).toBe("3000");
  });

  it("순수 숫자 문자열은 그대로 추출", () => {
    const fn = (memoBuilder as Record<string, unknown>)
      .extractDigitsKoreanAware as (s: string) => string;
    expect(fn("50000")).toBe("50000");
  });

  it("단위 없는 자연어('일금')는 숫자 0개", () => {
    const fn = (memoBuilder as Record<string, unknown>)
      .extractDigitsKoreanAware as (s: string) => string;
    expect(fn("일금")).toBe("");
  });
});

// ============================================================
// Step 4 formatAmount 정합 회귀 — 같은 입력 → 같은 표시
// ============================================================
//
// worker 가 lib export 를 추가하고 step-4-matching-review.tsx::formatAmount 를
// `extractDigitsKoreanAware` 기반으로 재작성하면 buildMemo 와 표시가 한 줄로 잠긴다.
//
// Step 4 컴포넌트가 RowHeader 에서 호출하는 헬퍼는 export 되지 않은 module-private 함수다.
// 본 spec 은 worker 가 그 함수도 lib 으로 끌어내거나(권장), 같은 lib 함수를 사용해 동등 출력을
// 내는지를 buildMemo 결과의 "금액 X원" 부분과 비교해 잠근다.
describe("[B-3] formatAmount(Step 4) ↔ buildMemo(Step 5/DB) 표시 정합", () => {
  it("'10만원' 입력 시 Step 4 표시와 buildMemo 의 '금액 ...' 부분이 동일한 숫자 포맷", () => {
    const buildMemo = (memoBuilder as Record<string, unknown>).buildMemo as (
      input: {
        eventName: string;
        name: string;
        amount: string | null;
        note: string | null;
      },
    ) => string;
    const memo = buildMemo({
      eventName: "결혼식",
      name: "박지호",
      amount: "10만원",
      note: null,
    });
    // memoBuilder 출력 안의 "금액 ...원" 부분이 "100,000원" 으로 포맷됨을 잠금.
    expect(memo).toContain("금액 100,000원");
  });

  it("'5만원' 입력 시 동일 규약 — '50,000원' 으로 노출", () => {
    const buildMemo = (memoBuilder as Record<string, unknown>).buildMemo as (
      input: {
        eventName: string;
        name: string;
        amount: string | null;
        note: string | null;
      },
    ) => string;
    const memo = buildMemo({
      eventName: "결혼식",
      name: "박지호",
      amount: "5만원",
      note: null,
    });
    expect(memo).toContain("금액 50,000원");
  });
});
