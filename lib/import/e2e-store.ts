import { randomUUID } from "node:crypto";

import type { Entry as DbEntry } from "@/db/schema/entries";
import type {
  BulkImportResult,
  ImportRow,
  MatchCandidate,
  MatchResult,
} from "@/lib/import/types";

/**
 * E2E (`E2E_BYPASS_AUTH=1`) 전용 import 흐름 — friends·categories·entries e2e-store 위에서
 * `matchFriendsByName` / `bulkImportEntries` 의 본격 SQL 동작을 모사한다.
 *
 * 결정 로그 009 §J·§K + 003 §D 패턴:
 *   - production 빌드에는 `isE2EBypassEnabled()` 가드를 통과해야 진입.
 *   - 단일 fixture user(`...000001`)만 가정.
 *   - 통합 테스트(`tests/integration/import/queries.test.ts`)는 pglite + RLS 로 검증하므로
 *     트랜잭션 정확성·정정-1 cross-check 는 거기서 잠금. 본 모듈은 사용자 흐름 모사.
 *
 * 모사 동작:
 *   - matchFriendsByName — friends e2e-store 의 본인 친구 풀에서 case-insensitive trim 매칭,
 *     soft-deleted 친구 제외. 매칭된 friend 별로 entries e2e-store 의 최근 신세 1건(메모 + 날짜) 동봉.
 *   - bulkImportEntries — 동일 newFriendName 여러 row → friend 1건만 생성 (dedup, case-insensitive trim).
 *     본인 소유 cross-check 후 entries 일괄 생성. 실패 시 best-effort 롤백
 *     (in-memory 라 partial atomic 은 어려움 — 통합 테스트가 본질 잠금).
 */

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

export async function e2eMatchFriendsByName(
  names: ReadonlyArray<string>,
): Promise<ReadonlyArray<MatchResult>> {
  if (names.length === 0) return [];

  const { e2eListFriends } = await import("@/lib/friends/e2e-store");
  const { e2eListEntriesByFriend } = await import("@/lib/entries/e2e-store");

  const allFriends = e2eListFriends();
  // norm name → friend rows (동명이인 포함).
  const byNorm = new Map<string, typeof allFriends>();
  for (const f of allFriends) {
    const k = normalizeKey(f.name);
    const arr = byNorm.get(k);
    if (arr) arr.push(f);
    else byNorm.set(k, [f]);
  }

  const results: MatchResult[] = [];
  for (let i = 0; i < names.length; i += 1) {
    const inputName = names[i]!;
    const k = normalizeKey(inputName);
    const matches = byNorm.get(k) ?? [];
    const candidates: MatchCandidate[] = [];
    for (const f of matches) {
      // 친구별 최근 신세 1건 (received_date DESC).
      const entries = await e2eListEntriesByFriend(f.id);
      const recent = entries[0];
      candidates.push({
        friend_id: f.id,
        friend_name: f.name,
        friend_note: f.note,
        recent_entry_memo: recent?.memo ?? null,
        recent_entry_date: recent
          ? typeof recent.received_date === "string"
            ? recent.received_date
            : new Date(recent.received_date).toISOString().slice(0, 10)
          : null,
      });
    }
    results.push({
      rowIndex: i,
      name: inputName,
      candidates,
    });
  }

  return results;
}

export async function e2eBulkImportEntries(
  rows: ReadonlyArray<ImportRow>,
): Promise<BulkImportResult> {
  if (rows.length === 0) return { entriesCreated: 0, friendsCreated: 0 };

  const { e2eCreateFriendReturning, e2eGetFriendById } = await import(
    "@/lib/friends/e2e-store"
  );
  const { e2eListCategories } = await import("@/lib/categories/e2e-store");

  // 정정-1 모사: 카테고리 본인 소유 cross-check (e2e-store 는 단일 user 라 카테고리 존재만 확인).
  const cats = e2eListCategories();
  const ownedCategoryIds = new Set(cats.map((c) => c.id));
  for (const row of rows) {
    if (!ownedCategoryIds.has(row.categoryId)) {
      throw new Error("본인 소유 카테고리가 아닌 row 가 섞여 있어요.");
    }
  }

  // 기존 friendId 본인 소유 cross-check (e2e-store 의 fake user 한정).
  for (const row of rows) {
    if (row.friendId) {
      const f = e2eGetFriendById(row.friendId);
      if (!f) {
        // 다른 user / 삭제된 친구 / 존재하지 않음 — 전부 거절 (정정-1 모사).
        throw new Error("본인 소유 친구가 아닌 row 가 섞여 있어요.");
      }
    }
  }

  // 신규 친구 dedup (case-insensitive trim).
  const newFriendIdByKey = new Map<string, string>();
  let friendsCreated = 0;
  for (const row of rows) {
    if (row.newFriendName) {
      const k = normalizeKey(row.newFriendName);
      if (!newFriendIdByKey.has(k)) {
        const id = e2eCreateFriendReturning({
          name: row.newFriendName.trim(),
          birthday_month: null,
          birthday_day: null,
          note: null,
        });
        newFriendIdByKey.set(k, id);
        friendsCreated += 1;
      }
    }
  }

  // entries 생성 — entries e2e-store 의 내부 Map 에 직접 push
  // (e2eCreateEntry 는 friend 생성도 같이 도와주지만 우린 이미 dedup 된 newFriendId 를 쓰므로 직접 set).
  const entriesStore = await getEntriesStore();
  let entriesCreated = 0;
  const now = new Date();
  for (const row of rows) {
    let friendId: string;
    if (row.friendId) {
      friendId = row.friendId;
    } else if (row.newFriendName) {
      const id = newFriendIdByKey.get(normalizeKey(row.newFriendName));
      if (!id) throw new Error("새 친구 매핑 실패 — 내부 dedup 오류.");
      friendId = id;
    } else {
      throw new Error("친구 정보가 비어 있는 row 가 있어요.");
    }

    const id = randomUUID();
    entriesStore.set(id, {
      id,
      user_id: FAKE_USER_ID,
      friend_id: friendId,
      category_id: row.categoryId,
      memo: row.memo,
      received_date: row.receivedDate,
      repayment_timing: row.repaymentTiming,
      repayment_specific_date: null,
      is_repaid: false,
      repaid_method: null,
      repaid_date: null,
      created_at: now,
      updated_at: now,
    });
    entriesCreated += 1;
  }

  return { entriesCreated, friendsCreated };
}

/**
 * entries e2e-store 의 globalThis Map 핸들을 동적 import 로 가져온다.
 * 본 모듈은 entries.e2e-store 와 동일 STORE_KEY 를 공유해야 한다 — entries CRUD 와 같은 Map.
 */
async function getEntriesStore(): Promise<Map<string, DbEntry>> {
  const STORE_KEY = "__BOON_E2E_ENTRIES_STORE__";
  type G = typeof globalThis & {
    [STORE_KEY]?: Map<string, DbEntry>;
  };
  const g = globalThis as G;
  if (!g[STORE_KEY]) {
    // entries.e2e-store 가 먼저 import 되어 store 를 만든다. 보험 차원에서 한 번 더 보장.
    await import("@/lib/entries/e2e-store");
  }
  return g[STORE_KEY] as Map<string, DbEntry>;
}
