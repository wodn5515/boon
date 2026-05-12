import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * drizzle Postgres 클라이언트.
 *
 * - `postgres-js` 드라이버를 사용. `prepare: false` 는 Supabase pooler (PgBouncer 모드) 호환 권장 설정.
 * - 연결은 lazy — 모듈 로드 시점에 실제 TCP 연결을 맺지 않는다 (빌드·테스트 친화적).
 * - `DATABASE_URL` 미설정 시 placeholder 로 폴백해 빌드·테스트가 통과되도록 한다.
 *   런타임에 첫 쿼리에서 자연스럽게 실패하며 가시성이 확보된다.
 *
 * Supabase Free 환경에서는 pooler 6543 포트를 권장한다 (서버리스 함수 동시성).
 */
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://placeholder:placeholder@localhost:5432/placeholder";

const queryClient = postgres(connectionString, {
  prepare: false,
});

export const db = drizzle(queryClient, { schema });
