import { describe, expect, it } from "vitest";

/**
 * `pickGreetingName` — 인사말 이름 선택 헬퍼 회귀 잠금 (011 §C-1).
 *
 * 회귀 시드 (PR #6 review §):
 *   - 현재 `app/(authenticated)/page.tsx::pickGreetingName` 가 module-private 으로
 *     `slice(0, at)` 방식. `at = email.indexOf("@")` 가 -1 일 때 `at <= 0` 분기로 빠져 email
 *     원문이 그대로 노출된다. 즉 `pickGreetingName({email: "noatsign"})` → "noatsign".
 *   - 사용자가 보기엔 "@ 가 없는 이상한 이메일" 이 그대로 인사말로 노출 — 회상 노트 톤과 안 맞고
 *     혹시 모를 PII 의 무방비 노출.
 *
 * 본 spec 은 다음을 잠근다:
 *   1. `@` 가 없는 이메일은 fallback `"친구"` 로 대체.
 *   2. 정상 이메일은 `@` 앞부분만 추출.
 *   3. user 가 null 이거나 email 이 null/빈 문자열이면 `"친구"`.
 *
 * worker 청산 후 기대:
 *   - `pickGreetingName` 을 `lib/dashboard/greeting.ts` 로 추출 + named export.
 *   - app/(authenticated)/page.tsx 가 lib 함수를 import 해서 사용.
 *
 * 빨강 시드:
 *   - 모듈 자체가 아직 없음 → dynamic import 가 런타임 throw → 모든 케이스 빨강.
 *
 * memo-builder.test.ts 패턴 정합 — typecheck 통과 + vitest 단계 빨강.
 */

type PickGreetingNameFn = (user: { email: string | null } | null) => string;
const GREETING_PATH = "@/lib/dashboard/greeting";

async function loadPickGreetingName(): Promise<PickGreetingNameFn> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(/* @vite-ignore */ GREETING_PATH)) as unknown as Record<
      string,
      unknown
    >;
  } catch (e) {
    throw new Error(
      "lib/dashboard/greeting.ts 모듈을 불러올 수 없어요. " +
        "worker 가 app/(authenticated)/page.tsx::pickGreetingName 을 " +
        "`lib/dashboard/greeting.ts::pickGreetingName` 으로 추출하지 않았어요. (011 §C-1)\n" +
        `원본: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const fn = mod.pickGreetingName;
  if (typeof fn !== "function") {
    throw new Error(
      "pickGreetingName 이 lib/dashboard/greeting.ts 에서 named export 되지 않았어요.",
    );
  }
  return fn as PickGreetingNameFn;
}

describe("[C-1] pickGreetingName", () => {
  it("정상 이메일 → '@' 앞부분", async () => {
    const pickGreetingName = await loadPickGreetingName();
    expect(pickGreetingName({ email: "alice@boon.test" })).toBe("alice");
  });

  it("이메일에 '@' 가 없으면 fallback '친구'", async () => {
    const pickGreetingName = await loadPickGreetingName();
    expect(pickGreetingName({ email: "noatsign" })).toBe("친구");
  });

  it("이메일이 '@xxx' 처럼 username 비어있으면 fallback '친구'", async () => {
    const pickGreetingName = await loadPickGreetingName();
    expect(pickGreetingName({ email: "@boon.test" })).toBe("친구");
  });

  it("email 이 null 이면 fallback '친구'", async () => {
    const pickGreetingName = await loadPickGreetingName();
    expect(pickGreetingName({ email: null })).toBe("친구");
  });

  it("email 이 빈 문자열이면 fallback '친구'", async () => {
    const pickGreetingName = await loadPickGreetingName();
    expect(pickGreetingName({ email: "" })).toBe("친구");
  });

  it("user 가 null 이면 fallback '친구'", async () => {
    const pickGreetingName = await loadPickGreetingName();
    expect(pickGreetingName(null)).toBe("친구");
  });
});
