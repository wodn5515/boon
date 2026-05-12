import { promises as fs } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";

import * as schema from "@/db/schema";

/**
 * 통합 테스트용 in-memory Postgres (결정 로그 004 §H·§I).
 *
 * - pglite 인스턴스 위에 drizzle 마이그레이션(`db/migrations/*.sql`)을 순서대로 적용한다.
 * - Supabase 의 `auth.uid()` 함수를 pglite 에서 polyfill — RLS 정책이 동일 패턴으로 통과.
 * - 인증 컨텍스트는 `request.jwt.claims` GUC + `SET ROLE authenticated` 로 흉내낸다.
 *
 * RLS bypass 모델 (Supabase 의 service_role / authenticated 분리와 정합):
 *   - pglite 의 기본 role 은 `postgres` (superuser) — RLS 자동 bypass (service_role 흉내).
 *   - `setAuthContext` 가 `SET ROLE authenticated` + GUC 를 심으면 그 role 에서는 RLS 가 적용된다.
 *   - 테스트가 `testDb.pg` 로 직접 호출하는 시드/cleanup 쿼리는 매 호출 직전에 role 을 postgres 로
 *     RESET 하는 proxy 를 통과 — seed insert·DELETE 가 RLS 에 막히지 않는다.
 *   - drizzle 의 내부 client 는 raw pglite 를 그대로 받아 setAuthContext 가 설정한 role 을 그대로 사용.
 *
 * 단위:
 *   - `createTestDb()` → `{ db, pg, cleanup }`
 *   - `setAuthContext(testDb, userId)` → 본인 user 로 행세하는 RLS 컨텍스트 주입
 *
 * 마이그레이션 순서 = 파일명 알파벳 (0000_init.sql → 0001_friends.sql → 0002_rls.sql → 0003_users_unique.sql).
 * drizzle-kit 의 `meta/_journal.json` 은 무시한다 — 본 슬라이스에서 0002/0003 은 수기 SQL 이라 journal 에 없음.
 */

export type TestDb = {
  db: PgliteDatabase<typeof schema>;
  /**
   * 테스트가 직접 사용하는 raw pglite 핸들. RLS 우회용 proxy 다 — 매 .query/.exec 직전에
   * `RESET ROLE` 을 실행해 postgres(superuser) 상태로 돌아간다. 시드 insert / cleanup 쿼리는
   * 이 proxy 로 들어와 RLS 와 무관하게 동작한다.
   */
  pg: PGlite;
  cleanup: () => Promise<void>;
};

const MIGRATIONS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../db/migrations",
);

/**
 * pg.query 의 SQL 문은 한 statement 만 허용한다.
 * drizzle 마이그레이션은 `--> statement-breakpoint` 로 여러 statement 가 한 파일에 들어있다.
 * 이 헬퍼는 그 토큰으로 split 한 뒤 빈 statement 를 제거한다.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split(/-->\s*statement-breakpoint\s*/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function applyMigrations(pg: PGlite): Promise<void> {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = entries
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of sqlFiles) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const stmt of splitStatements(sql)) {
      await pg.exec(stmt);
    }
  }
}

/**
 * Supabase `auth.uid()` 호환 polyfill + `authenticated` role 생성.
 *
 * - 실서비스: PostgREST 가 매 요청마다 GUC `request.jwt.claims` 에 JWT claim JSON 을 심고
 *   `auth.uid()` 가 sub 를 뽑아 UUID 로 캐스트. service_role 토큰은 BYPASSRLS 로 우회.
 * - pglite: 동일 함수를 직접 정의. role 분리는 postgres(superuser, bypass) vs authenticated(non-bypass).
 */
async function definePgliteAuthShim(pg: PGlite): Promise<void> {
  await pg.exec(`CREATE SCHEMA IF NOT EXISTS auth`);
  await pg.exec(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
    $$ LANGUAGE sql STABLE;
  `);

  // 실 사용자 흐름이 통과할 role — Supabase 의 `authenticated` 와 동일 이름.
  // IF NOT EXISTS 가 없는 환경(Postgres < 9.6 호환)을 위해 exception 흡수.
  await pg.exec(`
    DO $$ BEGIN
      CREATE ROLE authenticated;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  // public 스키마의 모든 테이블에 권한 부여. RLS 가 row 단위에서 한 번 더 거른다.
  await pg.exec(`GRANT USAGE ON SCHEMA public TO authenticated`);
  await pg.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated`);
  await pg.exec(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated`);
  await pg.exec(`GRANT USAGE ON SCHEMA auth TO authenticated`);
  await pg.exec(`GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated`);
}

/**
 * pglite 를 감싸는 Proxy: query / exec 호출 직전에 RESET ROLE 을 실행해 postgres(superuser)
 * 상태로 돌린다. 테스트의 seed/cleanup 이 RLS 에 막히지 않게 만들기 위함.
 *
 * 주의: 이 proxy 는 drizzle 의 client 로는 사용하지 않는다 (drizzle 는 raw pglite 를 그대로 받는다).
 * 따라서 `setAuthContext` 가 설정한 role 은 drizzle 쿼리에만 살아남는다.
 */
function makeResetRoleProxy(pg: PGlite): PGlite {
  // 일부 메서드는 `this` 가 PGlite 이어야 wasm 핸들이 동작 — bind 가 필요.
  return new Proxy(pg, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (prop === "query" || prop === "exec") {
        return (async (...args: unknown[]) => {
          // 매 호출 직전 superuser 로 되돌린다. 이미 postgres 이면 no-op.
          await target.exec(`RESET ROLE`);
          return await (original as (...callArgs: unknown[]) => unknown).apply(
            target,
            args,
          );
        }) as unknown;
      }
      if (typeof original === "function") {
        return (original as (...args: unknown[]) => unknown).bind(target);
      }
      return original;
    },
  }) as PGlite;
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.waitReady;

  // auth.uid() shim + authenticated role 은 RLS 정책 정의(0002_rls.sql) 보다 먼저.
  await definePgliteAuthShim(pg);
  await applyMigrations(pg);

  // 마이그레이션이 새 테이블을 만든 뒤 다시 한 번 권한을 부여 — 위 GRANT 는 기존 테이블만 잡는다.
  await pg.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated`);
  await pg.exec(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated`);

  const db = drizzle({ client: pg, schema });

  return {
    db,
    pg: makeResetRoleProxy(pg),
    cleanup: async () => {
      await pg.close();
    },
  };
}

/**
 * 본인 user 로 행세하는 RLS 컨텍스트 주입.
 *
 * Supabase 와 같은 방식: GUC `request.jwt.claims` 에 `{"sub": "<userId>"}` 를 심고,
 * `SET ROLE authenticated` 로 RLS 가 적용되는 role 로 전환.
 *
 * pglite 는 단일 연결이므로 다음 drizzle 쿼리에 그대로 이어진다. 다음 테스트의
 * 시드/cleanup pg.query 는 proxy 가 RESET ROLE 해 postgres 로 돌려준다.
 */
export function setAuthContext(testDb: TestDb, userId: string): void {
  const claims = JSON.stringify({ sub: userId });
  const escaped = claims.replace(/'/g, "''");
  // 동기 인터페이스로 노출 — pglite query 큐가 FIFO 라 다음 await 호출이 이 exec 들 뒤에 직렬화된다.
  void testDb.pg.exec(`SET request.jwt.claims = '${escaped}'`);
  void testDb.pg.exec(`SET ROLE authenticated`);
}
