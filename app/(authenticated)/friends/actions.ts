"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { friends } from "@/db/schema/friends";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";
import { safeRevalidate } from "@/lib/server/revalidate";

/**
 * 친구 CRUD Server Action (결정 로그 004 §B).
 *
 * 모든 액션은:
 *   - `getCurrentUser()` 로 user_id 를 서버 측에서 자동 주입한다 (클라이언트 위조 방지)
 *   - 비로그인 시 그대로 throw — middleware 가 이미 게이트하므로 도달 불가하지만 방어 코딩
 *   - 성공 시 `/friends` revalidate (목록 새로고침)
 *
 * 생일은 month·day 둘 다 있어야 저장 (결정 로그 004 §E-4).
 * 한 쪽만 있으면 둘 다 null 로 통일.
 *
 * navigate(redirect) 는 클라이언트 컴포넌트가 useRouter 로 처리한다.
 * 통합 테스트가 Next.js render context 밖에서 액션을 호출하므로 redirect 를
 * 서버 액션 안에서 호출하면 NEXT_REDIRECT 가 throw 되어 spec 이 깨진다.
 * revalidatePath 도 동일 위험이 있어 try/catch 로 흡수한다 (캐시 무효화는 best-effort).
 */

const SCOPE = "friends/actions";

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

function parseBirthday(formData: FormData): {
  birthday_month: number | null;
  birthday_day: number | null;
} {
  const rawMonth = formData.get("birthday_month");
  const rawDay = formData.get("birthday_day");
  const month =
    typeof rawMonth === "string" && rawMonth.length > 0
      ? Number(rawMonth)
      : null;
  const day =
    typeof rawDay === "string" && rawDay.length > 0 ? Number(rawDay) : null;
  // 한 쪽만 채워졌으면 둘 다 무효화 (D-017 가시화 vs 단순화 트레이드오프 — 004 §E-4).
  if (month == null || day == null) {
    return { birthday_month: null, birthday_day: null };
  }
  // 범위 가드. 이상값은 null 로 둔다 (UI 가 Select 라 도달 불가지만 방어).
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return { birthday_month: null, birthday_day: null };
  }
  return { birthday_month: month, birthday_day: day };
}

function parseName(formData: FormData): string {
  const raw = formData.get("name");
  if (typeof raw !== "string") throw new Error("이름은 필수입니다.");
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new Error("이름은 필수입니다.");
  return trimmed;
}

function parseNote(formData: FormData): string | null {
  const raw = formData.get("note");
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 친구 추가.
 *
 * - user_id 는 서버에서 자동 주입 (클라이언트가 못 정함).
 * - 성공 시 모달은 클라이언트 측에서 닫히고, 페이지가 revalidate 되어 새 카드가 보인다.
 */
export async function createFriend(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  const name = parseName(formData);
  const birthday = parseBirthday(formData);
  const note = parseNote(formData);

  if (isE2EBypassEnabled()) {
    const { e2eCreateFriend } = await import("@/lib/friends/e2e-store");
    e2eCreateFriend({
      name,
      birthday_month: birthday.birthday_month,
      birthday_day: birthday.birthday_day,
      note,
    });
  } else {
    await db.insert(friends).values({
      user_id: userId,
      name,
      birthday_month: birthday.birthday_month,
      birthday_day: birthday.birthday_day,
      note,
    });
  }

  safeRevalidate("/friends", SCOPE);
}

/**
 * 친구 수정.
 *
 * - RLS 로 다른 user_id 행은 0 rows affected (시나리오 13).
 * - id 가 form 에 들어와야 한다. 없으면 throw.
 */
export async function updateFriend(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  const rawId = formData.get("id");
  if (typeof rawId !== "string" || rawId.length === 0) {
    throw new Error("친구 ID 가 누락되었습니다.");
  }
  const name = parseName(formData);
  const birthday = parseBirthday(formData);
  const note = parseNote(formData);

  if (isE2EBypassEnabled()) {
    const { e2eUpdateFriend } = await import("@/lib/friends/e2e-store");
    e2eUpdateFriend({
      id: rawId,
      name,
      birthday_month: birthday.birthday_month,
      birthday_day: birthday.birthday_day,
      note,
    });
  } else {
    await db
      .update(friends)
      .set({
        name,
        birthday_month: birthday.birthday_month,
        birthday_day: birthday.birthday_day,
        note,
        updated_at: new Date(),
      })
      // RLS 가 user_id 격리를 처리하지만 application-layer 이중 방어로 user_id 도 명시.
      // RLS 만 신뢰하면 정책 실수 시 사일런트로 다른 사용자 row 가 갱신될 수 있다.
      .where(and(eq(friends.id, rawId), eq(friends.user_id, userId)));
  }

  safeRevalidate("/friends", SCOPE);
  safeRevalidate(`/friends/${rawId}`, SCOPE);
}

/**
 * 친구 삭제 = soft delete (is_deleted=true). D-017.
 *
 * - 받은 신세(entries) 는 보존되지만 UI 에서 미노출 (entries 슬라이스에서 검증).
 * - 성공 후 클라이언트(`FriendDeleteDialog`)가 `useRouter().push("/friends")` 로 이동.
 *   Server Action 안에서 redirect 를 호출하면 NEXT_REDIRECT 가 throw 되어
 *   통합 테스트가 깨진다 (시나리오 12). navigate 책임을 클라이언트로 분리.
 */
export async function deleteFriend(id: string): Promise<void> {
  const userId = await currentUserId();
  if (!id) throw new Error("친구 ID 가 누락되었습니다.");

  if (isE2EBypassEnabled()) {
    const { e2eDeleteFriend } = await import("@/lib/friends/e2e-store");
    e2eDeleteFriend(id);
  } else {
    await db
      .update(friends)
      .set({ is_deleted: true, updated_at: new Date() })
      .where(and(eq(friends.id, id), eq(friends.user_id, userId)));
  }

  safeRevalidate("/friends", SCOPE);
}
