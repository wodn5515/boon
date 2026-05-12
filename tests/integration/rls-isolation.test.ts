import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * RLS 단독 회귀 (시나리오 18·19·20).
 *
 * 배경 (사용자 PR #3 🟡 #2 + sfx 🟢 #13):
 *   - friends-crud 슬라이스에서 application-layer WHERE 절 + RLS 정책의 "이중 방어" 패턴을 채택.
 *   - 기존 통합 테스트(시나리오 13) 는 양쪽이 동시에 동작하는 조합을 검증해
 *     "어느 한쪽만으로도 막히는가?" 가 시야 밖에 있다.
 *   - 본 spec 은 application WHERE 를 의도적으로 우회한 raw UPDATE 를 RLS 가 단독으로
 *     막아내는지 검증한다. RLS 정책 회귀(예: 향후 0006 마이그레이션이 USING 절을 잘못 수정)
 *     를 즉시 빨갛게 잡기 위한 회귀선.
 *
 * 패턴:
 *   1) pglite `setAuthContext(testDb, USER_A)` 로 `SET ROLE authenticated` + GUC `sub` 주입.
 *   2) drizzle 가 아닌 raw `testDb.db.execute(sql\`UPDATE ... \`)` 로 application WHERE 우회.
 *      → user_id 조건 없이 id 만 명시. USER_A 인 상태에서 USER_B 의 row id 를 target.
 *   3) UPDATE 후 RLS 가 막아 영향을 못 받은 row 의 원본 값이 그대로인지 확인.
 *
 * 검증 대상 테이블: friends / categories / users.
 *
 * 헬퍼는 worker 가 db-test-helpers.ts 에 다음 시그니처로 구현한다고 가정 (Lead 결정):
 *   - `setAuthContext(testDb, userId)` (async)
 *   - `resetAuthContext(testDb)` (async)
 *   - `asServiceRole(testDb, fn)` — 시드/cleanup 용 RLS 우회
 *
 * worker 영역: `db/migrations/0005_categories_rls.sql` (categories RLS 정책 정의).
 * users RLS 는 0002 에서 이미 정의되어 있어 본 spec 은 회귀 잠금만 한다.
 */

import { sql } from "drizzle-orm";

import {
  asServiceRole,
  createTestDb,
  resetAuthContext,
  setAuthContext,
  type TestDb,
} from "./db-test-helpers";

const USER_A = "00000000-0000-0000-0000-0000000000aa";
const USER_B = "00000000-0000-0000-0000-0000000000bb";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
  // 두 user 시드.
  await testDb.pg.query(
    `INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)`,
    [USER_A, "a@boon.test", USER_B, "b@boon.test"],
  );
});

afterEach(async () => {
  // 다음 케이스로 GUC/Role 누수 방지.
  await resetAuthContext(testDb);
  // cleanup — friends / categories 모두 비운다 (users 는 유지).
  await testDb.pg.query("DELETE FROM friends");
  await testDb.pg.query("DELETE FROM categories");
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("RLS 단독 회귀 (application-layer WHERE 우회)", () => {
  it("[시나리오 18] friends — raw UPDATE 가 다른 user 의 row 를 건드릴 수 없다", async () => {
    // USER_B 의 친구 row 시드 (service role 로 우회).
    let targetId = "";
    await asServiceRole(testDb, async () => {
      const { rows } = await testDb.pg.query<{ id: string }>(
        `INSERT INTO friends (user_id, name) VALUES ($1, 'B 친구 원본') RETURNING id`,
        [USER_B],
      );
      targetId = rows[0]!.id;
    });
    expect(targetId).not.toBe("");

    // USER_A 로 행세 — RLS authenticated role.
    await setAuthContext(testDb, USER_A);

    // application WHERE 우회: user_id 조건 없이 id 만 target.
    // RLS 가 막아 0 row affected.
    await testDb.db
      .execute(
        sql`UPDATE friends SET name = ${"hacked"} WHERE id = ${targetId}`,
      )
      .catch(() => {
        /* RLS 가 UPDATE 0 rows 로 끝나면 throw 가 없어야 하지만,
         * 환경에 따라 SET ROLE 실패가 throw 로 나올 수 있어 흡수.
         * 본질은 row 상태가 안 바뀌는 것.
         */
      });

    // service role 로 검증 — row 가 원본 그대로인지.
    let actual: string | undefined;
    await asServiceRole(testDb, async () => {
      const { rows } = await testDb.pg.query<{ name: string }>(
        `SELECT name FROM friends WHERE id = $1`,
        [targetId],
      );
      actual = rows[0]?.name;
    });
    expect(actual).toBe("B 친구 원본");
  });

  it("[시나리오 19] categories — raw UPDATE 가 다른 user 의 row 를 건드릴 수 없다", async () => {
    // USER_B 의 카테고리 row 시드.
    let targetId = "";
    await asServiceRole(testDb, async () => {
      const { rows } = await testDb.pg.query<{ id: string }>(
        `INSERT INTO categories (user_id, name, color, is_system, sort_order)
         VALUES ($1, 'B 카테고리 원본', '#22c55e', false, 5) RETURNING id`,
        [USER_B],
      );
      targetId = rows[0]!.id;
    });
    expect(targetId).not.toBe("");

    // USER_A 로 행세.
    await setAuthContext(testDb, USER_A);

    await testDb.db
      .execute(
        sql`UPDATE categories SET name = ${"hacked"}, color = ${"#000000"} WHERE id = ${targetId}`,
      )
      .catch(() => {
        /* RLS 차단 — DB 상태로 본질 검증 */
      });

    let actual: { name: string; color: string } | undefined;
    await asServiceRole(testDb, async () => {
      const { rows } = await testDb.pg.query<{ name: string; color: string }>(
        `SELECT name, color FROM categories WHERE id = $1`,
        [targetId],
      );
      actual = rows[0];
    });
    expect(actual?.name).toBe("B 카테고리 원본");
    expect(actual?.color).toBe("#22c55e");
  });

  it("[시나리오 20] users — raw UPDATE 가 다른 user 의 행을 건드릴 수 없다", async () => {
    // USER_A 로 행세 — 본인은 USER_B 의 users 행을 직접 못 건드려야 한다.
    await setAuthContext(testDb, USER_A);

    await testDb.db
      .execute(
        sql`UPDATE users SET email = ${"hacked@boon.test"} WHERE id = ${USER_B}`,
      )
      .catch(() => {
        /* RLS 차단 — DB 상태로 본질 검증 */
      });

    let actual: string | undefined;
    await asServiceRole(testDb, async () => {
      const { rows } = await testDb.pg.query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1`,
        [USER_B],
      );
      actual = rows[0]?.email;
    });
    expect(actual).toBe("b@boon.test");
  });
});
