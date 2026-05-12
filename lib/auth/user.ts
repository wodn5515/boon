import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { bypassUserIfPresent, type BypassUser } from "./bypass";

/**
 * RSC / Server Action 에서 현재 사용자 조회.
 *
 * 1. E2E 우회 모드면 fake user 반환 (결정 로그 003 §D).
 * 2. 그렇지 않으면 Supabase SSR 의 `auth.getUser()` 결과 반환.
 *
 * Middleware (Edge 런타임) 는 cookies() 헬퍼를 못 쓰므로 자체 분기를 가진다.
 *
 * 005 §I-1: `react.cache()` 로 같은 RSC request 안에서 dedupe (PR #3 🟡 #1 청산).
 *   - layout + 자식 page 가 동시에 getCurrentUser 를 부르면 Supabase Auth API 2회 호출 → 1회로 감소.
 *   - middleware 는 Edge 런타임의 별도 context 라 cache 가 공유되지 않음 (영향 없음).
 *   - cache key 는 인자 0개라 RSC request 당 한 번만 실제 실행 (memoize 1슬롯).
 */
export type CurrentUser = BypassUser | { id: string; email: string | null };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
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
});
