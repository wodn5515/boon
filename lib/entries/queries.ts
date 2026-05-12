import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { categories } from "@/db/schema/categories";
import { entries, type Entry as DbEntry } from "@/db/schema/entries";
import { friends } from "@/db/schema/friends";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";

/**
 * entries 도메인 read 쿼리. 결정 로그 006 §B·§G + 정정-1 패턴.
 *
 *   - **application-layer 단일 방어선**: `user_id` WHERE 절을 명시한다.
 *     drizzle-orm 의 postgres-js 직결은 SUPERUSER 권한이라 RLS 가 자동 우회됨.
 *     application-layer 필터가 본 방어선, RLS 는 두 번째 방어선.
 *   - 친구 soft delete 처리: `friends.is_deleted = false` 인 친구의 entries 만 노출 (006 §G).
 *     entries DB row 자체는 보존, UI 비노출.
 *   - 카테고리 JOIN: 표시용 (name·icon·color) 필드를 결과에 평탄화.
 *
 * 통합 테스트는 `vi.mock("@/lib/auth/user")` + pglite + setAuthContext 가
 * application + RLS 이중 통과를 함께 검증한다.
 */

export type EntryWithCategory = DbEntry & {
  category_name: string;
  category_icon: string | null;
  category_color: string;
};

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("인증되지 않은 요청입니다.");
  }
  return user.id;
}

/**
 * 특정 친구의 받은 신세 목록.
 * - 본인 user_id 만.
 * - 해당 친구가 soft-deleted 면 빈 배열 (entries row 는 살아 있지만 미노출 — 006 §G).
 * - 정렬: received_date DESC (최신 신세 먼저).
 */
export async function listEntriesByFriend(
  friendId: string,
): Promise<EntryWithCategory[]> {
  if (isE2EBypassEnabled()) {
    const { e2eListEntriesByFriend } = await import("./e2e-store");
    return e2eListEntriesByFriend(friendId);
  }
  const userId = await requireUserId();

  const rows = await db
    .select({
      id: entries.id,
      user_id: entries.user_id,
      friend_id: entries.friend_id,
      category_id: entries.category_id,
      memo: entries.memo,
      received_date: entries.received_date,
      repayment_timing: entries.repayment_timing,
      repayment_specific_date: entries.repayment_specific_date,
      is_repaid: entries.is_repaid,
      repaid_method: entries.repaid_method,
      repaid_date: entries.repaid_date,
      created_at: entries.created_at,
      updated_at: entries.updated_at,
      category_name: categories.name,
      category_icon: categories.icon,
      category_color: categories.color,
    })
    .from(entries)
    .innerJoin(friends, eq(entries.friend_id, friends.id))
    .innerJoin(categories, eq(entries.category_id, categories.id))
    .where(
      and(
        eq(entries.user_id, userId),
        eq(entries.friend_id, friendId),
        eq(friends.is_deleted, false),
      ),
    )
    .orderBy(desc(entries.received_date), desc(entries.created_at));

  return rows;
}

/**
 * 단일 entry 조회 — 본인 user_id 만. 다른 user 의 entry 는 null.
 */
export async function getEntryById(id: string): Promise<DbEntry | null> {
  if (isE2EBypassEnabled()) {
    const { e2eGetEntryById } = await import("./e2e-store");
    return e2eGetEntryById(id);
  }
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.user_id, userId)))
    .limit(1);
  return rows[0] ?? null;
}
