"use server";

import { and, eq, max, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { categories } from "@/db/schema/categories";
import { entries } from "@/db/schema/entries";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";
import { safeRevalidate } from "@/lib/server/revalidate";
import { createClient } from "@/lib/supabase/server";

/**
 * 카테고리 Server Action (결정 로그 005 §C / 정정-1 패턴 동일 적용).
 *
 * 모든 액션은:
 *   - `getCurrentUser()` 로 user_id 를 서버 측에서 자동 주입한다 (클라이언트 위조 방지)
 *   - application-layer 단일 방어선: `and(eq(id), eq(user_id))` 명시 (RLS 는 두 번째 방어선)
 *   - 성공 시 `/settings` revalidate
 *
 * 시스템 카테고리(is_system=true) 보호:
 *   - update: name 만 적용. icon/color 가 들어와도 silent ignore (005 §E)
 *   - delete: throw (frontend 가 trigger 자체를 막지만 방어 코딩)
 *   - reorder: 시스템 영역 침범 못함 (sort_order swap 시 is_system 동일성 확인)
 *
 * 상한 20 (005 §D):
 *   - 본인의 is_system=false 카테고리 수만 카운트
 *   - 초과 시 throw → CategoryFormDialog 의 try/catch 가 사용자 메시지로 노출
 */

const USER_CATEGORY_LIMIT = 20;
const SCOPE = "settings/actions";

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

function parseName(formData: FormData): string {
  const raw = formData.get("name");
  if (typeof raw !== "string") throw new Error("이름은 필수입니다.");
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new Error("이름은 필수입니다.");
  if (trimmed.length > 40) {
    throw new Error("이름은 40자 이하로 입력해 주세요.");
  }
  return trimmed;
}

function parseIcon(formData: FormData): string | null {
  const raw = formData.get("icon");
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseColor(formData: FormData): string {
  const raw = formData.get("color");
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("색상은 필수입니다.");
  }
  return raw;
}

/**
 * 카테고리 추가 (005 §C·§D).
 *
 * - user_id 는 서버에서 자동 주입.
 * - is_system 은 항상 false 강제 (클라이언트가 위조해 보내도 무시).
 * - sort_order = MAX(sort_order) + 1 (사용자 + 시스템 통합 MAX 기준 — 시스템은 1·2·3이라 4부터 시작).
 * - 사용자 카테고리(is_system=false) 가 이미 20개면 throw.
 */
export async function createCategory(formData: FormData): Promise<void> {
  const name = parseName(formData);
  const icon = parseIcon(formData);
  const color = parseColor(formData);

  if (isE2EBypassEnabled()) {
    const { e2eCreateCategory } = await import("@/lib/categories/e2e-store");
    e2eCreateCategory({ name, icon, color });
    safeRevalidate("/settings", SCOPE);
    return;
  }

  const userId = await currentUserId();

  // 상한 20 검사. 사용자 카테고리만 카운트(시스템 3개 제외).
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories)
    .where(
      and(
        eq(categories.user_id, userId),
        eq(categories.is_system, false),
      ),
    );
  const userCount = Number(countRow?.count ?? 0);
  if (userCount >= USER_CATEGORY_LIMIT) {
    throw new Error(
      `카테고리는 최대 ${USER_CATEGORY_LIMIT}개까지 추가할 수 있어요.`,
    );
  }

  // MAX(sort_order) + 1. 본인 카테고리 한정.
  const [maxRow] = await db
    .select({ max: max(categories.sort_order) })
    .from(categories)
    .where(eq(categories.user_id, userId));
  const nextOrder = (maxRow?.max ?? 0) + 1;

  await db.insert(categories).values({
    user_id: userId,
    name,
    icon,
    color,
    is_system: false, // 클라이언트 위조 무시.
    sort_order: nextOrder,
  });

  safeRevalidate("/settings", SCOPE);
}

/**
 * 카테고리 수정 (005 §C·§E).
 *
 * - id 가 form 에 들어와야 한다. 없으면 throw.
 * - 본인 카테고리만 수정 (application-layer + RLS 이중 방어).
 * - 시스템 카테고리(is_system=true) 는 name 만 update. icon/color 가 들어와도 silent ignore.
 */
