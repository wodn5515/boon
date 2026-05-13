import { randomUUID } from "node:crypto";

import type { Entry as DbEntry } from "@/db/schema/entries";
import type { EntryWithCategory } from "./queries";

/**
 * E2E (`E2E_BYPASS_AUTH=1`) 전용 in-memory entries 스토어.
 *
 * 결정 로그 003 §D + 004 §H + 005 §D 패턴:
 *   - production 빌드에 안 들어가도록 `isE2EBypassEnabled()` 가드로만 진입.
 *   - dev 서버 lifecycle 동안만 살아 있고, 재시작 시 휘발.
 *   - 통합 테스트는 pglite + RLS 로 검증 — 본 store 는 E2E 사용자 흐름 모사용.
 *
 * 인라인 친구 빠른 생성: e2eCreateEntry 가 `new_friend_name` 을 받으면
 * friends e2e-store 의 e2eCreateFriend 를 호출해 친구 row 먼저 생성한 뒤 entry insert.
 */

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";

const STORE_KEY = "__BOON_E2E_ENTRIES_STORE__";
type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: Map<string, DbEntry>;
};
const g = globalThis as GlobalWithStore;
if (!g[STORE_KEY]) {
  g[STORE_KEY] = new Map<string, DbEntry>();
}
const store: Map<string, DbEntry> = g[STORE_KEY]!;

function clone(e: DbEntry): DbEntry {
  return { ...e };
}

function ownRows(): DbEntry[] {
  return Array.from(store.values()).filter((e) => e.user_id === FAKE_USER_ID);
}

type CreateInput = {
  friendId: string | null;
  newFriendName: string | null;
  categoryId: string;
  memo: string;
  receivedDate: string;
  timing: DbEntry["repayment_timing"];
  specificDate: string | null;
};

async function resolveFriendId(input: CreateInput): Promise<string> {
  if (input.newFriendName) {
    // friends e2e-store 의 createFriend 흐름 그대로 — 본 모듈은 그 결과 id 가 필요하다.
    const { e2eCreateFriendReturning } = await import(
      "@/lib/friends/e2e-store"
    );
    return e2eCreateFriendReturning({
      name: input.newFriendName,
      birthday_month: null,
      birthday_day: null,
      note: null,
    });
  }
  if (!input.friendId) {
    throw new Error("친구가 비어 있어요.");
  }
  return input.friendId;
}

export async function e2eCreateEntry(input: CreateInput): Promise<void> {
  const now = new Date();
  const friendId = await resolveFriendId(input);
  const id = randomUUID();
  store.set(id, {
    id,
    user_id: FAKE_USER_ID,
    friend_id: friendId,
    category_id: input.categoryId,
    memo: input.memo,
    received_date: input.receivedDate,
    repayment_timing: input.timing,
    repayment_specific_date: input.specificDate,
    is_repaid: false,
    repaid_method: null,
    repaid_date: null,
    created_at: now,
    updated_at: now,
  });
}

export async function e2eUpdateEntry(
  input: CreateInput & { id: string },
): Promise<void> {
  const existing = store.get(input.id);
  if (!existing) return;
  if (existing.user_id !== FAKE_USER_ID) return;
  const friendId = await resolveFriendId(input);
  store.set(input.id, {
    ...existing,
    friend_id: friendId,
    category_id: input.categoryId,
    memo: input.memo,
    received_date: input.receivedDate,
    repayment_timing: input.timing,
    repayment_specific_date: input.specificDate,
    updated_at: new Date(),
  });
}

export function e2eDeleteEntry(id: string): void {
  const existing = store.get(id);
  if (!existing) return;
  if (existing.user_id !== FAKE_USER_ID) return;
  store.delete(id);
}

export function e2eGetEntryById(id: string): DbEntry | null {
  const row = store.get(id);
  if (!row) return null;
  if (row.user_id !== FAKE_USER_ID) return null;
  return clone(row);
}

/**
 * 친구별 entries 조회 + 카테고리 JOIN. soft-deleted 친구는 빈 배열로 반환 (006 §G).
 */
export async function e2eListEntriesByFriend(
  friendId: string,
): Promise<EntryWithCategory[]> {
  // soft-deleted 친구는 빈 결과.
  const { e2eGetFriendById } = await import("@/lib/friends/e2e-store");
  const friend = e2eGetFriendById(friendId);
  if (!friend) return [];

  const { e2eListCategories } = await import("@/lib/categories/e2e-store");
  const cats = e2eListCategories();
  const catMap = new Map(cats.map((c) => [c.id, c] as const));

  const rows = ownRows()
    .filter((e) => e.friend_id === friendId)
    .sort((a, b) => {
      // received_date DESC, created_at DESC tiebreaker.
      const ad = String(a.received_date);
      const bd = String(b.received_date);
      if (ad !== bd) return ad < bd ? 1 : -1;
      return a.created_at.getTime() < b.created_at.getTime() ? 1 : -1;
    });

  return rows.map((r) => {
    const cat = catMap.get(r.category_id);
    return {
      ...clone(r),
      category_name: cat?.name ?? "",
      category_icon: cat?.icon ?? null,
      category_color: cat?.color ?? "#999999",
    };
  });
}

/**
 * 카테고리 ID 가 묶인 entries 갯수 — CategoryDeleteDialog 의 entryCount placeholder 교체.
 */
export function e2eCountEntriesByCategory(categoryId: string): number {
  return ownRows().filter((e) => e.category_id === categoryId).length;
}

/**
 * 카테고리 강제 이전 (E2E 결합). settings deleteCategory 의 트랜잭션 본격 결합 대응.
 */
export function e2eMigrateEntriesCategory(
  fromCategoryId: string,
  toCategoryId: string,
): void {
  for (const e of ownRows()) {
    if (e.category_id === fromCategoryId) {
      store.set(e.id, {
        ...e,
        category_id: toCategoryId,
        updated_at: new Date(),
      });
    }
  }
}

/**
 * E2E 인프라 reset (006 §J Lead 결정).
 *
 * `/api/_test/reset` 가 호출하는 store 초기화 헬퍼. 모든 entry row 를 비워
 * 다음 테스트가 깨끗한 상태에서 시작하게 한다.
 */
export function resetE2EEntriesStore(): void {
  store.clear();
}
