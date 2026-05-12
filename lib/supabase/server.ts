import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";

/**
 * Supabase SSR 클라이언트 (RSC + Server Action + route handler 공용).
 *
 * - `@supabase/ssr` 의 `createServerClient` 를 Next.js App Router 패턴에 맞춰 감싼다.
 * - `cookies()` 는 비동기 헬퍼라 모든 호출이 await 가능해야 한다.
 * - 환경 변수는 모듈 로드 시점이 아닌 호출 시점에 `requireEnv` 로 읽는다 (결정 로그 004 §J-2).
 *   production 에서 누락 시 즉시 throw — placeholder 폴백을 두지 않아 가시성 확보.
 *   로컬·테스트는 `.env.example`/`playwright.config` 에서 placeholder 가 항상 주입된다.
 * - `setAll` 의 try/catch 는 RSC 가 set 을 호출할 때 던지는 에러를 흡수하기 위함 (Supabase 공식 패턴).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // RSC 렌더 중에는 set 호출이 실패하지만 middleware 에서 갱신되므로 무시한다.
          }
        },
      },
    },
  );
}
