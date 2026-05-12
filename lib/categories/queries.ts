import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { categories, type Category } from "@/db/schema/categories";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";

/**
 * categories 도메인 read 쿼리.
 *
 * 결정 로그 005 §A·§C·§I (정정-1 패턴 동일 적용):
 *   - **application-layer 단일 방어선**: `user_id` WHERE 절을 명시한다.
 *     drizzle-orm 의 postgres-js 직결은 SUPERUSER 권한이라 RLS 가 자동 우회됨.
 *     application-layer 필터가 본 방어선, RLS 는 두 번째 방어선.
 *   - 정렬: `is_system DESC, sort_order ASC`.
 *     - Postgres 의 boolean 정렬은 `false < true`. `desc(is_system)` 으로 true(시스템)가 먼저.
 *     - 같은 그룹 내에서는 `asc(sort_order)`.
 *     - lib/categories/types.ts::sortCategories 결과와 동일 — 회귀 잠금은 단위 테스트(시나리오 21)가 한다.
 *
 * 통합 테스트는 `vi.mock("@/lib/auth/user")` 로 `getCurrentUser` 를 본인 user 로 갈아끼우고,
 * pglite + setAuthContext 가 RLS 도 함께 검증한다 — application + RLS 이중 통과.
 */

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("인증되지 않은 요청입니다.");
  }
  return user.id;
}

export async function listCategories(): Promise<Category[]> {
  if (isE2EBypassEnabled()) {
    const { e2eListCategories } = await import("./e2e-store");
    return e2eListCategories();
  }
  const userId = await requireUserId();
  return await db
    .select()
    .from(categories)
    .where(eq(categories.user_id, userId))
    .orderBy(desc(categories.is_system), asc(categories.sort_order));
}
