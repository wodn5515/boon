import { defineConfig, devices } from "@playwright/test";

// Boon의 사용자 흐름 E2E 테스트 설정.
// 실제 spec 파일은 다음 슬라이스부터 test-writer 에이전트가 e2e/tests/에 작성한다.
// webServer 옵션으로 `npm run dev`를 자동 기동해 baseURL에서 응답을 받는다.

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e/tests",
  // 실제 spec이 없는 부트스트랩 단계에서 testMatch에 매칭되는 파일이 없어도 정상 종료시키기 위함.
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