export async function updateCategory(formData: FormData): Promise<void> {
  const rawId = formData.get("id");
  if (typeof rawId !== "string" || rawId.length === 0) {
    throw new Error("카테고리 ID 가 누락되었습니다.");
  }
  const name = parseName(formData);
  const icon = parseIcon(formData);
  const color = parseColor(formData);

  if (isE2EBypassEnabled()) {
    const { e2eUpdateCategory } = await import("@/lib/categories/e2e-store");
    e2eUpdateCategory({ id: rawId, name, icon, color });
    safeRevalidate("/settings", SCOPE);
    return;
  }

  const userId = await currentUserId();

  // 본인 카테고리 + is_system 확인. 다른 user 의 카테고리는 row 0 → noop.
  const [existing] = await db
    .select({ is_system: categories.is_system })
    .from(categories)
    .where(
      and(eq(categories.id, rawId), eq(categories.user_id, userId)),
    )
    .limit(1);

  if (!existing) {
    // 다른 user 의 카테고리거나 존재하지 않음 — 조용히 종료 (RLS 단독 회귀와 정합).
    safeRevalidate("/settings", SCOPE);
    return;
  }

  // 시스템 카테고리는 name 만 변경 가능. icon/color 는 무시.
  const updateSet = existing.is_system
    ? { name, updated_at: new Date() }
    : { name, icon, color, updated_at: new Date() };

  await db
    .update(categories)
    .set(updateSet)
    .where(
      and(eq(categories.id, rawId), eq(categories.user_id, userId)),
    );

  safeRevalidate("/settings", SCOPE);
}

/**
 * 카테고리 삭제 (005 §C·§F, D-018).
 *
 * - 시스템 카테고리(is_system=true) 는 throw (frontend 가 trigger 자체를 막지만 방어 코딩).
 * - 본인 카테고리만 hard delete.
 * - migrateTo 가 주어지면: 해당 카테고리에 묶인 entries 를 migrateTo 로 이전 후 삭제
 *   → V1 본 슬라이스엔 entries 테이블 없음 → placeholder. entries 슬라이스에서 결합.
 */
export async function deleteCategory(args: {
  id: string;
  migrateTo: string | null;
}): Promise<void> {
  if (!args.id) throw new Error("카테고리 ID 가 누락되었습니다.");

  if (isE2EBypassEnabled()) {
    const { e2eDeleteCategory } = await import("@/lib/categories/e2e-store");
    const { e2eCountEntriesByCategory, e2eMigrateEntriesCategory } =
      await import("@/lib/entries/e2e-store");
    // E2E 분기에서도 본격 결합: 묶인 entries 가 있으면 migrateTo 필수.
    const count = e2eCountEntriesByCategory(args.id);
    if (count > 0) {
      if (!args.migrateTo) {
        throw new Error("이전할 카테고리를 선택해 주세요.");
      }
      e2eMigrateEntriesCategory(args.id, args.migrateTo);
    }
    e2eDeleteCategory(args.id);
    safeRevalidate("/settings", SCOPE);
    return;
  }

  const userId = await currentUserId();

  // 시스템 카테고리 방어. 본인 카테고리만 조회.
  const [existing] = await db
    .select({ is_system: categories.is_system })
    .from(categories)
    .where(
      and(eq(categories.id, args.id), eq(categories.user_id, userId)),
    )
    .limit(1);

  if (!existing) {
    // 다른 user 의 카테고리거나 존재하지 않음 — silent. RLS 단독 회귀와 정합.
    safeRevalidate("/settings", SCOPE);
    return;
  }

  if (existing.is_system) {
    throw new Error("기본 카테고리는 삭제할 수 없어요.");
  }

  // 006 §F: 묶인 entries 가 있으면 강제 이전 필수.
  // FK 제약(ON DELETE RESTRICT) 으로도 막히지만 application-layer 에서 먼저 사용자 친화 throw.
  const [entryCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entries)
    .where(
      and(
        eq(entries.user_id, userId),
        eq(entries.category_id, args.id),
      ),
    );
  const entryCount = Number(entryCountRow?.count ?? 0);

  if (entryCount > 0) {
    if (!args.migrateTo) {
      throw new Error("이전할 카테고리를 선택해 주세요.");
    }
    // 이전 대상 카테고리도 본인 소유 + 자기 자신이 아닌지 확인.
    if (args.migrateTo === args.id) {
      throw new Error("같은 카테고리로 이전할 수 없어요.");
    }
    const [migrateTarget] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, args.migrateTo),
          eq(categories.user_id, userId),
        ),
      )
      .limit(1);
    if (!migrateTarget) {
      throw new Error("이전할 카테고리를 찾을 수 없어요.");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(entries)
        .set({ category_id: args.migrateTo!, updated_at: new Date() })
        .where(
          and(
            eq(entries.user_id, userId),
            eq(entries.category_id, args.id),
          ),
        );
      await tx
        .delete(categories)
        .where(
          and(eq(categories.id, args.id), eq(categories.user_id, userId)),
        );
    });
  } else {
    await db
      .delete(categories)
      .where(
        and(eq(categories.id, args.id), eq(categories.user_id, userId)),
      );
  }

  safeRevalidate("/settings", SCOPE);
  safeRevalidate("/", SCOPE);
}

