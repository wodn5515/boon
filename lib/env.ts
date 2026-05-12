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
 * OAuth callback 에서 사용할 앱 URL.
 *
 * 다른 헬퍼와 동일하게 `requireEnv` 패턴으로 통일 — production 에서 누락되면 즉시 throw 하여
 * silent fail (`http://localhost:3000` 으로 OAuth 진행되어 redirect 가 깨지는 케이스)을 차단한다.
 * 로컬에서는 `.env.example` 이 `NEXT_PUBLIC_APP_URL=http://localhost:3000` 기본값을 제공하므로
 * `.env.local` 복사만으로도 자동 동작.
 *
 * 사용자 리뷰 PR #2 🟡 #2 권고 반영.
 *
 * 참고: E2E 인증 우회 플래그(`E2E_BYPASS_AUTH`)는 `lib/auth/bypass.ts` 의
 *   `isE2EBypassEnabled()` 가 단일 소스 — 가드 변경 시 한 곳만 수정하면 된다.
 */
export function getAppUrl(): string {
  return requireEnv("NEXT_PUBLIC_APP_URL");
}
