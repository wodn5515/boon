import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "@/lib/env";

import * as schema from "./schema";

/**
 * drizzle Postgres 클라이언트.
 *
 * - `postgres-js` 드라이버. `prepare: false` 는 Supabase pooler(PgBouncer) 호환 권장.
 * - 환경 변수는 모듈 로드 시점이 아닌 첫 쿼리 직전에 lazy 평가 — 빌드·테스트 친화.
 *   `getDatabaseUrl()` 는 production 에서 누락 시 즉시 throw (결정 로그 004 §J-2).
 *
 * 통합 테스트는 `vi.mock("@/db/client", () => ({ db: testDb.db }))` 로 이 export 를
 *   대체한다. E2E 는 friends 쿼리/액션 레이어에서 별도 in-memory 스토어로 분기 — 본 모듈은 그대로.
 */

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getDb() {
  if (cached) return cached;
  const queryClient = postgres(getDatabaseUrl(), { prepare: false });
  cached = drizzle(queryClient, { schema });
  return cached;
}

/**
 * `db.select(...)` 첫 호출 시 lazy 초기화. 빌드/타입체크/모듈 import 만 으로는 connection 을
 * 맺지 않는다.
 */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
