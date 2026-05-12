import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit 설정 — 마이그레이션 생성·적용 도구.
 *
 * - schema 폴더의 모든 ts 파일을 스캔해 `db/migrations/` 에 SQL 을 생성한다.
 * - DATABASE_URL 미설정 시 placeholder 로 폴백 (생성은 connection 불필요).
 */
export default defineConfig({
  schema: "./db/schema/*.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
  strict: true,
  verbose: true,
});
