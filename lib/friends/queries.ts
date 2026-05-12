import { and, asc, eq, ilike } from "drizzle-orm";

import { db } from "@/db/client";
import { friends, type Friend } from "@/db/schema/friends";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";

/**
 * friends 도메인 read 쿼리.
 *
 * 결정 로그 004 §A·§D·§I + sfx 라운드 1 🔴 #1 보강:
 *   - **application-layer 단일 방어선**: `user_id` WHERE 절을 명시한다.
 *     원안(§A "RLS 가 자동 필터") 은 Supabase 의 PostgREST + JWT claim → auth.uid() 흐름을 전제로 한 것인데,
 *     drizzle-orm 의 postgres-js 직결은 그 흐름 바깥이라 GUC/role 주입 없이 SUPERUSER `postgres`(BYPASSRLS)
 *     로 동작한다. FORCE RLS 가 걸려도 BYPASSRLS role 은 정책을 우회 — RLS 만 믿으면 모든 사용자의 friends 가
 *     섞여 보이는 격리 사고가 난다. drizzle 쿼리에 user_id 를 명시해 격리를 application 단에서 잠근다.
 *     RLS 는 두 번째 방어선(엣지·PostgREST 우발 흐름 보호) 으로 유지.
 *   - `is_deleted=false` 만 노출 (soft delete, D-017).
 *   - 검색은 URL searchParams (`?q=...`) 기반 서버 쿼리 (RSC 친화).
 *
 * E2E 모드 (`E2E_BYPASS_AUTH=1`): drizzle/postgres 대신 in-memory 스토어로 분기.
 *   pglite 를 Next.js dev 서버에 띄우는 게 WASM 경로 충돌로 안정적이지 않아 JS-only 모사로 대체
 *   (003 §D 의 OAuth 우회 가드와 동일 정책 — production 진입 불가).
 *
 * 통합 테스트는 `vi.mock("@/lib/auth/user")` 로 `getCurrentUser` 를 본인 user 로 갈아끼우고,
 * pglite + setAuthContext 가 RLS 도 함께 검증한다 — application + RLS 이중 통과.
 */

export type ListFriendsParams = {
  q?: string;
};

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    // middleware 가 이미 게이트하므로 도달 불가하지만, 사일런트 격리 사고 방지를 위해 명시적 throw.
    throw new Error("인증되지 않은 요청입니다.");
  }
  return user.id;
}

export async function listFriends(params: ListFriendsParams = {}): Promise<Friend[]> {
  if (isE2EBypassEnabled()) {
    const { e2eListFriends } = await import("./e2e-store");
    return e2eListFriends({ q: params.q });
  }
  const userId = await requireUserId();
  const q = params.q?.trim();
  const baseWhere = and(
    eq(friends.user_id, userId),
    eq(friends.is_deleted, false),
  );
  const where = q ? and(baseWhere, ilike(friends.name, `%${q}%`)) : baseWhere;

  return await db
    .select()
    .from(friends)
    .where(where)
    .orderBy(asc(friends.name));
}

export async function getFriendById(id: string): Promise<Friend | null> {
  if (isE2EBypassEnabled()) {
    const { e2eGetFriendById } = await import("./e2e-store");
    return e2eGetFriendById(id);
  }
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(friends)
    .where(
      and(
        eq(friends.id, id),
        eq(friends.user_id, userId),
        eq(friends.is_deleted, false),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
