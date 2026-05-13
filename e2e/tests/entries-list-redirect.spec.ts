import { expect, test } from "@playwright/test";

/**
 * /entries 리스트 페이지의 비로그인 redirect 회귀 잠금 (시나리오 12).
 *
 * - auth-redirect.spec.ts 가 PROTECTED_ROUTES 묶음으로 이미 `/entries` 를 검사하지만,
 *   본 슬라이스에서 `/entries` 가 실제 페이지로 결합되며 page-level 분기가 늘었으므로
 *   회귀가 정확히 본 페이지 단에서도 잡히도록 별도 spec 하나를 더 둔다 (008 후속).
 * - 인증 fixture 미적용 = 비로그인 상태. ?q= 같은 검색 쿼리가 붙어 있어도
 *   middleware/page 어느 단계에서든 `/login` 으로 보내야 한다.
 *
 * worker 결합 시 변경 가능성:
 *   - `/entries` 가 RSC 진입 단에서 인증 가드를 거치지 않으면 노출 사고. 본 spec 이 빨갛게 막는다.
 */

test.describe("/entries 비로그인 가드", () => {
  test("[시나리오 12] 비로그인 사용자가 /entries 에 접근하면 /login 으로 redirect 된다", async ({
    page,
  }) => {
    await page.goto("/entries");
    await page.waitForURL("**/login**");
    expect(new URL(page.url()).pathname).toBe("/login");
    await expect(
      page.getByRole("button", { name: /Google로 계속하기/ }),
    ).toBeVisible();
  });

  test("[시나리오 12-b] 비로그인 사용자가 /entries?q=... 검색 쿼리와 함께 접근해도 /login 으로 redirect 된다", async ({
    page,
  }) => {
    await page.goto("/entries?q=비밀&friend=anything&sort=oldest");
    await page.waitForURL("**/login**");
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});
