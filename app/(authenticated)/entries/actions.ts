"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { categories } from "@/db/schema/categories";
import {
  entries,
  type NewEntry,
} from "@/db/schema/entries";
import { friends } from "@/db/schema/friends";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";
import { safeRevalidate } from "@/lib/server/revalidate";

/**
 * entries Server Action — 결정 로그 006 §B·§C·§E + 정정-1 패턴.
 *
 *   - `getCurrentUser()` 로 user_id 를 서버 측 자동 주입 (클라이언트 위조 차단).
 *   - friend_id / category_id 는 본인 소유 cross-check (application-layer 본 방어선).
 *   - 인라인 친구 빠른 생성: `new_friend_name` 이 채워져 있으면 같은 트랜잭션에서 friend insert
 *     → 받은 friend_id 로 entry insert (006 §C). 한 단계 실패 시 둘 다 롤백.
 *   - 보답 시점이 `specific_date` 가 아니면 `repayment_specific_date` 는 null 로 정리 (006 §E).
 *   - 성공 시 safeRevalidate("/", scope) — 메인 대시보드 (다음 dashboard 슬라이스에서
 *     entries 위젯 결합 예정) + 친구 상세 (defaultFriendId 흐름).
 *
 * 인증: middleware + layout 이 게이트하지만 모든 액션 시작 시 defense-in-depth.
 */

type RepaymentTiming =
  | "anytime"
  | "friend_birthday"
  | "specific_event"
  | "specific_date";

const VALID_TIMINGS: ReadonlyArray<RepaymentTiming> = [
  "anytime",
  "friend_birthday",
  "specific_event",
  "specific_date",
];

class UnauthenticatedError extends Error {
  constructor() {
    super("인증되지 않은 요청입니다.");
    this.name = "UnauthenticatedError";
  }
}

async function currentUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user.id;
}

function parseString(
  formData: FormData,
  field: string,
  required: boolean,
): string {
  const raw = formData.get(field);
  if (typeof raw !== "string") {
    if (required) throw new Error(`${field} 가 누락되었습니다.`);
    return "";
  }
  return raw;
}

function parseRepaymentTiming(formData: FormData): RepaymentTiming {
  const raw = parseString(formData, "repayment_timing", true);
  if (!(VALID_TIMINGS as readonly string[]).includes(raw)) {
    throw new Error("올바르지 않은 보답 시점이에요.");
  }
  return raw as RepaymentTiming;
}

function parseReceivedDate(formData: FormData): string {
  const raw = parseString(formData, "received_date", true).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("받은 날짜 형식이 올바르지 않아요.");
  }
  return raw;
}

function parseRepaymentSpecificDate(
  formData: FormData,
  timing: RepaymentTiming,
): string | null {
  // 006 §E: 보답 시점이 specific_date 가 아니면 입력값을 무시한다.
  if (timing !== "specific_date") return null;
  const raw = parseString(formData, "repayment_specific_date", false).trim();
  if (raw.length === 0) {
    throw new Error("특정 날짜를 선택해 주세요.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("특정 날짜 형식이 올바르지 않아요.");
  }
  return raw;
}

function parseFriendInput(formData: FormData): {
  friendId: string | null;
  newFriendName: string | null;
} {
  const friendIdRaw = parseString(formData, "friend_id", false).trim();
  const newNameRaw = parseString(formData, "new_friend_name", false).trim();
  if (friendIdRaw.length > 0) {
    return { friendId: friendIdRaw, newFriendName: null };
  }
  if (newNameRaw.length > 0) {
    // 006 §C: 인라인 빠른 생성 — trim 후 1자 이상.
    return { friendId: null, newFriendName: newNameRaw };
  }
  throw new Error("친구를 선택하거나 새로 추가해 주세요.");
}

function parseCategoryId(formData: FormData): string {
  const raw = parseString(formData, "category_id", true).trim();
  if (raw.length === 0) throw new Error("카테고리를 선택해 주세요.");
  return raw;
}

function parseMemo(formData: FormData): string {
  // 006 §D: memo 는 NOT NULL 이지만 빈 문자열 허용.
  return parseString(formData, "memo", false);
}

/**
 * 신세 추가. user_id 서버 주입 + friend_id/category_id 본인 소유 cross-check.
 *
 * 인라인 친구 빠른 생성: `new_friend_name` 이 채워져 있으면 트랜잭션 안에서
 * friend insert + entry insert. 어느 한 단계라도 실패하면 둘 다 롤백 (006 §C).
 */
export async function createEntry(formData: FormData): Promise<void> {
  const { friendId, newFriendName } = parseFriendInput(formData);
  const categoryId = parseCategoryId(formData);
  const memo = parseMemo(formData);
  const receivedDate = parseReceivedDate(formData);
  const timing = parseRepaymentTiming(formData);
  const specificDate = parseRepaymentSpecificDate(formData, timing);

  if (isE2EBypassEnabled()) {
    const { e2eCreateEntry } = await import("@/lib/entries/e2e-store");
    e2eCreateEntry({
      friendId,
      newFriendName,
      categoryId,
      memo,
      receivedDate,
      timing,
      specificDate,
    });
    safeRevalidate("/", "entries/actions");
    return;
  }

  const userId = await currentUserId();

  // 카테고리는 본인 소유여야 한다 — 트랜잭션 밖에서 미리 검증해 빠른 거절.
  const [catRow] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.user_id, userId)))
    .limit(1);
  if (!catRow) {
    throw new Error("카테고리가 존재하지 않거나 본인 소유가 아니에요.");
  }

  await db.transaction(async (tx) => {
    let effectiveFriendId = friendId;
    if (newFriendName) {
      // 인라인 빠른 생성 — 같은 트랜잭션에서 친구 row 먼저 insert.
      const [created] = await tx
        .insert(friends)
        .values({
          user_id: userId,
          name: newFriendName,
        })
        .returning({ id: friends.id });
      if (!created) throw new Error("친구 생성에 실패했어요.");
      effectiveFriendId = created.id;
    } else if (friendId) {
      // 기존 친구 — 본인 소유 + 미삭제 검증.
      const [own] = await tx
        .select({ id: friends.id })
        .from(friends)
        .where(
          and(
            eq(friends.id, friendId),
            eq(friends.user_id, userId),
            eq(friends.is_deleted, false),
          ),
        )
        .limit(1);
      if (!own) {
        throw new Error("친구가 존재하지 않거나 본인 소유가 아니에요.");
      }
    } else {
      // parseFriendInput 가 이미 거절했어야 함 (방어).
      throw new Error("친구가 비어 있어요.");
    }

    const values: NewEntry = {
      user_id: userId,
      friend_id: effectiveFriendId!,
      category_id: categoryId,
      memo,
      received_date: receivedDate,
      repayment_timing: timing,
      repayment_specific_date: specificDate,
    };
    await tx.insert(entries).values(values);
  });

  safeRevalidate("/", "entries/actions");
  safeRevalidate("/friends", "entries/actions");
}

