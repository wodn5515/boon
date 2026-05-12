import { describe, expect, it } from "vitest";

/**
 * `friends` drizzle 스키마 단위 테스트 (시나리오 9).
 *
 * PRD §4 정의:
 *   | field          | type                | constraint                |
 *   | id             | UUID PK             | gen_random_uuid()         |
 *   | user_id        | UUID NOT NULL       | FK → users.id (CASCADE)   |
 *   | name           | text NOT NULL       |                           |
 *   | birthday_month | int                 | 1..12                     |
 *   | birthday_day   | int                 | 1..31                     |
 *   | note           | text                |                           |
 *   | is_deleted     | boolean NOT NULL    | default false (soft del)  |
 *   | created_at     | timestamptz NOT NULL| default now()             |
 *   | updated_at     | timestamptz NOT NULL| default now()             |
 *
 * 검증 포인트:
 *   - 모든 컬럼이 drizzle Column 객체로 정의되어 있다
 *   - 컬럼명이 snake_case 다 (PRD: "DB 컬럼은 snake_case")
 *   - NOT NULL 제약이 PRD 의도와 일치 (id, user_id, name, is_deleted, created_at, updated_at)
 *   - id 가 PK 다
 *   - is_deleted 의 dataType 가 boolean 이다 (soft delete 컬럼)
 *
 * worker 구현 가정: `db/schema/friends.ts` 에서 `pgTable("friends", { ... })` 정의 후
 * named export `friends`. barrel export 도 `db/schema/index.ts` 에 추가.
 */

import { friends } from "@/db/schema/friends";

type DrizzleColumnLike = {
  name: string;
  notNull?: boolean;
  primary?: boolean;
  columnType?: string;
  dataType?: string;
};

function col(name: keyof typeof friends): DrizzleColumnLike {
  return friends[name] as unknown as DrizzleColumnLike;
}

describe("friends drizzle 스키마", () => {
  it("PRD §4 친구 테이블의 모든 필드가 정의되어 있다", () => {
    expect(friends.id).toBeDefined();
    expect(friends.user_id).toBeDefined();
    expect(friends.name).toBeDefined();
    expect(friends.birthday_month).toBeDefined();
    expect(friends.birthday_day).toBeDefined();
    expect(friends.note).toBeDefined();
    expect(friends.is_deleted).toBeDefined();
    expect(friends.created_at).toBeDefined();
    expect(friends.updated_at).toBeDefined();
  });

  it("컬럼명이 snake_case 다", () => {
    expect(col("id").name).toBe("id");
    expect(col("user_id").name).toBe("user_id");
    expect(col("name").name).toBe("name");
    expect(col("birthday_month").name).toBe("birthday_month");
    expect(col("birthday_day").name).toBe("birthday_day");
    expect(col("note").name).toBe("note");
    expect(col("is_deleted").name).toBe("is_deleted");
    expect(col("created_at").name).toBe("created_at");
    expect(col("updated_at").name).toBe("updated_at");
  });

  it("id 는 UUID PK / NOT NULL", () => {
    const c = col("id");
    expect(c.primary).toBe(true);
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("uuid");
  });

  it("user_id 는 UUID / NOT NULL (FK → users.id)", () => {
    const c = col("user_id");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("uuid");
  });

  it("name 은 text / NOT NULL", () => {
    const c = col("name");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("text");
  });

  it("birthday_month / birthday_day 는 nullable int", () => {
    expect(col("birthday_month").notNull).not.toBe(true);
    expect(col("birthday_day").notNull).not.toBe(true);
    expect(
      String(col("birthday_month").columnType ?? "").toLowerCase(),
    ).toContain("int");
    expect(
      String(col("birthday_day").columnType ?? "").toLowerCase(),
    ).toContain("int");
  });

  it("note 는 nullable text", () => {
    const c = col("note");
    expect(c.notNull).not.toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("text");
  });

  it("is_deleted 는 boolean / NOT NULL (soft delete 컬럼)", () => {
    const c = col("is_deleted");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("bool");
  });

  it("created_at / updated_at 은 timestamp / NOT NULL", () => {
    const created = col("created_at");
    const updated = col("updated_at");
    expect(created.notNull).toBe(true);
    expect(updated.notNull).toBe(true);
    expect(
      String(created.columnType ?? "").toLowerCase(),
    ).toContain("timestamp");
    expect(
      String(updated.columnType ?? "").toLowerCase(),
    ).toContain("timestamp");
  });
});
