import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";

/**
 * 브라우저용 Supabase 클라이언트.
 *
 * - 클라이언트 컴포넌트에서 사용 (실시간 구독, 사용자 액션 등).
 * - V1 인증 슬라이스에서는 거의 사용되지 않지만 다음 슬라이스를 대비해 미리 노출.
 * - 환경 변수는 NEXT_PUBLIC_ 접두사로 번들에 포함된다.
 * - 결정 로그 004 §J-2: `requireEnv` 일괄 전환. placeholder 폴백 제거 — production 누락 시 throw.
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
