import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/server/revalidate.ts::safeRevalidate(path, scope)` 단위 테스트 (시나리오 20).
 *
 * 배경 (사용자 PR #3 🟢 #5 + 005 사용자 리뷰 🟢 #4):
 *   - friends/actions.ts·settings/actions.ts 가 각자 `safeRevalidate` 를 인라인 정의해
 *     운영(production) 에서는 `console.warn` 으로 가시화, 테스트/로컬에서는 silent 한다.
 *   - entries 슬라이스가 새 액션 파일을 또 추가하면 같은 패턴이 세 번 반복된다.
 *   - worker 가 본 슬라이스에서 공통 헬퍼 `lib/server/revalidate.ts` 로 추출한다 — 본 spec
 *     은 그 추출 결과의 행동을 잠근다.
 *
 * 시그니처 (Lead 명세):
 *   ```
 *   export function safeRevalidate(path: string, scope: string): void
 *   ```
 *   - `path` 는 `revalidatePath` 인자.
 *   - `scope` 는 production warn 로그에 함께 찍히는 호출자 식별자
 *     (예: "friends/actions" / "settings/actions" / "entries/actions").
 *   - 반환값 없음. throw 하지 않는다.
 *
 * 검증:
 *   (1) 정상 흐름 — `revalidatePath(path)` 가 정확히 한 번 호출된다.
 *   (2) `revalidatePath` 가 throw + NODE_ENV=production → `console.warn` 호출되고
 *       throw 가 바깥으로 새지 않는다. warn 메시지에 scope 와 path 가 포함된다.
 *   (3) `revalidatePath` 가 throw + NODE_ENV != production → console.warn 미호출,
 *       silent 통과 (테스트 환경에서 시끄러운 stderr 막기 위함).
 *
 * worker 가 구현할 모듈 (`lib/server/revalidate.ts`):
 *   - `next/cache` 의 `revalidatePath` 를 import 해서 호출.
 *   - production 에서만 warn — `process.env.NODE_ENV === "production"` 가드.
 */

// next/cache 의 revalidatePath 를 모듈 단위로 모킹.
const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (path: string, ...rest: unknown[]) =>
    revalidatePathMock(path, ...rest),
}));

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe("lib/server/revalidate::safeRevalidate", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
  });
  afterEach(() => {
    // 다른 테스트로 NODE_ENV 누수 방지.
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    vi.restoreAllMocks();
  });

  it("정상 흐름: revalidatePath 를 path 인자로 호출한다", async () => {
    const { safeRevalidate } = await import("@/lib/server/revalidate");

    safeRevalidate("/entries", "entries/actions");

    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/entries");
  });

  it("revalidatePath 가 throw + production → console.warn 으로 가시화 후 silent 통과", async () => {
    // production 환경 흉내. process.env.NODE_ENV 는 readonly 처럼 보이지만 런타임에서는 set 가능.
    process.env.NODE_ENV = "production";
    revalidatePathMock.mockImplementation(() => {
      throw new Error("not in request scope");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { safeRevalidate } = await import("@/lib/server/revalidate");

    // throw 가 외부로 새면 액션이 깨진다 — 본 헬퍼는 항상 silent 통과여야 한다.
    expect(() =>
      safeRevalidate("/friends/abc", "entries/actions"),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, payload] = warnSpy.mock.calls[0]!;
    // 호출자 scope 가 메시지에 포함되어야 stack 없이도 어느 액션이 실패했는지 알 수 있다.
    expect(String(message)).toContain("entries/actions");
    // path 도 payload 어딘가에 살아 있어야 한다 (운영 로그에서 어떤 캐시 키였는지 추적 가능).
    const haystack = JSON.stringify(payload ?? {}) + String(message);
    expect(haystack).toContain("/friends/abc");
  });

  it("revalidatePath 가 throw + production 외 → console.warn 미호출 (테스트 환경 silent)", async () => {
    process.env.NODE_ENV = "test";
    revalidatePathMock.mockImplementation(() => {
      throw new Error("not in request scope");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { safeRevalidate } = await import("@/lib/server/revalidate");

    expect(() => safeRevalidate("/entries", "entries/actions")).not.toThrow();

    // 테스트/로컬에서는 silent — stderr 노이즈 회피.
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
