import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Google OAuth 콜백 핸들러.
 *
 * 흐름 (결정 로그 003 §A·§B):
 *   1. `code` 쿼리 파라미터 부재 → `/login?error=missing_code` 로 302.
 *   2. 정상 `code`:
 *      - Supabase `exchangeCodeForSession(code)` 로 세션 교환.
 *      - provider 가 google 이 아니거나 email 이 비어 있으면 가드 redirect (sfx 🟡 권고).
 *        Supabase Google scope 가 email 을 보장하므로 정상 흐름에서 도달 불가하지만,
 *        notNull 컬럼에 빈 문자열이 흘러 들어가는 것을 막기 위한 방어 코딩.
 *      - 교환 결과의 user 정보를 `users` 테이블에 `onConflictDoNothing()` upsert.
 *      - `/` 로 302.
 *
 * 사용자별 격리는 RLS 가 아닌 본 핸들러의 application-layer upsert 로 처리한다.
 * trigger 함수 대비 디버깅·가시성이 좋다 (003 §B 결정 근거).
 *
 * 구현 메모: `@/db/client` 와 `@/db/schema/users` 는 GET 본체에서 dynamic import 한다.
 *   vi.mock 의 factory hoisting 한계로 인해 통합 테스트가 module-load 시점에 mock 을 참조하지 못하기 때문 —
 *   GET 호출 시점에 import 하면 factory 의 closure 변수가 이미 초기화되어 있어 안전.
 *   런타임 비용은 한 번의 즉시 캐시되는 ESM dynamic import 라 무시 가능.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", url),
      302,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.user) {
    return NextResponse.redirect(
      new URL("/login?error=exchange_failed", url),
      302,
    );
  }

  const user = data.user;

  // V1 은 Google provider 전용 (결정 로그 003 §A). 다른 provider 가 섞이면 가시화.
  const provider =
    typeof user.app_metadata?.provider === "string"
      ? user.app_metadata.provider
      : null;
  if (provider !== null && provider !== "google") {
    return NextResponse.redirect(
      new URL("/login?error=unsupported_provider", url),
      302,
    );
  }

  // Google scope 가 email 을 보장하지만, notNull 컬럼 무결성을 위해 명시적 가드.
  if (!user.email) {
    return NextResponse.redirect(
      new URL("/login?error=missing_email", url),
      302,
    );
  }

  const googleId =
    typeof user.user_metadata?.sub === "string" ? user.user_metadata.sub : null;

  const { db } = await import("@/db/client");
  const { users } = await import("@/db/schema/users");

  await db
    .insert(users)
    .values({
      id: user.id,
      email: user.email,
      google_id: googleId,
    })
    .onConflictDoNothing();

  return NextResponse.redirect(new URL("/", url), 302);
}
