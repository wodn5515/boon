import { describe, expect, it } from "vitest";

/**
 * `lib/import/memo-builder.ts::buildMemo` 단위 테스트 (시나리오 13).
 *
 * 결정 로그 009 — 엑셀 import 의 메모 빌더 규약:
 *
 *  - 입력: { eventName, name, amount, note }
 *  - 출력: 부분 문자열을 " · " 구분자로 join
 *  - 누락 필드(amount/note)는 skip — 빈 문자열은 안 들어감
 *  - 금액은 숫자 추출 후 ko-KR locale 콤마 포맷 ("1000000" → "금액 1,000,000원")
 *  - 비숫자 amount("10만원") 는 숫자만 추출 후 콤마 포맷 ("금액 100,000원")
 *  - 숫자 0개 amount("일금") 는 그대로 "금액 일금"
 *  - eventName 과 name 은 필수 (양쪽 다 채워져 있다고 가정)
 *
 * worker 결합 요구 (시그니처 잠금):
 *   - 본 빌더는 `lib/import/memo-builder.ts` 로 분리되어 named export `buildMemo` 로 노출.
 *   - 디자이너 라운드는 components/import/step-5-preview.tsx 안에 인라인 `buildMemo` 가 있어
 *     worker 가 lib 로 추출 + Step 5 가 동일 함수를 import 하도록 결합한다.
 *   - bulkImportEntries 도 같은 함수를 호출 — 미리보기 메모 == DB 저장 메모 가 보장됨.
 *
 *   ```ts
 *   export function buildMemo(input: {
 *     eventName: string;
 *     name: string;
 *     amount: string | null;
 *     note: string | null;
 *   }): string;
 *   ```
 *
 * worker 가 추출 안 하면 본 spec 의 dynamic import 가 런타임에 throw 해 빨갛게 떨어진다
 * (escape-like.test.ts 시나리오 20 패턴 정합 — typecheck 는 통과시키되 vitest 단계에서 fail).
 */

type BuildMemoInput = {
  eventName: string;
  name: string;
  amount: string | null;
  note: string | null;
};
type BuildMemoFn = (input: BuildMemoInput) => string;

// worker 가 lib/import/memo-builder.ts 를 추출하기 전엔 모듈 자체가 없어 정적 import 는
// typecheck 단계에서 막힌다. 변수 경유 dynamic import 로 typecheck 통과 + 런타임에서만 검증.
const MEMO_BUILDER_PATH = "@/lib/import/memo-builder";

