/**
 * 환경 변수 로딩 헬퍼.
 *
 * - 런타임에 env가 누락되면 즉시 throw해 가시성을 확보한다 (결정 로그 003 §A·§B 기반).
 * - 빌드 / 타입체크 / 테스트(placeholder env)는 영향받지 않도록 lazy하게 평가한다.
 * - process.env 접근 자체는 부작용이 없으니 모듈 로드 시 throw하지 않고,
 *   호출 시점에만 검증한다.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(
      `${key} 가 정의되지 않았다. .env.local 또는 배포 환경 변수에 채워라.`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getDatabaseUrl(): string {
  return requireEnv("DATABASE_URL");
}

/**
 * OAuth callback에서 사용할 앱 URL.
 * 없으면 로컬 개발 기본값으로 폴백한다.
 *
 * 참고: E2E 인증 우회 플래그(`E2E_BYPASS_AUTH`)는 `lib/auth/bypass.ts` 의
 *   `isE2EBypassEnabled()` 가 단일 소스 — 가드 변경 시 한 곳만 수정하면 된다.
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
