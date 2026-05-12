import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

import { bypassUserIfPresent, type BypassUser } from "./bypass";

/**
 * RSC / Server Action 에서 현재 사용자 조회.
 *
 * 1. E2E 우회 모드면 fake user 반환 (결정 로그 003 §D).
 * 2. 그렇지 않으면 Supabase SSR 의 `auth.getUser()` 결과 반환.
 *
 * Middleware (Edge 런타임) 는 cookies() 헬퍼를 못 쓰므로 자체 분기를 가진다.
 */
export type CurrentUser = BypassUser | { id: string; email: string | null };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const bypass = bypassUserIfPresent((name) => cookieStore.get(name) != null);
  if (bypass) {
    return bypass;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}
