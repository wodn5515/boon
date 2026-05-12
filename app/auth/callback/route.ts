import type { AuthError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Google OAuth 콜백 핸들러.
 *
 * 흐름 (결정 로그 003 §A·§B + 004 §J-3·§J-6·§J-7):
 *   1. `code` 쿼리 파라미터 부재 → `/login?error=missing_code` 로 302.
 *   2. 정상 `code`:
 *      - Supabase `exchangeCodeForSession(code)` 로 세션 교환.
 *      - 에러 시 `error.code` / `error.status` 로 분기 → ERROR_COPY 확장 (J-3):
 *          - `invalid_grant`        → `?error=invalid_grant`
 *          - 4xx (만료·재사용 등)    → `?error=expired_code`
 *          - 기타 (네트워크 / 5xx) → `?error=network_error`
 *      - provider 가 google 이 아니거나 email 이 비어 있으면 가드 redirect (003 §B).
 *      - 교환 결과의 user 정보를 `users` 테이블에 `onConflictDoNothing()` upsert.
 *      - `/` 로 302.
 *
 * J-6 변경 (Lead 보류): `@/db/client` / `@/db/schema/users` 를 static import 로 환원하려 했으나
 *   기존 `tests/integration/auth/callback-route.test.ts` 의 vi.mock factory hoisting 한계로
 *   static import 시 "Cannot access 'dbInsert' before initialization" 이 발생.
 *   spec 수정은 worker 영역이 아니므로 (test-writer 영역) 본 PR 에서는 dynamic import 를 유지.
 *   spec 을 `vi.hoisted()` 패턴 또는 pglite 통합으로 갱신하는 결정은 Lead 후속 자율 판단.
 * J-7 변경: 에러 객체 캐스트를 `import type { AuthError }` 로 통일.
 */

const RECOVERABLE_HTTP_STATUSES = new Set([400, 401, 403, 404, 408, 410, 429]);

function classifyExchangeError(error: AuthError | null | undefined): string {
  const code = error?.code;
  const status = error?.status;
  if (code === "invalid_grant" || code === "validation_failed") {
    return "invalid_grant";
  }
  if (typeof status === "number" && RECOVERABLE_HTTP_STATUSES.has(status)) {
    // 만료된 code 재사용 / 잘못된 redirect_uri 등 사용자 재시도로 해결되는 4xx.
    return "expired_code";
  }
  // 네트워크 타임아웃 / 5xx / SDK 미상 에러 — 사용자에게 재시도 권유.
  return "network_error";
}

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
    // Vercel function log 가시화 — PR #2 사용자 리뷰 🟢 #4. error.message 는 PII 우려 제외.
    console.error("[auth/callback] exchange failed", {
      code: error?.code,
      status: error?.status,
      hasUser: Boolean(data?.user),
    });
    const errKind = classifyExchangeError(error);
    return NextResponse.redirect(
      new URL(`/login?error=${errKind}`, url),
      302,
    );
  }

  const user = data.user;

  // V1 은 Google provider 전용 (결정 로그 003 §A).
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

  // dynamic import — 위 주석 참고. spec hoisting 제약 해소 시 static 으로 환원.
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
