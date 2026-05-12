/**
 * Next.js middleware 보호 라우트 매처.
 *
 * Edge 런타임의 middleware 본체는 디버깅·테스트가 어려워, 의사결정 로직만 순수 함수로 분리한다 (결정 로그 003 §C).
 *
 * 규칙 (Lead 명세):
 *   통과 (인증 체크 우회 → 누구나 접근 가능):
 *     - `/login`
 *     - `/auth/*` (OAuth callback)
 *     - `/api/auth/*` (signout 등 인증 관련 API)
 *     - `/_next/*` (Next.js 정적 자산 / 이미지 최적화)
 *     - `/favicon.ico`, `/robots.txt` 등 확장자 보유 정적 자원
 *   보호 (인증 체크 필요):
 *     - `/` 및 그 외 모든 사용자 라우트 (`/friends`, `/entries`, `/settings` 등)
 */
export function shouldProtect(pathname: string): boolean {
  // 정확히 일치하는 통과 경로
  if (pathname === "/login") return false;
  if (pathname === "/favicon.ico") return false;

  // prefix 기반 통과 경로
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/auth/")) return false;
  if (pathname.startsWith("/api/auth/")) return false;

  // 확장자가 붙은 정적 파일 (e.g. /robots.txt, /sitemap.xml, /og.png)
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return false;

  return true;
}
