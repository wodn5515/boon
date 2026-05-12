import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * categories 테이블 — 사용자별 신세 카테고리.
 *
 * PRD §4 카테고리 데이터 모델 그대로:
 *   - id           UUID PK            gen_random_uuid() 기본값
 *   - user_id      UUID NOT NULL      FK → users.id (ON DELETE CASCADE)
 *   - name         text NOT NULL
 *   - icon         text (nullable)   이모지 1자 또는 NULL (없으면 색상 칩 fallback)
 *   - color        text NOT NULL    hex(#RRGGBB) — CATEGORY_COLOR_POOL 8개 중 하나
 *   - is_system    boolean NOT NULL  기본 false. 가입 시 자동 시드 3개만 true (D-018)
 *   - sort_order   int NOT NULL     정렬 가중치 (시스템 1·2·3, 사용자는 MAX+1)
 *   - created_at   timestamptz NOT NULL DEFAULT now()
 *   - updated_at   timestamptz NOT NULL DEFAULT now()
 *
 * 결정 로그 005 §A:
 *   - JS 프로퍼티명도 PRD 정의 그대로 snake_case 유지 (테스트 spec 의도와 정합).
 *   - RLS 정책은 `db/migrations/0005_categories_rls.sql` 에서 별도로 설정.
 *   - 사용자별 격리는 application-layer `eq(user_id, currentUser.id)` 가 본 방어선이고,
 *     RLS 는 두 번째 방어선 (정정-1, 004 §"sfx 라운드 1 🔴 #1" 패턴 그대로).
 */
export const categories = pgTable("categories", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color").notNull(),
  is_system: boolean("is_system").notNull().default(false),
  sort_order: integer("sort_order").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
