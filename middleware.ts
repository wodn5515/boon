import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { bypassUserIfPresent, isE2EBypassEnabled } from "@/lib/auth/bypass";
import { shouldProtect } from "@/lib/auth/matcher";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";

/**
 * Boon 인증 게이트.
 *
 * - 통과 라우트 (`/login`, `/auth/*`, `/api/auth/*`, 정적)는 그대로 통과.
 * - 보호 라우트에서 세션이 없으면 `/login` 으로 302 redirect.
 * - E2E 우회 모드(결정 로그 003 §D)에서는 fake 쿠키만으로 인증 처리.
 *
 * Edge 런타임이므로 cookies() 헬퍼 대신 `request.cookies` 를 직접 본다.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!shouldProtect(pathname)) {
    return NextResponse.next();
  }

  // E2E 우회: fake cookie 존재 = 인증된 것으로 간주.
  if (isE2EBypassEnabled()) {
    const bypass = bypassUserIfPresent(
      (name) => request.cookies.get(name) != null,
    );
    if (bypass) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 실제 세션 검증. 결정 로그 004 §J-2: `requireEnv` 로 production 누락 시 즉시 throw.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  // 정적 자산은 매처 단에서 제외해 middleware 호출 자체를 막는다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