async function loadBuildMemo(): Promise<BuildMemoFn> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(/* @vite-ignore */ MEMO_BUILDER_PATH)) as unknown as Record<
      string,
      unknown
    >;
  } catch (e) {
    throw new Error(
      "lib/import/memo-builder.ts 모듈을 불러올 수 없어요. " +
        "worker 가 Step 5 의 인라인 buildMemo 를 `lib/import/memo-builder.ts::buildMemo` 로 " +
        "추출하지 않았어요. (009 결정 로그 + memo-builder spec 시나리오 13)\n" +
        `원본: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const fn = mod.buildMemo;
  if (typeof fn !== "function") {
    throw new Error(
      "buildMemo 가 lib/import/memo-builder.ts 에서 named export 되지 않았어요. " +
        "worker 결합 시 `export function buildMemo(input: ...): string` 으로 노출하세요.",
    );
  }
  return fn as BuildMemoFn;
}

describe("lib/import/memo-builder::buildMemo", () => {
  // ============================================================
  // 시나리오 13-a — 4필드 모두 채워짐
  // ============================================================
  it("[시나리오 13-a] 모든 필드(이벤트명·이름·금액·비고) 가 있으면 ' · ' 구분자로 모두 합쳐진다", async () => {
    const buildMemo = await loadBuildMemo();
    expect(
      buildMemo({
        eventName: "결혼식 축의금",
        name: "김민준",
        amount: "100000",
        note: "회사 동료",
      }),
    ).toBe("결혼식 축의금 · 김민준 · 금액 100,000원 · 회사 동료");
  });

  // ============================================================
  // 시나리오 13-b — 금액 누락
  // ============================================================
  it("[시나리오 13-b] amount 가 null 이면 '금액 ...' 부분이 빠진다", async () => {
    const buildMemo = await loadBuildMemo();
    expect(
      buildMemo({
        eventName: "결혼식 축의금",
        name: "이서윤",
        amount: null,
        note: "대학 친구",
      }),
    ).toBe("결혼식 축의금 · 이서윤 · 대학 친구");
  });

  // ============================================================
  // 시나리오 13-c — 비고 누락
  // ============================================================
  it("[시나리오 13-c] note 가 null 이면 비고 부분이 빠진다", async () => {
    const buildMemo = await loadBuildMemo();
    expect(
      buildMemo({
        eventName: "결혼식 축의금",
        name: "박도윤",
        amount: "50000",
        note: null,
      }),
    ).toBe("결혼식 축의금 · 박도윤 · 금액 50,000원");
  });

  // ============================================================
  // 시나리오 13-d — 금액·비고 모두 누락 (이벤트명·이름만)
  // ============================================================
  it("[시나리오 13-d] amount 와 note 모두 null 이면 '이벤트명 · 이름' 만", async () => {
    const buildMemo = await loadBuildMemo();
    expect(
      buildMemo({
        eventName: "장례식 조의금",
        name: "최은우",
        amount: null,
        note: null,
      }),
    ).toBe("장례식 조의금 · 최은우");
  });

  // ============================================================
  // 시나리오 13-e — 큰 금액의 ko-KR locale 포맷
  // ============================================================
  it("[시나리오 13-e] 큰 금액도 ko-KR locale 콤마 포맷 (1,000,000원)", async () => {
    const buildMemo = await loadBuildMemo();
    expect(
      buildMemo({
        eventName: "결혼식",
        name: "정하준",
        amount: "1000000",
        note: null,
      }),
    ).toBe("결혼식 · 정하준 · 금액 1,000,000원");
  });

  // ============================================================
  // 시나리오 13-f — 비숫자 amount 는 숫자만 추출 후 locale 포맷
  // ============================================================
  it("[시나리오 13-f] amount '10만원' → 숫자만 추출 후 ko-KR locale 포맷 → '금액 100,000원'", async () => {
    // 디자이너 buildMemo 거동: amount.replace(/[^\d]/g, "") → "100000" → toLocaleString("ko-KR") → "100,000".
    const buildMemo = await loadBuildMemo();
    expect(
      buildMemo({
        eventName: "결혼식",
        name: "박지호",
        amount: "10만원",
        note: null,
      }),
    ).toBe("결혼식 · 박지호 · 금액 100,000원");
  });

  it("[시나리오 13-f-2] amount 에서 숫자가 하나도 안 뽑히면 입력값 그대로 '금액 X' 로 합쳐진다", async () => {
    // 숫자 0개라 onlyDigits === "" → `금액 ${amount}` 분기.
    const buildMemo = await loadBuildMemo();
    expect(
      buildMemo({
        eventName: "결혼식",
        name: "박지호",
        amount: "일금",
        note: null,
      }),
    ).toBe("결혼식 · 박지호 · 금액 일금");
  });

  // ============================================================
  // 시나리오 13-g — 빈 문자열 amount 는 skip (정규화 후 빈)
  // ============================================================
  it("[시나리오 13-g] amount 가 빈 문자열이면 '금액 ...' 부분이 빠진다 (null 과 동일 효과)", async () => {
    const buildMemo = await loadBuildMemo();
    expect(
      buildMemo({
        eventName: "결혼식",
        name: "김민준",
        amount: "",
        note: "회사 동료",
      }),
    ).toBe("결혼식 · 김민준 · 회사 동료");
  });

  // ============================================================
  // 시나리오 13-h — 비고 양쪽 trim
  // ============================================================
  it("[시나리오 13-h] note 양쪽 공백은 trim 되어 합쳐진다", async () => {
    const buildMemo = await loadBuildMemo();
    expect(
      buildMemo({
        eventName: "결혼식",
        name: "이서윤",
        amount: null,
        note: "  대학 친구  ",
      }),
    ).toBe("결혼식 · 이서윤 · 대학 친구");
  });
});
