import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase SSR 클라이언트 (RSC + Server Action + route handler 공용).
 *
 * - `@supabase/ssr` 의 `createServerClient` 를 Next.js App Router 패턴에 맞춰 감싼다.
 * - `cookies()` 는 비동기 헬퍼라 모든 호출이 await 가능해야 한다.
 * - 환경 변수는 모듈 로드 시점이 아닌 호출 시점에 읽어 빌드·테스트에 placeholder 만으로 통과되도록 한다.
 *   런타임에 실제 값이 없으면 Supabase 호출이 자연스럽게 실패하면서 가시성을 확보한다.
 * - `setAll` 의 try/catch 는 RSC 가 set 을 호출할 때 던지는 에러를 흡수하기 위함 (Supabase 공식 패턴).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
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
