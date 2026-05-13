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
  // 결정 로그 011 §B-1 — dev / build 빌드 환경 KST 잠금.
  //   - Vercel Functions 의 기본 TZ 는 UTC. `lib/dashboard/queries.ts::monthRange` /
  //     `lib/friends/birthday.ts::daysUntilBirthday` / `lib/friends/stats.ts::aggregateMonthlyTrend`
  //     의 todayKey 가 UTC ↔ KST 자정 경계에서 한 달 흔들리던 회귀
  //     (PR #6 🟡 S1 + PR #9 🟡 S2) 를 일괄 차단.
  //   - 본 옵션은 빌드 시점 DefinePlugin 으로 `process.env.TZ` 를 inline 한다. Node ≥ v13 의
  //     Date 가 매 호출마다 `process.env.TZ` 를 read 하므로 dev / next build 환경에서는 정착.
  //   - **Vercel Functions runtime 은 별도 잠금 필수**: Vercel 콘솔의 프로젝트 환경 변수에
  //     `TZ=Asia/Seoul` 를 등록해야 cold-start 시 Node 프로세스 TZ 가 KST 로 들어간다.
  //     자세한 절차는 README.md §production 배포 가이드 §5 참고. (sfx 라운드 011 🟡 S1)
  env: {
    TZ: "Asia/Seoul",
  },
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
