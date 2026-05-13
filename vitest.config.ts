import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Boon의 단위·통합 테스트는 Vitest 단일 실행기로 돌린다.
// React Testing Library를 함께 쓰므로 jsdom 환경이 기본.
//
// 결정 로그 004 §G — 테스트 typecheck 인프라:
//   `test.typecheck` 를 enabled 로 두고 `tsconfig.test.json` 으로 tests/** + e2e/** 를 검사한다.
//   `npm run typecheck:tests` 도 동일 tsconfig 를 사용해 직접 tsc 호출 (CI/로컬 빠른 검사 양립).

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e/**"],
    css: false,
    // 결정 로그 011 §B-1 — next.config.ts env.TZ 와 같은 잠금을 vitest 호스트에도 강제한다.
    //   CI / 로컬 호스트의 TZ 에 무관하게 KST 기준 aggregateMonthlyTrend / Date 결정성 확보.
    env: {
      TZ: "Asia/Seoul",
    },
    typecheck: {
      enabled: false, // 로컬 watch 비용 회피. CI/수동 검사는 `npm run typecheck:tests` 로 일괄 수행.
      tsconfig: "./tsconfig.test.json",
    },
  },
});
