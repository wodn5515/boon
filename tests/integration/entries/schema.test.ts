import { describe, expect, it } from "vitest";

/**
 * `entries` drizzle 스키마 단위 테스트 (시나리오 10).
 *
 * PRD §4 정의:
 *   | field                    | type                  | constraint                       |
 *   | id                       | UUID PK               | gen_random_uuid()                |
 *   | user_id                  | UUID NOT NULL         | FK → users.id (CASCADE)          |
 *   | friend_id                | UUID NOT NULL         | FK → friends.id (CASCADE)        |
 *   | category_id              | UUID NOT NULL         | FK → categories.id (RESTRICT)    |
 *   | memo                     | text NOT NULL         |                                  |
 *   | received_date            | date NOT NULL         |                                  |
 *   | repayment_timing         | enum NOT NULL         | 4종 (anytime/friend_birthday/    |
 *   |                          |                       |   specific_event/specific_date)  |
 *   | repayment_specific_date  | date (nullable)       | specific_date 일 때만 채워짐      |
 *   | is_repaid                | boolean NOT NULL      | default false                    |
 *   | repaid_method            | text (nullable)       |                                  |
 *   | repaid_date              | date (nullable)       |                                  |
 *   | created_at               | timestamptz NOT NULL  | default now()                    |
 *   | updated_at               | timestamptz NOT NULL  | default now()                    |
 *
 * 검증 포인트:
 *   - 모든 컬럼이 drizzle Column 객체로 정의되어 있다.
 *   - 컬럼명이 snake_case (PRD 규정).
 *   - NOT NULL 제약이 PRD 와 일치.
 *   - id 가 PK.
 *   - repayment_timing 의 dataType 가 enum/string (Postgres enum 또는 text 기반).
 *
 * worker 구현 가정: `db/schema/entries.ts` 에서 `pgTable("entries", { ... })` 정의 후
 * named export `entries`. barrel export 도 `db/schema/index.ts` 에 추가.
 */

import { entries } from "@/db/schema/entries";

type DrizzleColumnLike = {
  name: string;
  notNull?: boolean;
  primary?: boolean;
  columnType?: string;
  dataType?: string;
};

function col(name: keyof typeof entries): DrizzleColumnLike {
  return entries[name] as unknown as DrizzleColumnLike;
}

describe("entries drizzle 스키마", () => {
  it("PRD §4 신세 테이블의 모든 필드가 정의되어 있다", () => {
    expect(entries.id).toBeDefined();
    expect(entries.user_id).toBeDefined();
    expect(entries.friend_id).toBeDefined();
    expect(entries.category_id).toBeDefined();
    expect(entries.memo).toBeDefined();
    expect(entries.received_date).toBeDefined();
    expect(entries.repayment_timing).toBeDefined();
    expect(entries.repayment_specific_date).toBeDefined();
    expect(entries.is_repaid).toBeDefined();
    expect(entries.repaid_method).toBeDefined();
    expect(entries.repaid_date).toBeDefined();
    expect(entries.created_at).toBeDefined();
    expect(entries.updated_at).toBeDefined();
  });

  it("컬럼명이 snake_case 다", () => {
    expect(col("id").name).toBe("id");
    expect(col("user_id").name).toBe("user_id");
    expect(col("friend_id").name).toBe("friend_id");
    expect(col("category_id").name).toBe("category_id");
    expect(col("memo").name).toBe("memo");
    expect(col("received_date").name).toBe("received_date");
    expect(col("repayment_timing").name).toBe("repayment_timing");
    expect(col("repayment_specific_date").name).toBe("repayment_specific_date");
    expect(col("is_repaid").name).toBe("is_repaid");
    expect(col("repaid_method").name).toBe("repaid_method");
    expect(col("repaid_date").name).toBe("repaid_date");
    expect(col("created_at").name).toBe("created_at");
    expect(col("updated_at").name).toBe("updated_at");
  });

  it("id 는 UUID PK / NOT NULL", () => {
    const c = col("id");
    expect(c.primary).toBe(true);
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("uuid");
  });

  it("user_id / friend_id / category_id 는 UUID NOT NULL", () => {
    for (const key of ["user_id", "friend_id", "category_id"] as const) {
      const c = col(key);
      expect(c.notNull, `${key} should be notNull`).toBe(true);
      expect(String(c.columnType ?? "").toLowerCase()).toContain("uuid");
    }
  });

  it("memo 는 text NOT NULL", () => {
    const c = col("memo");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("text");
  });

  it("received_date 는 date NOT NULL", () => {
    const c = col("received_date");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("date");
  });

  it("repayment_timing 은 NOT NULL enum/text (4종 — D-012)", () => {
    const c = col("repayment_timing");
    expect(c.notNull).toBe(true);
    // pgEnum 으로 구현했든 text 로 구현했든 둘 다 허용 (Lead 결정 영역).
    const t = String(c.columnType ?? "").toLowerCase();
    expect(t === "" ? false : /enum|text/.test(t)).toBe(true);
  });

  it("repayment_specific_date 는 nullable date (specific_date 분기 한정)", () => {
    const c = col("repayment_specific_date");
    expect(c.notNull).not.toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("date");
  });

  it("is_repaid 는 boolean NOT NULL", () => {
    const c = col("is_repaid");
    expect(c.notNull).toBe(true);
    expect(String(c.columnType ?? "").toLowerCase()).toContain("bool");
  });

  it("repaid_method 는 nullable text / repaid_date 는 nullable date", () => {
    expect(col("repaid_method").notNull).not.toBe(true);
    expect(String(col("repaid_method").columnType ?? "").toLowerCase()).toContain(
      "text",
    );
    expect(col("repaid_date").notNull).not.toBe(true);
    expect(String(col("repaid_date").columnType ?? "").toLowerCase()).toContain(
      "date",
    );
  });

  it("created_at / updated_at 은 timestamp NOT NULL", () => {
    for (const key of ["created_at", "updated_at"] as const) {
      const c = col(key);
      expect(c.notNull, `${key} should be notNull`).toBe(true);
      expect(String(c.columnType ?? "").toLowerCase()).toContain("timestamp");
    }
  });
});