/**
 * 신세 수정 — 본인 entry 만, friend_id / category_id 변경 시 본인 소유 재검증.
 *
 * 변경 거절 시 부분 적용 금지 — friend_id 가 다른 user 의 것이면 메모도 함께 거절.
 */
export async function updateEntry(formData: FormData): Promise<void> {
  const id = parseString(formData, "id", true).trim();
  if (id.length === 0) throw new Error("신세 ID 가 누락되었습니다.");
  const { friendId, newFriendName } = parseFriendInput(formData);
  const categoryId = parseCategoryId(formData);
  const memo = parseMemo(formData);
  const receivedDate = parseReceivedDate(formData);
  const timing = parseRepaymentTiming(formData);
  const specificDate = parseRepaymentSpecificDate(formData, timing);

  if (isE2EBypassEnabled()) {
    const { e2eUpdateEntry } = await import("@/lib/entries/e2e-store");
    e2eUpdateEntry({
      id,
      friendId,
      newFriendName,
      categoryId,
      memo,
      receivedDate,
      timing,
      specificDate,
    });
    safeRevalidate("/", "entries/actions");
    return;
  }

  const userId = await currentUserId();

  // 본인 entry 인지 먼저 확인.
  const [own] = await db
    .select({ id: entries.id, friend_id: entries.friend_id })
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.user_id, userId)))
    .limit(1);
  if (!own) {
    // 다른 user 의 entry 거나 존재하지 않음 — silent (정정-1).
    safeRevalidate("/", "entries/actions");
    return;
  }

  // 카테고리 본인 소유 cross-check.
  const [catRow] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.user_id, userId)))
    .limit(1);
  if (!catRow) {
    throw new Error("카테고리가 존재하지 않거나 본인 소유가 아니에요.");
  }

  await db.transaction(async (tx) => {
    let effectiveFriendId = friendId;
    if (newFriendName) {
      const [created] = await tx
        .insert(friends)
        .values({ user_id: userId, name: newFriendName })
        .returning({ id: friends.id });
      if (!created) throw new Error("친구 생성에 실패했어요.");
      effectiveFriendId = created.id;
    } else if (friendId) {
      const [ownFriend] = await tx
        .select({ id: friends.id })
        .from(friends)
        .where(
          and(
            eq(friends.id, friendId),
            eq(friends.user_id, userId),
            eq(friends.is_deleted, false),
          ),
        )
        .limit(1);
      if (!ownFriend) {
        throw new Error("친구가 존재하지 않거나 본인 소유가 아니에요.");
      }
    } else {
      throw new Error("친구가 비어 있어요.");
    }

    await tx
      .update(entries)
      .set({
        friend_id: effectiveFriendId!,
        category_id: categoryId,
        memo,
        received_date: receivedDate,
        repayment_timing: timing,
        repayment_specific_date: specificDate,
        updated_at: new Date(),
      })
      .where(and(eq(entries.id, id), eq(entries.user_id, userId)));
  });

  safeRevalidate("/", "entries/actions");
  safeRevalidate("/friends", "entries/actions");
}

/**
 * 신세 삭제 — hard delete (D-017). 휴지통 없음.
 * 본인 entry 만, 다른 user 의 entry id 면 silent 종료 (정정-1).
 */
export async function deleteEntry(id: string): Promise<void> {
  if (!id) throw new Error("신세 ID 가 누락되었습니다.");

  if (isE2EBypassEnabled()) {
    const { e2eDeleteEntry } = await import("@/lib/entries/e2e-store");
    e2eDeleteEntry(id);
    safeRevalidate("/", "entries/actions");
    return;
  }

  const userId = await currentUserId();

  await db
    .delete(entries)
    .where(and(eq(entries.id, id), eq(entries.user_id, userId)));

  safeRevalidate("/", "entries/actions");
  safeRevalidate("/friends", "entries/actions");
}
