// Vitest 전역 셋업.
// @testing-library/jest-dom의 매처(toBeInTheDocument 등)를 expect에 확장.
import "@testing-library/jest-dom/vitest";

// 결정 로그 004 §J-2: env 헬퍼를 `requireEnv` 로 일괄 전환 후, 테스트 환경에 placeholder 가
// 항상 주입되도록 한다. 통합 테스트가 Supabase/DB 모듈을 import 만 해도 throw 가 안 나도록.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "placeholder-anon-key";
process.env.DATABASE_URL ??=
  "postgres://placeholder:placeholder@localhost:5432/placeholder";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
