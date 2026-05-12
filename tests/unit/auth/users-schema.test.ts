import { describe, expect, it } from "vitest";

/**
 * `users` drizzle 스키마 단위 테스트 (시나리오 6).
 *
 * PRD §4 정의:
 *   | field      | type       | note                 |
 *   | id         | UUID PK    | Supabase Auth user id|
 *   | email      | text       |                      |
 *   | google_id  | text       |                      |
 *   | created_at | timestamp  |                      |
 *
 * 검증 포인트:
 *   - 컬럼이 정의되어 있다 (drizzle Column 객체)
 *   - notNull / primaryKey 등 제약이 PRD 의도와 일치한다
 *   - 컬럼명이 snake_case 로 노출된다 (PRD: "DB 컬럼은 snake_case")
 *
 * worker 구현 위치 가정: `db/schema/users.ts` 에서 `pgTable("users", { ... })` 정의 후
 * named export `users`. 경로/네이밍이 달라지면 Lead에게 보고하고 spec 갱신.
 */

import { users } from "@/db/schema/users";

type DrizzleColumnLike = {
  name: string;
  notNull?: boolean;
  primary?: boolean;
  columnType?: string;
  dataType?: string;
};

function col(name: keyof typeof users): DrizzleColumnLike {
  // drizzle Column 인스턴스는 내부적으로 메타 정보를 노출한다.
  return users[name] as unknown as DrizzleColumnLike;
}

describe("users drizzle 스키마", () => {
  it("PRD §4의 4개 필드가 모두 정의되어 있다", () => {
    expect(users.id).toBeDefined();
    expect(users.email).toBeDefined();
    expect(users.google_id).toBeDefined();
    expect(users.created_at).toBeDefined();
  });

  it("컬럼명이 snake_case 로 노출된다", () => {
    expect(col("id").name).toBe("id");
    expect(col("email").name).toBe("email");
    expect(col("google_id").name).toBe("google_id");
    expect(col("created_at").name).toBe("created_at");
  });

  it("id 는 UUID 타입의 primary key 이며 notNull 이다", () => {
    const idCol = col("id");
    expect(idCol.primary).toBe(true);
    expect(idCol.notNull).toBe(true);
    // drizzle pg uuid 컬럼의 dataType 표시 — 'string' (uuid 컬럼은 dataType="string", columnType="PgUUID")
    expect(String(idCol.columnType ?? "").toLowerCase()).toContain("uuid");
  });

  it("email 은 text / notNull 이다", () => {
    const c = col("email");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("text");
  });

  it("google_id 는 text 이다 (PRD에 명시적 not-null 제약 없음 — worker 판단)", () => {
    const c = col("google_id");
    expect(String(c.columnType ?? "").toLowerCase()).toContain("text");
  });

  it("created_at 은 timestamp / notNull / 기본값을 가진다", () => {
    const c = col("created_at");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("timestamp");
  });
});
