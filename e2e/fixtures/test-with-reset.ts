import { test as base, expect } from "@playwright/test";

/**
 * 자동 reset hook이 부착된 Playwright `test` (결정 로그 006 §J — e2e-store 격리).
 *
 * 배경:
 *   - 슬라이스가 늘면서 categories / friends / entries Server Action 본체가
 *     E2E_BYPASS_AUTH 경로에서 in-memory `e2e-store` 로 합쳐 동작한다.
 *   - 같은 worker 프로세스 안에서 spec 여러 개가 직렬로 도는 경우 store 가 누적되어
 *     앞 test 의 부산물이 다음 test 의 가정을 깨뜨린다 (예: settings 시나리오 7 에서
 *     "사용자 그룹의 첫 카테고리" 인덱스가 시나리오 2·3 의 잔존 카테고리에 밀려난다).
 *   - 단독 실행은 통과하고 시리얼 실행에서만 실패 — inter-test 상태 누수.
 *
 * 해결:
 *   - 각 test 시작 전에 `/api/_test/reset` 를 POST 호출해 store 를 비운다.
 *   - 라우트는 E2E_BYPASS_AUTH=1 가드를 통과한 환경에서만 동작하도록 worker 가 구현한다.
 *   - 라우트 응답이 비-2xx 이면 fixture 단계에서 즉시 throw — "라우트 미존재" 상태를
 *     spec 빨강으로 노출해 회귀를 잡는다.
 *
 * 사용법:
 *   ```ts
 *   import { expect, test } from "../fixtures/test-with-reset";
 *   ```
 *   spec 본문 / 시나리오 / assertion 은 그대로 둔다. 인증이 필요하면 기존처럼
 *   `test.use({ storageState: authenticatedStorageState() })` 를 호출하면 된다.
 *
 * 비로그인 회귀 spec 들(auth-redirect / settings-redirect / friends-redirect)은
 * store 조작 대상이 아니므로 fixture 적용 대상에서 제외한다 (Lead 결정).
 */

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const baseURL =
      (testInfo.project.use.baseURL as string | undefined) ??
      process.env.PLAYWRIGHT_BASE_URL ??
      "http://localhost:3000";

    const response = await page.request.post(`${baseURL}/api/_test/reset`);
    if (!response.ok()) {
      throw new Error(
        `E2E reset 실패: ${response.status()} ${response.statusText()} — ` +
          `worker 가 app/api/_test/reset/route.ts 를 만들었는지 확인하라. ` +
          `(결정 로그 006 §J: e2e-store inter-test 격리)`,
      );
    }

    await use(page);
  },
});

export { expect };
