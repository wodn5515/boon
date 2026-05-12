import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/auth/callback` route handler 통합 테스트 (시나리오 5).
 *
 * 검증 시나리오:
 *   A. code 파라미터 부재 시 → 302 redirect to `/login?error=missing_code`
 *   B. 정상 code → Supabase exchangeCodeForSession 호출 + users upsert + 302 to `/`
 *
 * Mock 전략:
 *   - `@/lib/supabase/server` 의 createClient (Supabase Auth helpers의 SSR 클라이언트) mock
 *   - `@/db/client` 의 db.insert / drizzle upsert chain mock
 *   - 실제 DB / Supabase 호출은 없음 — Lead 결정: "Supabase 로컬 인스턴스 사용하지 마라"
 *
 * worker 구현 가정:
 *   - `app/auth/callback/route.ts` 에서 GET handler export
 *   - Supabase 세션 교환 후 user 정보를 `users` 테이블에 upsert (id 충돌 시 무시)
 *   - 모든 경로에서 NextResponse.redirect 반환
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

// drizzle db mock — onConflictDoNothing 체인까지 호출 추적
const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const insertValues = vi.fn(() => ({ onConflictDoNothing }));
const dbInsert = vi.fn(() => ({ values: insertValues }));

vi.mock("@/db/client", () => ({
  db: {
    insert: dbInsert,
  },
}));

// users 스키마 import 가 통과하도록 schema mock (실제 drizzle 객체는 spec 검증 대상 아님).
vi.mock("@/db/schema/users", () => ({
  users: { __mock: "users" },
}));

import { GET } from "@/app/auth/callback/route";

function makeRequest(url: string) {
  return new Request(url);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[시나리오 5-A] code 파라미터가 없으면 /login?error=missing_code 로 redirect 한다", async () => {
    const res = await GET(makeRequest("http://localhost:3000/auth/callback"));

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("error=missing_code");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("[시나리오 5-B] 정상 code 면 세션 교환 + users upsert + / 로 redirect 한다", async () => {
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

    const res = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=abc123"),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(dbInsert).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
    const inserted = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(inserted.email).toBe("tester@boon.test");
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(new URL(location).pathname).toBe("/");
  });
});
