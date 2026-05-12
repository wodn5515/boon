import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/auth/callback` route handler 통합 테스트 (시나리오 5).
 *
 * 검증 시나리오:
 *   A. code 파라미터 부재 시 → 302 redirect to `/login?error=missing_code`
 *   B. 정상 code (신규 user) → Supabase exchangeCodeForSession 호출 + users upsert (returning row > 0)
 *      + seedDefaultCategories 호출 + 302 to `/`
 *   C. 정상 code (재로그인, conflict) → users upsert 는 호출되지만 returning row 0
 *      → seedDefaultCategories 호출되지 않음 (멱등성, 005 §B)
 *
 * Mock 전략:
 *   - `@/lib/supabase/server` 의 createClient (Supabase Auth helpers SSR 클라이언트) mock.
 *   - `@/db/client` 의 db.transaction(callback) — callback 에 `tx` 객체를 넘겨 호출.
 *     tx 는 자체 `insert.values.onConflictDoNothing.returning` 체인을 가진다.
 *   - `@/lib/categories/seed` 의 `seedDefaultCategories` mock — inserted.length > 0 분기 검증용.
 *   - 실제 DB / Supabase 호출은 없음 — Lead 결정: "Supabase 로컬 인스턴스 사용하지 마라".
 *
 * worker 구현 (005 §B):
 *   - `app/auth/callback/route.ts` 가 `db.transaction(async tx => {...})` 안에서:
 *     1) `tx.insert(users).values(...).onConflictDoNothing({target: users.id}).returning({id: users.id})`
 *     2) `if (inserted.length > 0) await seedDefaultCategories(user.id, tx)`
 *   - 트랜잭션 atomic — categories seed 실패 시 users insert 도 롤백.
 */

// Supabase SSR client mock
const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession,
      getUser,
    },
  })),
}));

/**
 * drizzle 트랜잭션 mock — `db.transaction(async tx => ...)` 패턴 호환.
 *
 * tx 의 insert 체인은 자체 mock 으로 둔다:
 *   tx.insert(users).values({...}).onConflictDoNothing({target}).returning({id})
 *
 * 각 케이스가 returningResult 를 갈아끼워 inserted.length 분기를 제어한다 (5-B: 1행, 5-C: 0행).
 */
let returningResult: Array<{ id: string }> = [];
const txReturning = vi.fn(async () => returningResult);
const txOnConflictDoNothing = vi.fn(() => ({ returning: txReturning }));
const txInsertValues = vi.fn<(values: Record<string, unknown>) => unknown>(() => ({
  onConflictDoNothing: txOnConflictDoNothing,
}));
const txInsert = vi.fn(() => ({ values: txInsertValues }));

const tx = {
  insert: txInsert,
};

const dbTransaction = vi.fn(
  async (callback: (tx: typeof import("./callback-route.test")) => Promise<unknown>) => {
    // callback 에 tx 를 그대로 넘긴다. 실제 drizzle 와 동일하게 callback 의 반환값을 throw 없이 통과.
    return await (callback as unknown as (t: typeof tx) => Promise<unknown>)(tx);
  },
);

vi.mock("@/db/client", () => ({
  db: {
    transaction: dbTransaction,
  },
}));

// users 스키마 import 가 통과하도록 schema mock (실제 drizzle 객체는 spec 검증 대상 아님).
vi.mock("@/db/schema/users", () => ({
  users: { __mock: "users", id: { __col: "id" } },
}));

// seedDefaultCategories mock — inserted.length > 0 분기 검증.
const seedDefaultCategories = vi.fn(async () => {
  /* no-op */
});
vi.mock("@/lib/categories/seed", () => ({
  seedDefaultCategories,
}));

import { GET } from "@/app/auth/callback/route";

function makeRequest(url: string) {
  return new Request(url);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본값: 신규 user (returning row 1개). 5-C 케이스가 [] 로 덮어쓴다.
    returningResult = [{ id: "00000000-0000-0000-0000-000000000001" }];
  });

  it("[시나리오 5-A] code 파라미터가 없으면 /login?error=missing_code 로 redirect 한다", async () => {
    const res = await GET(makeRequest("http://localhost:3000/auth/callback"));

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("error=missing_code");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(dbTransaction).not.toHaveBeenCalled();
    expect(seedDefaultCategories).not.toHaveBeenCalled();
  });

  it("[시나리오 5-B] 정상 code (신규 user) — 세션 교환 + users upsert + seedDefaultCategories + / 로 redirect", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "t", refresh_token: "r" },
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          email: "tester@boon.test",
          user_metadata: { sub: "google-uid-xyz" },
        },
      },
      error: null,
    });
    getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          email: "tester@boon.test",
          user_metadata: { sub: "google-uid-xyz" },
        },
      },
      error: null,
    });
    // 신규 user — returning 이 1행 반환.
    returningResult = [{ id: "00000000-0000-0000-0000-000000000001" }];

    const res = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=abc123"),
    );

    // 세션 교환 호출.
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");

    // transaction 으로 묶였는지.
    expect(dbTransaction).toHaveBeenCalledTimes(1);

    // users insert 가 트랜잭션 안에서.
    expect(txInsert).toHaveBeenCalledTimes(1);
    expect(txInsertValues).toHaveBeenCalledTimes(1);
    const inserted = txInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(inserted.email).toBe("tester@boon.test");
    expect(txOnConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(txReturning).toHaveBeenCalledTimes(1);

    // inserted.length > 0 → seedDefaultCategories 가 같은 tx 로 호출됨.
    expect(seedDefaultCategories).toHaveBeenCalledTimes(1);
    expect(seedDefaultCategories).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      tx,
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(new URL(location).pathname).toBe("/");
  });

  it("[시나리오 5-C] 정상 code (재로그인, conflict) — users upsert 는 호출되지만 seedDefaultCategories 는 호출되지 않음 (멱등성)", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "t", refresh_token: "r" },
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          email: "tester@boon.test",
          user_metadata: { sub: "google-uid-xyz" },
        },
      },
      error: null,
    });
    getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          email: "tester@boon.test",
          user_metadata: { sub: "google-uid-xyz" },
        },
      },
      error: null,
    });
    // 재로그인 — onConflictDoNothing 으로 returning 이 빈 배열.
    returningResult = [];

    const res = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=abc123"),
    );

    // transaction + insert 자체는 일어남.
    expect(dbTransaction).toHaveBeenCalledTimes(1);
    expect(txInsert).toHaveBeenCalledTimes(1);
    expect(txReturning).toHaveBeenCalledTimes(1);

    // returning 이 빈 배열 → seedDefaultCategories skip.
    expect(seedDefaultCategories).not.toHaveBeenCalled();

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(new URL(location).pathname).toBe("/");
  });
});
