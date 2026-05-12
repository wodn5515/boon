"use server";

import { redirect } from "next/navigation";

import { getAppUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Google OAuth 시작 Server Action.
 *
 * - `/login` 페이지의 `<form action={signInWithGoogle}>` 에서 호출된다 (결정 로그 003 §A).
 * - Supabase 가 발급한 OAuth 진입 URL 로 `redirect()` 한다.
 * - redirectTo 는 `${NEXT_PUBLIC_APP_URL}/auth/callback` — 콜백 핸들러가 code → session 교환을 처리한다.
 */
export async function signInWithGoogle() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getAppUrl()}/auth/callback`,
    },
  });

  if (error || !data?.url) {
    // OAuth 진입 자체가 실패하면 사용자에게 가시화하기 위해 에러 쿼리와 함께 다시 /login.
    redirect("/login?error=oauth_init");
  }

  redirect(data.url);
}
