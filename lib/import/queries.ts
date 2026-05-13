import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { categories } from "@/db/schema/categories";
import { entries, type NewEntry } from "@/db/schema/entries";
import { friends } from "@/db/schema/friends";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";
import { safeRevalidate } from "@/lib/server/revalidate";
import type {
  BulkImportResult,
  ImportRow,
  MatchCandidate,
  MatchResult,
} from "@/lib/import/types";

/**
 * 엑셀 import — 친구 매칭 + bulk insert.
 *
 * 결정 로그 009 §J·§K + 정정-1 패턴 (004 §"sfx 라운드 1 🔴 #1"):
 *   - **application-layer 본 방어선**: `eq(*.user_id, userId)` 명시. drizzle-orm + postgres-js
 *     SUPERUSER 직결은 RLS 자동 우회 → application 단 필터가 핵심. RLS 는 두 번째 방어선.
 *   - matchFriendsByName — 본인 친구 풀(soft-deleted 제외)에서 case-insensitive trim 매칭 +
 *     LEFT JOIN LATERAL 로 최근 신세 1건(메모 + received_date) 결합 (D-026).
 *   - bulkImportEntries — 단일 `db.transaction` 안에서:
 *       1) 모든 row 의 categoryId 가 본인 소유인지 cross-check (pre-validate),
 *       2) 모든 row 의 기존 friendId 가 본인 소유 + 미삭제인지 cross-check,
 *       3) newFriendName dedup (case-insensitive trim) 후 friends bulk insert,
 *       4) entries bulk insert.
 *     어느 단계라도 실패하면 전체 롤백 (009 §J 부분 실패 거절).
 *   - 메모는 호출 측(`lib/import/memo-builder::buildMemo`)에서 이미 빌드된 row.memo 를 그대로 저장.
 *     Step 5 미리보기와 DB 메모가 같은 함수에서 나오도록 단일 진실 원천 보장 (009 §I).
 *
 * 통합 테스트(`tests/integration/import/queries.test.ts` 시나리오 8~11) 가 본 함수의 의미 잠금.
 */

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("인증되지 않은 요청입니다.");
  }
  return user.id;
}

/**
 * 본인 친구 목록에서 주어진 이름들 각각에 대해 매칭 후보를 반환한다.
 *
 *   - 빈 names → 빈 결과 (no-op).
 *   - case-insensitive trim 매칭. soft-deleted 친구 제외.
 *   - 결과는 입력 순서 보존. 매칭 0건 이름도 `candidates: []` 포함.
 *   - 각 후보에 친구 메모(note) + 최근 신세 1건(memo, received_date) LATERAL 결합 (D-026).
 *   - rowIndex 는 입력 배열의 index. 호출 측(wizard)이 parsed.rows index 로 remap 한다.
 *
 * E2E 분기: e2e-store 위에서 같은 의미로 모사 (009 §K).
 */
