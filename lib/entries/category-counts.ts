import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { entries } from "@/db/schema/entries";
import { isE2EBypassEnabled } from "@/lib/auth/bypass";
import { getCurrentUser } from "@/lib/auth/user";

/**
 * 본인 user 의 카테고리별 entries 갯수 — Map<category_id, count>.
 *
 * 결정 로그 006 §F: /settings 의 CategoryDeleteDialog 가 entryCount > 0 이면
 * 강제 이전 select 를 노출하기 위한 데이터. 한 번의 GROUP BY 쿼리로 전체 카테고리 카운트를
 * 한꺼번에 받아 페이지 상단에서 Map 으로 만들고 CategoryItem 에 분배한다.
 */
export async function countEntriesByCategory(): Promise<Map<string, number>> {
  if (isE2EBypassEnabled()) {
    // E2E 분기에서도 본격 결합 — entries store 에서 카테고리별 카운트.
    const { e2eListCategories } = await import("@/lib/categories/e2e-store");
    const { e2eCountEntriesByCategory } = await import(
      "@/lib/entries/e2e-store"
    );
    const map = new Map<string, number>();
    for (const c of e2eListCategories()) {
      map.set(c.id, e2eCountEntriesByCategory(c.id));
    }
    return map;
  }
  const user = await getCurrentUser();
  if (!user) return new Map();

  const rows = await db
    .select({
      category_id: entries.category_id,
      count: sql<number>`count(*)::int`,
    })
    .from(entries)
    .where(eq(entries.user_id, user.id))
    .groupBy(entries.category_id);

  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.category_id, Number(r.count));
  }
  return map;
}
