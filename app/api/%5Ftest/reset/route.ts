import { NextResponse } from "next/server";

import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { resetE2ECategoriesStore } from "@/lib/categories/e2e-store";
import { resetE2EEntriesStore } from "@/lib/entries/e2e-store";
import { resetE2EFriendsStore } from "@/lib/friends/e2e-store";

/**
 * E2E 전용 store reset 엔드포인트 — 결정 로그 006 §J Lead 결정 (옵션 1).
 *
 * Playwright fixture(test-writer 라운드)가 매 테스트 직전에 POST 호출.
 * dev 서버 globalThis 에 누적된 e2e-store(친구·카테고리·entries) 를 비우고
 * 카테고리 기본 3개(💰물질/⏰시간·행동/💝마음) 만 재시드해 callback handler 초기 상태로 복원.
 *
 * Production 가드 (defense-in-depth):
 *   - `isE2EBypassEnabled()` = `E2E_BYPASS_AUTH=1 && NODE_ENV !== "production"` 동시 만족 필요.
 *   - production 빌드에서는 어떤 흐름으로 호출돼도 403 반환.
 *   - `/api/_test/*` matcher 통과는 인증 우회만 풀고 권한 가드는 본 핸들러가 책임.
 */
export async function POST(): Promise<NextResponse> {
  if (!isE2EBypassEnabled() || process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  resetE2EFriendsStore();
  resetE2ECategoriesStore();
  resetE2EEntriesStore();

  return NextResponse.json({ ok: true });
}