/**
 * 카테고리 정렬 변경 (sort_order swap).
 *
 * - 본인 카테고리만 swap.
 * - 시스템 카테고리 영역 침범 못함 (is_system 동일성 검사).
 * - direction = "up" 이면 한 칸 위와 swap, "down" 이면 한 칸 아래와 swap.
 *
 * V1 본 슬라이스: UI 가 onMoveUp/onMoveDown placeholder 호출 시 이 액션을 결합.
 * 결합 안 됐을 때도 throw 없이 silent 동작.
 */
export async function reorderCategory(
  id: string,
  direction: "up" | "down",
): Promise<void> {
  if (!id) throw new Error("카테고리 ID 가 누락되었습니다.");

  if (isE2EBypassEnabled()) {
    const { e2eReorderCategory } = await import("@/lib/categories/e2e-store");
    e2eReorderCategory(id, direction);
    safeRevalidate("/settings", SCOPE);
    return;
  }

  const userId = await currentUserId();

  // 대상 카테고리 (본인 카테고리만).
  const [target] = await db
    .select({
      id: categories.id,
      sort_order: categories.sort_order,
      is_system: categories.is_system,
    })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.user_id, userId)))
    .limit(1);

  if (!target) return;

  // 같은 그룹(is_system 동일) 내에서 인접 카테고리 찾기.
  const rows = await db
    .select({
      id: categories.id,
      sort_order: categories.sort_order,
    })
    .from(categories)
    .where(
      and(
        eq(categories.user_id, userId),
        eq(categories.is_system, target.is_system),
      ),
    )
    .orderBy(categories.sort_order);

  const idx = rows.findIndex((r) => r.id === target.id);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;

  const neighbor = rows[swapIdx]!;

  // sort_order 교환. updated_at 도 갱신.
  await db.transaction(async (tx) => {
    await tx
      .update(categories)
      .set({ sort_order: neighbor.sort_order, updated_at: new Date() })
      .where(
        and(eq(categories.id, target.id), eq(categories.user_id, userId)),
      );
    await tx
      .update(categories)
      .set({ sort_order: target.sort_order, updated_at: new Date() })
      .where(
        and(eq(categories.id, neighbor.id), eq(categories.user_id, userId)),
      );
  });

  safeRevalidate("/settings", SCOPE);
}

/**
 * 로그아웃 (PRD §5).
 *
 * - Supabase 세션 종료 + `/login` 으로 redirect.
 * - E2E 우회 모드(`E2E_BYPASS_AUTH=1`) 에서는 placeholder Supabase URL 이라 실제 호출이 의미 없음.
 *   바로 redirect — 다음 페이지(/login) 진입 시 fixture cookie 가 그대로 살아있을 수 있지만,
 *   E2E 시나리오 8 의 본질은 "로그아웃 클릭 → /login URL 이동" 확인이라 충분.
 */
export async function signOut(): Promise<void> {
  if (!isE2EBypassEnabled()) {
    const supabase = await createClient();
    // Supabase API 가 일시 장애여도 사용자가 로그인 화면에 머무는 게 안전 — 에러 시에도 redirect 흐름은 유지.
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("[settings/actions] signOut failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      // 006 §J-1 / PR #4 🟡 #1: Supabase API 가 throw 하더라도 사용자가 의도한 "로그아웃" 이
      // 사일런트로 무효화되면 안 된다. cookie 를 강제 삭제해 다음 요청이 비인증 상태로 출발하도록.
      // Supabase SSR 의 auth cookie 이름 규약 `sb-<ref>-auth-token` 만 정리한다 (다른 쿠키 영향 없음).
      try {
        const cookieStore = await cookies();
        for (const c of cookieStore.getAll()) {
          if (c.name.startsWith("sb-") && c.name.endsWith("-auth-token")) {
            cookieStore.delete(c.name);
          }
        }
      } catch (cookieErr) {
        // 통합 테스트 등 비-요청 컨텍스트에서는 cookies() 가 throw — silent.
        if (process.env.NODE_ENV === "production") {
          console.warn("[settings/actions] cookie cleanup failed", {
            error:
              cookieErr instanceof Error
                ? cookieErr.message
                : String(cookieErr),
          });
        }
      }
    }
  }
  // redirect 는 NEXT_REDIRECT 를 throw — server action 의 정상 종료 흐름.
  redirect("/login");
}
