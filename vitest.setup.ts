// Vitest 전역 셋업.
// @testing-library/jest-dom의 매처(toBeInTheDocument 등)를 expect에 확장.
import "@testing-library/jest-dom/vitest";

// 결정 로그 011 §B-1: TZ 정착 — vitest.config.ts 의 test.env 와 별개로 setupFiles 상단에서
// 한 번 더 명시한다. test.env 가 V8 의 Date 시간대 캐시를 잡기 전 모듈 평가 순서가 흔들리는
// 가설을 방어. Node ≥ v13 의 Date 는 process.env.TZ 를 매 호출마다 다시 본다.
process.env.TZ = "Asia/Seoul";

// 결정 로그 004 §J-2: env 헬퍼를 `requireEnv` 로 일괄 전환 후, 테스트 환경에 placeholder 가
// 항상 주입되도록 한다. 통합 테스트가 Supabase/DB 모듈을 import 만 해도 throw 가 안 나도록.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "placeholder-anon-key";
process.env.DATABASE_URL ??=
  "postgres://placeholder:placeholder@localhost:5432/placeholder";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