export async function matchFriendsByName(
  names: ReadonlyArray<string>,
): Promise<ReadonlyArray<MatchResult>> {
  if (names.length === 0) return [];

  if (isE2EBypassEnabled()) {
    const { e2eMatchFriendsByName } = await import("@/lib/import/e2e-store");
    return e2eMatchFriendsByName(names);
  }

  const userId = await requireUserId();

  // 정규화된 키(소문자 + trim). 빈 키는 매칭 후보가 없는 입력으로 처리.
  const normalized = names.map((n) => n.trim().toLowerCase());
  const uniqueNorm = Array.from(new Set(normalized.filter((n) => n.length > 0)));

  if (uniqueNorm.length === 0) {
    return names.map((n, i) => ({
      rowIndex: i,
      name: n,
      candidates: [],
    }));
  }

  // LEFT JOIN LATERAL 로 친구별 최근 신세 1건 결합. drizzle 의 subquery + leftJoinLateral.
  // 서브쿼리가 outer friends.id 를 참조 — 이게 LATERAL 의 본질.
  const recentEntry = db
    .select({
      memo: entries.memo,
      received_date: entries.received_date,
    })
    .from(entries)
    .where(
      and(
        eq(entries.friend_id, friends.id),
        // 정정-1 두 번째 방어선: entries 도 본인 user 한정 (friends 가 본인이라 사실상 동일하지만 명시).
        eq(entries.user_id, userId),
      ),
    )
    .orderBy(desc(entries.received_date), desc(entries.created_at))
    .limit(1)
    .as("recent_entry");

  const rows = await db
    .select({
      friend_id: friends.id,
      friend_name: friends.name,
      friend_note: friends.note,
      norm_name: sql<string>`LOWER(TRIM(${friends.name}))`,
      recent_entry_memo: recentEntry.memo,
      recent_entry_date: recentEntry.received_date,
    })
    .from(friends)
    .leftJoinLateral(recentEntry, sql`TRUE`)
    .where(
      and(
        eq(friends.user_id, userId),
        eq(friends.is_deleted, false),
        inArray(
          sql<string>`LOWER(TRIM(${friends.name}))`,
          uniqueNorm,
        ),
      ),
    );

  // norm_name → candidates[] 맵 (동명이인 누적).
  const candidatesByNorm = new Map<string, MatchCandidate[]>();
  for (const row of rows) {
    const arr = candidatesByNorm.get(row.norm_name) ?? [];
    arr.push({
      friend_id: row.friend_id,
      friend_name: row.friend_name,
      friend_note: row.friend_note,
      recent_entry_memo: row.recent_entry_memo,
      // received_date 는 string 또는 Date 로 들어올 수 있음. 형식 정규화 — YYYY-MM-DD 문자열.
      recent_entry_date:
        row.recent_entry_date == null
          ? null
          : typeof row.recent_entry_date === "string"
            ? row.recent_entry_date
            : new Date(row.recent_entry_date).toISOString().slice(0, 10),
    });
    candidatesByNorm.set(row.norm_name, arr);
  }

  // 입력 순서대로 결과 빌드.
  return names.map((name, i) => {
    const k = name.trim().toLowerCase();
    const candidates = candidatesByNorm.get(k) ?? [];
    return {
      rowIndex: i,
      name,
      candidates,
    };
  });
}

/**
 * 일괄 import 실행 — 새 친구 + entries 를 한 트랜잭션으로 (009 §J).
 *
 *   - 빈 rows → { entriesCreated: 0, friendsCreated: 0 }, throw 아님.
 *   - 모든 row 의 categoryId 본인 소유 확인 → 위반 시 전체 롤백.
 *   - 모든 row 의 기존 friendId 본인 소유 + 미삭제 확인 → 위반 시 전체 롤백.
 *   - 동일 newFriendName(case-insensitive trim) 여러 row 면 friend 1건만 생성 + entries 가 같은 friend_id 재사용.
 *   - 성공 시 `revalidatePath("/")` + `/entries` + `/friends`.
 *
 * E2E 분기: e2e-store 위에서 동작 모사.
 */
