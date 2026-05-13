import { describe, expect, it } from "vitest";

/**
 * `parseMemo` 공백 trim 통일 (시나리오 14 / PR #5 리뷰 🟢 #3).
 *
 * 배경 (PR #5 리뷰 🟢 #3):
 *   - entries Server Action 의 `parseMemo` 는 현재 `parseString(formData, "memo", false)` 를 그대로 돌려준다.
 *   - friend_id / category_id / received_date 등 다른 필드는 모두 `.trim()` 을 거치는데
 *     memo 만 raw 반환이라 사용자가 "   " (공백만) 입력 시 DB 에 공백 row 가 저장된다.
 *   - 디자이너 의도: "빈 메모" 와 "공백만 입력" 은 같은 결과여야 한다 (메모 = 빈 문자열).
 *   - 006 §D 가 "memo NOT NULL 이지만 빈 문자열 허용" 이라 정의 — 빈 문자열 = "기록 없음" 의 sentinel.
 *
 * 결정:
 *   - parseMemo 는 trim 후 결과를 반환한다 → "   " 입력 → "" 반환.
 *   - 통상 입력의 앞뒤 공백도 함께 정리 (예: " 자전거 " → "자전거").
 *
 * 구현 메모 (worker 가 결정):
 *   - 본 spec 은 actions.ts 내부 함수 `parseMemo` 를 모듈 외부에서 직접 잠그기 위해
 *     **`@/lib/entries/parse-memo`** 로의 분리를 강제한다 (export 가능한 위치).
 *   - 분리 후 actions.ts 가 그 모듈을 import 해 사용 — actions.ts 외부 테스트 가능성 회복.
 *   - 다른 모듈 경로(예: `@/app/(authenticated)/entries/parse-memo`) 도 후보지만,
 *     server-only 디렉토리 안의 ts 파일을 vitest 가 jsdom 에서 import 할 때 "use server" 디렉티브
 *     충돌이 발생 가능 — lib/ 아래로 빼는 게 가장 안전. Lead 가 다른 경로로 결정하면 spec 갱신.
 */

import { parseMemo } from "@/lib/entries/parse-memo";

function fd(memo: string | null): FormData {
  const f = new FormData();
  if (memo !== null) f.set("memo", memo);
  return f;
}

describe("parseMemo — 공백 trim 통일", () => {
  it("공백만 입력 ('   ') → '' (빈 메모와 동일)", () => {
    expect(parseMemo(fd("   "))).toBe("");
  });

  it("탭/개행만 입력 → ''", () => {
    expect(parseMemo(fd("\n\t  \n"))).toBe("");
  });

  it("빈 문자열 → '' (기존 동작 유지)", () => {
    expect(parseMemo(fd(""))).toBe("");
  });

  it("memo 필드 자체가 누락된 FormData → ''", () => {
    expect(parseMemo(fd(null))).toBe("");
  });

  it("내용이 있으면 앞뒤 공백만 정리 (안쪽 공백·줄바꿈 보존)", () => {
    expect(parseMemo(fd("  자전거 같이 끌고 가줘서.  "))).toBe(
      "자전거 같이 끌고 가줘서.",
    );
    expect(parseMemo(fd("첫 줄\n두 번째 줄"))).toBe("첫 줄\n두 번째 줄");
  });

  it("내용 앞뒤가 깨끗하면 그대로 반환", () => {
    expect(parseMemo(fd("바람 빠진 자전거"))).toBe("바람 빠진 자전거");
  });
});
