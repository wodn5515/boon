import { defineConfig, devices } from "@playwright/test";

// Boon의 사용자 흐름 E2E 테스트 설정.
// webServer 옵션으로 `npm run dev`를 자동 기동해 baseURL에서 응답을 받는다.

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

// 결정 로그 003 §D·§E:
//   실제 Google OAuth 라운드트립이 없는 E2E 슬라이스이므로 Supabase env 는 placeholder 만 주입한다.
//   `E2E_BYPASS_AUTH=1` + `NODE_ENV !== "production"` 가드가 fake 쿠키 신뢰 경로를 활성화한다.
//   process.env 에 직접 채워주면:
//     (a) fixture (`e2e/fixtures/auth.ts`) 가 same-process 에서 그 값을 그대로 읽고
//     (b) 아래 webServer.env 가 child process 로 넘긴다.
const FALLBACK_SUPABASE_URL = "https://placeholder.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "placeholder-anon-key";
const FALLBACK_DATABASE_URL = "postgres://placeholder:placeholder@localhost:5432/placeholder";
const FALLBACK_APP_URL = "http://localhost:3000";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= FALLBACK_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= FALLBACK_SUPABASE_ANON_KEY;
process.env.DATABASE_URL ??= FALLBACK_DATABASE_URL;
process.env.NEXT_PUBLIC_APP_URL ??= FALLBACK_APP_URL;
process.env.E2E_BYPASS_AUTH ??= "1";

export default defineConfig({
  testDir: "./e2e/tests",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 결정 로그 006 §J-7 후속:
  //   CI / 로컬 모두 단일 worker 직렬화로 통일. 멀티-worker 환경은 단일 dev 서버 + globalThis
  //   e2e-store 를 공유해 worker 간 reset/state-set race condition 이 발생한다.
  //   per-test session namespace 도입 전까지 (V2 메모 — 결정 로그 006 후속) 단일 worker 유지.
  workers: 1,
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
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      E2E_BYPASS_AUTH: process.env.E2E_BYPASS_AUTH,
      // 결정 로그 011 §B-1 — Next.js webServer(dev) 프로세스에도 KST 잠금.
      //   `use.timezoneId` 는 브라우저 컨텍스트만 잡지, 서버 사이드 Date 는 호스트 TZ 를 본다.
      //   여기서 명시 주입해 자정 경계 회귀를 차단.
      TZ: "Asia/Seoul",
    },
  },
});