export async function bulkImportEntries(
  rows: ReadonlyArray<ImportRow>,
): Promise<BulkImportResult> {
  if (rows.length === 0) {
    return { entriesCreated: 0, friendsCreated: 0 };
  }

  // 입력 모양 빠른 검증 (E2E 분기 진입 전 공통 적용).
  // sfx 라운드 2 🟢 #1 청산: UI(Step 3) 가 specific_date 옵션을 차단하지만, 다른 진입점
  // (모듈 직접 호출, mock, future server action) 에서 specific_date 가 들어와도 006 §E 의
  // "specific_date 가 아니면 repayment_specific_date 는 null" 룰을 위반하지 않도록 defensive guard.
  // ImportRow 채널엔 specific_date 가 들어올 자리가 없어 import 자체를 거절.
  for (const row of rows) {
    if (!row.friendId && !row.newFriendName) {
      throw new Error("친구 정보가 비어 있는 row 가 있어요.");
    }
    if (!row.categoryId) {
      throw new Error("카테고리가 비어 있는 row 가 있어요.");
    }
    if (row.repaymentTiming === "specific_date") {
      throw new Error(
        "일괄 import 는 '특정 날짜' 보답 시점을 지원하지 않아요. 가져온 뒤 개별 신세에서 설정해 주세요.",
      );
    }
  }

  if (isE2EBypassEnabled()) {
    const { e2eBulkImportEntries } = await import("@/lib/import/e2e-store");
    const result = await e2eBulkImportEntries(rows);
    safeRevalidate("/", "import/queries");
    safeRevalidate("/entries", "import/queries");
    safeRevalidate("/friends", "import/queries");
    return result;
  }

  const userId = await requireUserId();

  const uniqueCategoryIds = Array.from(new Set(rows.map((r) => r.categoryId)));
  const uniqueFriendIds = Array.from(
    new Set(
      rows
        .map((r) => r.friendId)
        .filter((id): id is string => id != null && id.length > 0),
    ),
  );

  const newFriendKey = (name: string) => name.trim().toLowerCase();

  const result = await db.transaction(async (tx) => {
    // 1) 카테고리 본인 소유 cross-check.
    if (uniqueCategoryIds.length > 0) {
      const ownedCats = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.user_id, userId),
            inArray(categories.id, uniqueCategoryIds),
          ),
        );
      const ownedSet = new Set(ownedCats.map((c) => c.id));
      for (const cid of uniqueCategoryIds) {
        if (!ownedSet.has(cid)) {
          throw new Error("본인 소유 카테고리가 아닌 row 가 섞여 있어요.");
        }
      }
    }

    // 2) 기존 friendId 본인 소유 + 미삭제 cross-check.
    if (uniqueFriendIds.length > 0) {
      const ownedFriends = await tx
        .select({ id: friends.id })
        .from(friends)
        .where(
          and(
            eq(friends.user_id, userId),
            eq(friends.is_deleted, false),
            inArray(friends.id, uniqueFriendIds),
          ),
        );
      const ownedSet = new Set(ownedFriends.map((f) => f.id));
      for (const fid of uniqueFriendIds) {
        if (!ownedSet.has(fid)) {
          throw new Error("본인 소유 친구가 아닌 row 가 섞여 있어요.");
        }
      }
    }

    // 3) newFriendName dedup + friends bulk insert.
    const dedupNew = new Map<string, string>(); // norm key → raw name (trim).
    for (const row of rows) {
      if (row.newFriendName) {
        const k = newFriendKey(row.newFriendName);
        if (!dedupNew.has(k)) {
          dedupNew.set(k, row.newFriendName.trim());
        }
      }
    }

    const newFriendIdByKey = new Map<string, string>();
    let friendsCreated = 0;
    if (dedupNew.size > 0) {
      const entriesArr = Array.from(dedupNew.entries());
      const created = await tx
        .insert(friends)
        .values(
          entriesArr.map(([, name]) => ({
            user_id: userId,
            name,
          })),
        )
        .returning({ id: friends.id });
      // insert.values 의 순서와 returning 의 순서가 같다 (Postgres 보장).
      created.forEach((c, idx) => {
        newFriendIdByKey.set(entriesArr[idx]![0], c.id);
      });
      friendsCreated = created.length;
    }

    // 4) entries bulk insert.
    const entryValues: NewEntry[] = rows.map((row) => {
      let friendId: string;
      if (row.friendId) {
        friendId = row.friendId;
      } else if (row.newFriendName) {
        const id = newFriendIdByKey.get(newFriendKey(row.newFriendName));
        if (!id) {
          throw new Error("새 친구 매핑 실패 — 내부 dedup 오류.");
        }
        friendId = id;
      } else {
        throw new Error("친구 정보가 비어 있는 row 가 있어요.");
      }
      return {
        user_id: userId,
        friend_id: friendId,
        category_id: row.categoryId,
        memo: row.memo,
        received_date: row.receivedDate,
        repayment_timing: row.repaymentTiming,
      };
    });

    if (entryValues.length > 0) {
      await tx.insert(entries).values(entryValues);
    }

    return {
      entriesCreated: entryValues.length,
      friendsCreated,
    };
  });

  safeRevalidate("/", "import/queries");
  safeRevalidate("/entries", "import/queries");
  safeRevalidate("/friends", "import/queries");
  return result;
}
