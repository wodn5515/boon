/**
 * E2E 인증 우회 헬퍼.
 *
 * 결정 로그 003 §D:
 *   - `E2E_BYPASS_AUTH=1` && `NODE_ENV !== "production"` 이어야 동작한다.
 *   - 프로덕션 빌드에서는 가드가 false 가 되어 dead code 로 빠진다.
 *   - fixture (`e2e/fixtures/auth.ts`) 가 심은 `sb-<ref>-auth-token` 쿠키가
 *     존재할 때만 "인증된 사용자" 로 간주한다.
 *
 * Edge / Node / RSC 어디서나 호출 가능하도록 cookies 접근을 함수 인자로 받는다.
 */

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";
const FAKE_EMAIL = "tester@boon.test";

export type BypassUser = {
  id: string;
  email: string;
};

export function isE2EBypassEnabled(): boolean {
  return (
    process.env.E2E_BYPASS_AUTH === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

/**
 * fixture 쿠키 이름은 `NEXT_PUBLIC_SUPABASE_URL` 의 project ref 에 의존한다.
 * URL 이 없거나 형식이 안 맞으면 null 을 돌려 우회를 비활성화한다.
 */
export function bypassCookieName(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/);
  if (!m) return null;
  return `sb-${m[1]}-auth-token`;
}

/**
 * 우회 모드에서 fake user 를 만들어 돌려준다.
 * 우회 모드가 아니거나 쿠키가 없으면 null.
 */
export function bypassUserIfPresent(
  hasCookie: (name: string) => boolean,
): BypassUser | null {
  if (!isE2EBypassEnabled()) return null;
  const name = bypassCookieName();
  if (!name) return null;
  if (!hasCookie(name)) return null;
  return { id: FAKE_USER_ID, email: FAKE_EMAIL };
}
