import { db as defaultDb } from "@/db/client";
import { categories } from "@/db/schema/categories";

/**
 * 기본 카테고리 3개 자동 시드 (PRD §3, D-009, D-018).
 *
 * 결정 로그 005 §B:
 *   - callback handler 가 user upsert 직후 같은 트랜잭션에서 호출.
 *   - (💰 물질, ⏰ 시간·행동, 💝 마음) 3개, is_system=true, sort_order 1·2·3.
 *   - 이름·아이콘·색상은 PRD §6 + `lib/categories/types.ts::CATEGORY_COLOR_POOL` 의
 *     앞 3개(brand-primary / brand-lime / brand-light)와 정합.
 *   - 멱등성: 호출자(callback handler) 가 users insert 가 새로 일어났을 때만 본 함수를 부른다.
 *     본 함수는 그 가정 하에 단순 insert. 두 번째 로그인은 호출조차 되지 않음.
 *
 * 트랜잭션:
 *   - 첫 인자(`userId`) 외에 두 번째 인자로 drizzle 트랜잭션 핸들을 받으면, 그 트랜잭션 안에서
 *     categories insert 가 일어난다 (users insert 와 atomic). 인자 미전달 시 기본 `@/db/client::db`.
 *   - 통합 테스트는 `vi.mock("@/db/client")` 로 default db 를 갈아끼우므로 두 번째 인자 없이도 동작.
 */

/**
 * drizzle 의 `db` 와 `tx` (transaction callback 인자) 둘 다 동일한 `insert` 시그니처를 갖는다.
 * 구조적 typing 으로 둘 다 받도록 한다.
 */
type DbOrTx = Pick<typeof defaultDb, "insert">;

const DEFAULT_CATEGORIES = [
  { name: "물질", icon: "💰", color: "#22c55e", sort_order: 1 },
  { name: "시간·행동", icon: "⏰", color: "#84cc16", sort_order: 2 },
  { name: "마음", icon: "💝", color: "#4ade80", sort_order: 3 },
] as const;

export async function seedDefaultCategories(
  userId: string,
  tx?: DbOrTx,
): Promise<void> {
  const handle = tx ?? defaultDb;

  await handle.insert(categories).values(
    DEFAULT_CATEGORIES.map((c) => ({
      user_id: userId,
      name: c.name,
      icon: c.icon,
      color: c.color,
      is_system: true,
      sort_order: c.sort_order,
    })),
  );
}
