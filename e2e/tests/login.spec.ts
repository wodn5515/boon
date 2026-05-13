import { expect, test } from "@playwright/test";

import { authenticatedStorageState } from "../fixtures/auth";

/**
 * `/login` 페이지 E2E.
 *
 * 검증 시나리오 (Lead 명세 §1, §3, §4):
 *   1. 비로그인 사용자가 /login 진입 → Boon 타이틀 + "Google로 계속하기" 버튼 노출
 *   3. 인증된 사용자가 /login 진입 → / 로 redirect
 *   4. 인증된 사용자가 / 진입 → 200 (placeholder 페이지)
 *
 * 인증 컨텍스트 분기:
 *   - "비로그인" describe: storageState 미지정 (기본값)
 *   - "인증된 사용자" describe: storageState = authenticatedStorageState()
 */

test.describe("비로그인 사용자", () => {
  test("[시나리오 1] /login 진입 시 Boon 타이틀과 Google 버튼이 보인다", async ({
    page,
  }) => {
    await page.goto("/login");

    // "Boon" 타이틀 — heading role 또는 강조 텍스트 어느 쪽이든 가시적이어야 한다.
    // (CardTitle은 shadcn 기본이 <div>라 role=heading이 아닐 수 있어 텍스트로 검증.)
    await expect(page.getByText("Boon", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Google로 계속하기/ }),
    ).toBeVisible();
    // 로그인 페이지에 머물러야 한다 (인증 redirect 발생 금지).
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});

test.describe("인증된 사용자", () => {
  test.use({ storageState: authenticatedStorageState() });

  test("[시나리오 3] /login 진입 시 / 로 redirect 된다", async ({ page }) => {
    await page.goto("/login");
    // Supabase 세션 쿠키가 있는 상태에서 /login은 더 머무를 이유가 없음.
    await page.waitForURL("**/");
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("[시나리오 4] / 진입 시 대시보드 페이지가 200으로 응답한다", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");
    // 디자이너 88e4fa1 메인 대시보드 재작성 이후 — 인사말 heading 으로 정상 렌더 검증.
    // (이전 PR #1 placeholder 카피 "받은 마음이 바람처럼 분다" 는 자연 폐기 — 결정 로그 007 §2.)
    await expect(
      page.getByRole("heading", { name: /안녕하세요/ }),
    ).toBeVisible();
  });
});
