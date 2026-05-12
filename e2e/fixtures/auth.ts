import type { BrowserContextOptions } from "@playwright/test";

/**
 * Boon E2E용 mock 인증 storageState 생성 헬퍼.
 *
 * - 실제 Google OAuth round-trip은 이 슬라이스의 검증 범위 밖이라
 *   "쿠키가 있으면 인증된 것으로 본다"는 단순 컨트랙트만 검증한다.
 * - Supabase Auth가 브라우저에 세션을 저장할 때 쓰는 쿠키 명명 규칙
 *   `sb-<project-ref>-auth-token` 을 흉내 낸다.
 * - project-ref는 env에서 추출(`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`),
 *   값이 없으면 spec이 명시적으로 실패하도록 한다 — 인증 인프라 연결을
 *   worker가 잊지 않도록 강제하기 위함.
 *
 * 주의: 이 storageState는 **테스트 전용 mock**이다.
 * worker가 구현하는 Supabase 서버 클라이언트는 이 토큰을 그대로 받아
 * "세션 있음 = 인증됨" 으로 판단할 수 있도록 SSR 디코드 경로를 구성해야 한다.
 * 실제 토큰 검증(서명, 만료)은 이 슬라이스 범위 밖.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";
const FAKE_EMAIL = "tester@boon.test";

function projectRef(): string {
  if (!SUPABASE_URL) {
    // Supabase env가 없으면 OAuth 검증 자체가 불가하므로
    // fixture를 사용하는 모든 spec이 일찍 빨갛게 실패하도록 한다.
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 이 정의되지 않았다. Supabase 프로젝트 연결 후 .env.local 채워라.",
    );
  }
  const m = SUPABASE_URL.match(/^https?:\/\/([^.]+)\.supabase\.co/);
  if (!m) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL 형식이 예상과 다르다: ${SUPABASE_URL}`,
    );
  }
  return m[1];
}

function fakeAccessTokenPayload() {
  // Supabase가 발급하는 access_token은 JWT지만, 이 mock은 서명·만료를 검증하지 않는다.
  // worker가 SSR helper를 통해 sb-<ref>-auth-token 쿠키만 읽고 "세션 있음"으로 판단하도록 구성한다고 가정.
  return {
    access_token: "fake.access.token",
    refresh_token: "fake.refresh.token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: FAKE_USER_ID,
      email: FAKE_EMAIL,
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: { email: FAKE_EMAIL, full_name: "Boon Tester" },
    },
  };
}

/**
 * Playwright `context.storageState()` 또는 `test.use({ storageState })` 에
 * 그대로 넘길 수 있는 형식.
 *
 * baseURL 도메인(localhost)에 Supabase 인증 쿠키를 심는다.
 */
export function authenticatedStorageState(): BrowserContextOptions["storageState"] {
  const ref = projectRef();
  const cookieName = `sb-${ref}-auth-token`;
  const value = encodeURIComponent(JSON.stringify(fakeAccessTokenPayload()));

  return {
    cookies: [
      {
        name: cookieName,
        value,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
    ],
    origins: [],
  };
}

export const AUTH_FIXTURE_USER = {
  id: FAKE_USER_ID,
  email: FAKE_EMAIL,
} as const;
