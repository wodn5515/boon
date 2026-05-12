import { expect, test } from "@playwright/test";

/**
 * /friends 비로그인 회귀 보호 (PRD §3, §5 + 결정 로그 003 §C).
 *
 * 시나리오 7: /friends → /login redirect
 * 시나리오 8: /friends/<anything> → /login redirect (동적 라우트도 게이트 통과)
 *
 * 인증 fixture 미적용 = 비로그인 상태. middleware 매처가 /friends/** 를 보호하는지
 * 회귀로 잠근다. friends-crud 슬라이스로 새 페이지·서버액션이 추가되며 무심코
 * 라우트가 열려버리는 회귀를 막는 spec.
 *
 * 기존 `e2e/tests/auth-redirect.spec.ts` 가 정적 경로 목록만 검증하는 한계 보완 —
 * 여기서는 동적 friend ID 까지 포함한다.
 */

test.describe("비로그인 사용자가 /friends 접근", () => {
  test("[시나리오 7] /friends → /login redirect", async ({ page }) => {
    await page.goto("/friends");

    await page.waitForURL("**/login**");
    expect(new URL(page.url()).pathname).toBe("/login");
    await expect(
      page.getByRole("button", { name: /Google로 계속하기/ }),
    ).toBeVisible();
  });

  test("[시나리오 8] /friends/<id> → /login redirect (동적 라우트도 게이트)", async ({
    page,
  }) => {
    // 친구 ID 는 UUID 또는 임의 문자열 — middleware 가 패턴 따위 보지 않고
    // 모든 /friends/** 를 게이트로 통과시켜야 한다.
    await page.goto("/friends/00000000-0000-0000-0000-000000000999");

    await page.waitForURL("**/login**");
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});
