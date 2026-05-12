import { expect, test } from "@playwright/test";

/**
 * /settings 비로그인 회귀 보호 (PRD §3, §5 + 결정 로그 003 §C).
 *
 * 시나리오 9: /settings 비로그인 접근 → /login redirect
 *
 * 인증 fixture 미적용 = 비로그인 상태. middleware 매처 + (authenticated)/layout
 * 이중 게이트가 살아있는지 회귀로 잠근다. categories-crud 슬라이스로 새 액션이
 * 들어오며 무심코 /settings 가 열려버리는 회귀를 막는 spec.
 *
 * 기존 `auth-redirect.spec.ts` 가 정적 경로 일괄 점검을 하지만,
 * /settings 가 categories CRUD 로 진화한 뒤에도 동일 보호가 유지되는지
 * 명시적으로 검증한다. (friends-redirect.spec.ts 가 /friends 에 대해 한 것과 동일 패턴.)
 */

test.describe("비로그인 사용자가 /settings 접근", () => {
  test("[시나리오 9] /settings → /login redirect", async ({ page }) => {
    await page.goto("/settings");

    await page.waitForURL("**/login**");
    expect(new URL(page.url()).pathname).toBe("/login");
    await expect(
      page.getByRole("button", { name: /Google로 계속하기/ }),
    ).toBeVisible();
  });
});
