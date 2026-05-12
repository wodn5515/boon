import { describe, expect, it } from "vitest";

/**
 * `categories` drizzle 스키마 단위 테스트 (시나리오 10).
 *
 * PRD §4 정의:
 *   | field        | type                  | constraint                |
 *   | id           | UUID PK               | gen_random_uuid()         |
 *   | user_id      | UUID NOT NULL         | FK → users.id (CASCADE)   |
 *   | name         | text NOT NULL         |                           |
 *   | icon         | text (nullable)       | 이모지 1자 또는 NULL       |
 *   | color        | text NOT NULL         | hex(#RRGGBB)              |
 *   | is_system    | boolean NOT NULL      | default false             |
 *   | sort_order   | integer NOT NULL      |                           |
 *   | created_at   | timestamptz NOT NULL  | default now()             |
 *   | updated_at   | timestamptz NOT NULL  | default now()             |
 *
 * 검증 포인트:
 *   - 모든 컬럼이 drizzle Column 객체로 정의되어 있다
 *   - 컬럼명이 snake_case 다 (PRD: "DB 컬럼은 snake_case")
 *   - NOT NULL 제약이 PRD 의도와 일치 (id, user_id, name, color, is_system, sort_order, created_at, updated_at)
 *   - id 가 PK 다
 *   - is_system 의 dataType 가 boolean
 *   - sort_order 가 integer
 *
 * worker 구현 가정: `db/schema/categories.ts` 에서 `pgTable("categories", { ... })` 정의 후
 * named export `categories`. barrel export 도 `db/schema/index.ts` 에 추가.
 */

import { categories } from "@/db/schema/categories";

type DrizzleColumnLike = {
  name: string;
  notNull?: boolean;
  primary?: boolean;
  columnType?: string;
  dataType?: string;
};

function col(name: keyof typeof categories): DrizzleColumnLike {
  return categories[name] as unknown as DrizzleColumnLike;
}

describe("categories drizzle 스키마", () => {
  it("PRD §4 카테고리 테이블의 모든 필드가 정의되어 있다", () => {
    expect(categories.id).toBeDefined();
    expect(categories.user_id).toBeDefined();
    expect(categories.name).toBeDefined();
    expect(categories.icon).toBeDefined();
    expect(categories.color).toBeDefined();
    expect(categories.is_system).toBeDefined();
    expect(categories.sort_order).toBeDefined();
    expect(categories.created_at).toBeDefined();
    expect(categories.updated_at).toBeDefined();
  });

  it("컬럼명이 snake_case 다", () => {
    expect(col("id").name).toBe("id");
    expect(col("user_id").name).toBe("user_id");
    expect(col("name").name).toBe("name");
    expect(col("icon").name).toBe("icon");
    expect(col("color").name).toBe("color");
    expect(col("is_system").name).toBe("is_system");
    expect(col("sort_order").name).toBe("sort_order");
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

  it("name / color 는 text / NOT NULL", () => {
    expect(col("name").notNull).toBe(true);
    expect(String(col("name").columnType ?? "").toLowerCase()).toContain(
      "text",
    );
    expect(col("color").notNull).toBe(true);
    expect(String(col("color").columnType ?? "").toLowerCase()).toContain(
      "text",
    );
  });

  it("icon 은 nullable text (없으면 색상 칩 fallback)", () => {
    const c = col("icon");
    expect(c.notNull).not.toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("text");
  });

  it("is_system 은 boolean / NOT NULL (기본 카테고리 보장 플래그)", () => {
    const c = col("is_system");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("bool");
  });

  it("sort_order 는 integer / NOT NULL", () => {
    const c = col("sort_order");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("int");
  });

  it("created_at / updated_at 은 timestamp / NOT NULL", () => {
    const created = col("created_at");
    const updated = col("updated_at");
    expect(created.notNull).toBe(true);
    expect(updated.notNull).toBe(true);
    expect(String(created.columnType ?? "").toLowerCase()).toContain(
      "timestamp",
    );
    expect(String(updated.columnType ?? "").toLowerCase()).toContain(
      "timestamp",
    );
  });
});
