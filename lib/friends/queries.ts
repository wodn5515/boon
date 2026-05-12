import { and, asc, eq, ilike } from "drizzle-orm";

import { db } from "@/db/client";
import { friends, type Friend } from "@/db/schema/friends";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";

/**
 * friends 도메인 read 쿼리.
 *
 * 결정 로그 004 §A·§D·§I:
 *   - RLS 가 본인 user_id 행만 통과시키므로 application-layer 에서 user_id 필터를
 *     명시할 필요 없다 (이중 방어로 추가하지 않음 — Supabase 패턴 정합).
 *   - `is_deleted=false` 만 노출 (soft delete, D-017).
 *   - 검색은 URL searchParams (`?q=...`) 기반 서버 쿼리 (RSC 친화).
 *
 * E2E 모드 (`E2E_BYPASS_AUTH=1`): drizzle/postgres 대신 in-memory 스토어로 분기.
 *   pglite 를 Next.js dev 서버에 띄우는 게 WASM 경로 충돌로 안정적이지 않아 JS-only 모사로 대체
 *   (003 §D 의 OAuth 우회 가드와 동일 정책 — production 진입 불가).
 */

export type ListFriendsParams = {
  q?: string;
};

export async function listFriends(params: ListFriendsParams = {}): Promise<Friend[]> {
  if (isE2EBypassEnabled()) {
    const { e2eListFriends } = await import("./e2e-store");
    return e2eListFriends({ q: params.q });
  }
  const q = params.q?.trim();
  const where = q
    ? and(eq(friends.is_deleted, false), ilike(friends.name, `%${q}%`))
    : eq(friends.is_deleted, false);

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
  const rows = await db
    .select()
    .from(friends)
    .where(and(eq(friends.id, id), eq(friends.is_deleted, false)))
    .limit(1);
  return rows[0] ?? null;
}
