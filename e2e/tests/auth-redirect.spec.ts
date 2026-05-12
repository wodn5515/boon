import { expect, test } from "@playwright/test";

/**
 * 보호 라우트 인증 게이트 (시나리오 2).
 *
 * - 비로그인 상태에서 `/`, `/friends`, `/entries`, `/settings` 에 GET 으로 접속하면
 *   모두 `/login` 으로 302 redirect 되어야 한다.
 * - 이 spec은 Playwright의 자동 redirect-follow 동작에 의존한다 — 최종 URL이
 *   `/login` 으로 끝나면 통과.
 * - 인증 fixture를 적용하지 않으므로 storageState 없음 = 비로그인.
 */

const PROTECTED_ROUTES = ["/", "/friends", "/entries", "/settings"] as const;

test.describe("비로그인 사용자가 보호 라우트에 접근", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`[시나리오 2] ${route} → /login redirect`, async ({ page }) => {
      await page.goto(route);

      // 최종적으로 /login 페이지에 도달해야 한다.
      await page.waitForURL("**/login**");
      expect(new URL(page.url()).pathname).toBe("/login");
      // 로그인 화면이 정상 렌더링되었는지도 가볍게 확인.
      await expect(
        page.getByRole("button", { name: /Google로 계속하기/ }),
      ).toBeVisible();
    });
  }
});
