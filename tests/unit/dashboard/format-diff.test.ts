import { describe, expect, it } from "vitest";

/**
 * `formatDiff` — 위젯 D '지난 달 ↔ 이번 달' 비교 카피 회귀 잠금 (011 §C-2).
 *
 * 회귀 시드 (PR #6 review §):
 *   - 현재 `components/dashboard/widget-this-month-summary.tsx::formatDiff(prev, cur)` 는
 *     prev == null 만 fallback 처리한다. prev = 0 인 첫 달 사용자에 대해 `"지난 달 0건 → 이번 달 N건"`
 *     단순 카피로 떨어지지만, 회상 노트 톤(PRD §2)에선 "0건 → N건" 비교 자체가 무의미하다.
 *   - 더 본질적인 회귀 시드: 만약 worker 가 향후 비율 계산(`(cur - prev) / prev * 100`) 도입 시 prev=0
 *     이면 Infinity / NaN 이 그대로 노출될 위험. 본 spec 이 prev=0 분기를 명시 잠금.
 *
 * 본 spec 은 다음을 잠근다:
 *   1. prev == null → null 반환 (UI 에서 카피 생략).
 *   2. prev === 0 → 첫 달 사용자용 부드러운 카피. 키워드 후보: "첫 달" 또는 "비교할" 또는 "지난 달".
 *      구체적 카피는 worker 자율 — 다만 결과 문자열에 "Infinity" / "NaN" / "%" 가 포함되면 안 된다.
 *   3. prev > 0 && cur >= prev → "지난 달 N건 → 이번 달 M건" 형태.
 *   4. prev > 0 && cur < prev → 동일 단순 표기 (강박 회피).
 *
 * worker 청산 후 기대:
 *   - `formatDiff` 를 `lib/dashboard/format-diff.ts` 로 추출 + named export.
 *   - widget-this-month-summary.tsx 가 lib 함수를 import.
 *   - prev=0 일 때 별도 분기로 첫 달 카피 노출.
 *
 * 빨강 시드:
 *   - 모듈 자체가 아직 없음 → dynamic import throw → 모든 케이스 빨강.
 *
 * memo-builder.test.ts 패턴 정합 — typecheck 통과 + vitest 단계 빨강.
 */

type FormatDiffFn = (prev: number | null, cur: number) => string | null;
const FORMAT_DIFF_PATH = "@/lib/dashboard/format-diff";

async function loadFormatDiff(): Promise<FormatDiffFn> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(/* @vite-ignore */ FORMAT_DIFF_PATH)) as unknown as Record<
      string,
      unknown
    >;
  } catch (e) {
    throw new Error(
      "lib/dashboard/format-diff.ts 모듈을 불러올 수 없어요. " +
        "worker 가 widget-this-month-summary.tsx::formatDiff 를 " +
        "`lib/dashboard/format-diff.ts::formatDiff` 로 추출하지 않았어요. (011 §C-2)\n" +
        `원본: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const fn = mod.formatDiff;
  if (typeof fn !== "function") {
    throw new Error(
      "formatDiff 가 lib/dashboard/format-diff.ts 에서 named export 되지 않았어요.",
    );
  }
  return fn as FormatDiffFn;
}

describe("[C-2] formatDiff", () => {
  it("prev=null → null (UI 에서 카피 생략)", async () => {
    const formatDiff = await loadFormatDiff();
    expect(formatDiff(null, 5)).toBeNull();
  });

  it("prev=0, cur>0 → 첫 달 사용자용 부드러운 카피 + NaN/Infinity/% 미포함", async () => {
    const formatDiff = await loadFormatDiff();
    const result = formatDiff(0, 5);
    expect(result).not.toBeNull();
    const s = result!;
    // 비율 계산이 그대로 흘러가지 않도록 잠금.
    expect(s).not.toMatch(/Infinity/);
    expect(s).not.toMatch(/NaN/);
    expect(s).not.toMatch(/%/);
    // 부드러운 카피 — "첫 달" / "비교할" / "지난 달" 중 적어도 하나는 포함.
    expect(s).toMatch(/(첫 달|비교할|지난 달)/);
  });

  it("prev=0, cur=0 → null 또는 부드러운 fallback (비교 자체 무의미)", async () => {
    const formatDiff = await loadFormatDiff();
    const result = formatDiff(0, 0);
    // null 이거나 부드러운 카피 — 어느 쪽이든 Infinity/NaN/% 노출 X.
    if (result !== null) {
      expect(result).not.toMatch(/Infinity/);
      expect(result).not.toMatch(/NaN/);
      expect(result).not.toMatch(/%/);
    }
  });

  it("prev>0, cur>=prev → '지난 달 N건 → 이번 달 M건' 단순 표기", async () => {
    const formatDiff = await loadFormatDiff();
    expect(formatDiff(3, 5)).toBe("지난 달 3건 → 이번 달 5건");
    expect(formatDiff(5, 5)).toBe("지난 달 5건 → 이번 달 5건");
  });

  it("prev>0, cur<prev → 동일 단순 표기 (강박 카피 회피)", async () => {
    const formatDiff = await loadFormatDiff();
    expect(formatDiff(7, 3)).toBe("지난 달 7건 → 이번 달 3건");
  });
});
