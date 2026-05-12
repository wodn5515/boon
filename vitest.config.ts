import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Boon의 단위·통합 테스트는 Vitest 단일 실행기로 돌린다.
// React Testing Library를 함께 쓰므로 jsdom 환경이 기본.
// 실제 spec 파일은 다음 슬라이스에서 test-writer 에이전트가 작성한다.

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
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e/**"],
    css: false,
  },
});
