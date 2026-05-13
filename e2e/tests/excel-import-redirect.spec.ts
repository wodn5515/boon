import { expect, test } from "@playwright/test";

/**
 * /entries/import 페이지의 비로그인 redirect 회귀 잠금 (시나리오 7, 009 슬라이스).
 *
 * - auth-redirect.spec.ts 가 PROTECTED_ROUTES 묶음으로 인증 경로 일반 가드를 검사하지만,
 *   본 슬라이스에서 새로 결합된 `/entries/import` 가 RSC 진입 단에서 인증 가드를 거치지 않으면
 *   엑셀 import UI 가 비로그인 사용자에게 노출되는 사고가 발생한다.
 * - 인증 fixture 미적용 = 비로그인 상태. middleware 또는 (authenticated)/layout 어느 단계에서든
 *   `/login` 으로 보내야 한다 (008 entries-list-redirect 패턴 정합).
 *
 * 본 spec 은 test-with-reset 미사용 — 비로그인 redirect 회귀이므로 e2e-store 조작 대상 아님
 * (008 entries-list-redirect.spec.ts 와 동일 정책).
 */

test.describe("/entries/import 비로그인 가드", () => {
  test("[시나리오 7] 비로그인 사용자가 /entries/import 에 접근하면 /login 으로 redirect 된다", async ({
    page,
  }) => {
    await page.goto("/entries/import");
    await page.waitForURL("**/login**");
    expect(new URL(page.url()).pathname).toBe("/login");
    await expect(
      page.getByRole("button", { name: /Google로 계속하기/ }),
    ).toBeVisible();
  });
});
