import type { AuthError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Google OAuth 콜백 핸들러.
 *
 * 흐름 (결정 로그 003 §A·§B + 004 §J-3·§J-7):
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
 * `@/db/client` / `@/db/schema/users` 는 dynamic import 다 — 통합 테스트의 vi.mock factory
 * hoisting 호환을 위함 (결정 로그 003 §J 및 004 §J-6). static 환원은 별도 슬라이스에서
 * `getDb()` lazy factory 패턴 도입 시 재검토.
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

  const { db } = await import("@/db/client");
  const { users } = await import("@/db/schema/users");

  // `target: users.id` 로 명시 — id PK 충돌(정상 재로그인) 만 사일런트 무시한다.
  // 0003 마이그레이션의 email / google_id unique 제약 위반 시에는 그대로 throw → catch 로 가시화.
  // (sfx 라운드 1 🟡 #4) Supabase Auth 콘솔 user 삭제 후 같은 이메일 재가입 시 새 id + 같은 email →
  // 기본 onConflictDoNothing() 는 첫 발견 충돌(email unique) 도 무시해 사용자가 로그인 성공한 듯
  // 보이지만 친구 추가 시 FK 위반 500 으로 사일런트 사고. target 명시로 가드.
  try {
    await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        google_id: googleId,
      })
      .onConflictDoNothing({ target: users.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[auth/callback] users upsert failed", {
      userId: user.id,
      message,
    });
    // Postgres unique violation 의 SQLSTATE 23505. drizzle / postgres-js 는 원본 에러를 그대로
    // throw 하므로 `e.code` 로 충분히 판별 가능. 메시지 substring 매칭은 false-positive (다른 SDK
    // 에러에 "unique" 가 우연히 포함) 가능성이 있어 제거 (sfx 라운드 2 🟢 #12).
    const code = (e as { code?: unknown }).code;
    const isUniqueViolation = typeof code === "string" && code === "23505";
    const errKind = isUniqueViolation ? "account_conflict" : "upsert_failed";
    return NextResponse.redirect(
      new URL(`/login?error=${errKind}`, url),
      302,
    );
  }

  return NextResponse.redirect(new URL("/", url), 302);
}
