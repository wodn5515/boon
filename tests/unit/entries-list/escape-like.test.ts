import { describe, expect, it } from "vitest";

/**
 * `lib/entries-list/queries.ts` 의 메모 검색용 escape 함수 회귀 잠금 (시나리오 20).
 *
 * PR #4 §J-8 패턴 (lib/friends/queries.ts::escapeLike) 을 entries-list 검색에도 동일하게 적용해야 한다.
 * 디자이너 결정 로그 008 §F 의 SQL 규약: "ILIKE '%' || escape(q) || '%'".
 *
 * 본 spec 은 worker 가 본격 SQL 결합 시 escape 함수를 entries-list/queries 에서 export 하기를 요구한다.
 * (worker 가 별도 util 파일로 추출하는 변경을 선택하면 Lead 가 spec import 경로를 갱신 결정.)
 *
 * 회귀 잠금 룰 (sfx 라운드 1 🟢 #8 + 004 §D):
 *   - 백슬래시 `\` 는 `\\` 로
 *   - 퍼센트 `%` 는 `\%` 로
 *   - 언더스코어 `_` 는 `\_` 로
 *   - 그 외 문자는 그대로
 *   - 한국어/이모지/숫자/공백 모두 통과
 *   - 빈 문자열은 빈 문자열 그대로
 *
 * 통합 spec(시나리오 14-b/14-c) 가 SQL 단의 효과를 같이 잠그므로,
 * 본 단위 spec 은 순수 함수 시그니처 회귀 잠금에만 집중.
 */

// worker 가 export 하기 전엔 함수가 존재하지 않을 수 있으므로 dynamic import 결과를
// unknown 으로 받아 런타임에서만 검증한다. typecheck:tests 는 통과하되 vitest 단계에서
// "함수 없음" 또는 "와일드카드 escape 미적용" 으로 spec 이 빨갛게 떨어진다.
async function loadEscapeLike(): Promise<(input: string) => string> {
  const mod = (await import("@/lib/entries-list/queries")) as unknown as Record<
    string,
    unknown
  >;
  const fn = mod.escapeLike;
  if (typeof fn !== "function") {
    throw new Error(
      "escapeLike 가 lib/entries-list/queries.ts 에서 export 되지 않았다. " +
        "worker 가 메모 검색 SQL 결합 시 escape 함수를 동일 파일에서 export 하거나, " +
        "공용 util 로 옮긴 뒤 본 spec import 경로를 Lead 가 갱신해야 한다.",
    );
  }
  return fn as (input: string) => string;
}

describe("entries-list escapeLike", () => {
  it("LIKE 와일드카드 문자를 모두 escape 한다 (\\, %, _)", async () => {
    const escapeLike = await loadEscapeLike();
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c\\d")).toBe("c\\\\d");
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("와일드카드가 없는 평범한 문자열은 그대로 통과 (한글·이모지·숫자·공백 포함)", async () => {
    const escapeLike = await loadEscapeLike();
    expect(escapeLike("이사 도와줌")).toBe("이사 도와줌");
    expect(escapeLike("KeepWord ABC 123")).toBe("KeepWord ABC 123");
    expect(escapeLike("💝 마음")).toBe("💝 마음");
  });

  it("빈 문자열은 빈 문자열 그대로", async () => {
    const escapeLike = await loadEscapeLike();
    expect(escapeLike("")).toBe("");
  });
});
