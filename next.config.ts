import type { NextConfig } from "next";

/**
 * Boon Next.js 설정.
 *
 * 보안 헤더 (결정 로그 003 §I + 004 §J-4 — sfx · PR #1·#2 사용자 리뷰 권고 일괄 청산):
 *   - X-Frame-Options: DENY              clickjacking 방지
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - X-Content-Type-Options: nosniff    MIME sniffing 차단
 *   - Permissions-Policy: 불필요 권한 차단
 *   - Content-Security-Policy: 004 §J-4 — Supabase / Google 프로필 이미지 origin 포함.
 *     nonce 기반 strict CSP 는 V2 보안 슬라이스로 deferred (Next.js inline hydration 호환).
 */
// Next.js dev (HMR / React fast refresh) 는 eval 을 쓰는 번들을 주입한다. production 빌드는 eval 불필요.
// `'unsafe-eval'` 을 production 에서 빼서 strict CSP 를 유지.
const IS_PROD = process.env.NODE_ENV === "production";
const SCRIPT_SRC = IS_PROD
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Next.js 의 inline hydration 스크립트 + Tailwind/shadcn inline style 호환.
  // nonce 기반 strict CSP 는 V2 보안 슬라이스(deferred 004 후속).
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://lh3.googleusercontent.com",
  // Pretendard 등 정적 폰트. 외부 폰트 CDN 미사용.
  "font-src 'self'",
  // Supabase REST/Realtime + Auth callback. dev HMR 의 WebSocket 도 포함.
  IS_PROD
    ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
    : "connect-src 'self' https://*.supabase.co wss://*.supabase.co ws://localhost:* http://localhost:*",
  // 외부에서 iframe 삽입 금지 (X-Frame-Options 와 정합).
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // form-action: Google OAuth Server Action 흐름은 Boon → Supabase /auth/v1/authorize → Google 로
  // navigation redirect chain 을 거친다. CSP3 spec 은 form-action 을 chain 전체에 적용하므로
  // Firefox 등 엄격 enforce 환경에서 supabase.co 누락 시 OAuth 자체가 차단된다 (sfx 라운드 1 🟡 #3).
  "form-action 'self' https://*.supabase.co https://accounts.google.com",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
        ],
      },
    ];
  },
};

export default nextConfig;
