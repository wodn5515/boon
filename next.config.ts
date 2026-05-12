import type { NextConfig } from "next";

/**
 * Boon Next.js 설정.
 *
 * 보안 헤더 (결정 로그 003 §I — sfx + PR #1 사용자 리뷰 권고):
 *   - X-Frame-Options: DENY              clickjacking 방지
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - X-Content-Type-Options: nosniff    MIME sniffing 차단
 *   - Permissions-Policy: 불필요 권한 차단
 *
 * CSP 는 이번 슬라이스 보류 (Supabase·Vercel·next/script origin 확정 후 friends-crud 슬라이스에 추가).
 */
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
        ],
      },
    ];
  },
};

export default nextConfig;
