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
 * friends 테이블 — 사용자별 친구 마스터.
 *
 * PRD §4 친구 데이터 모델 그대로:
 *   - id              UUID PK            gen_random_uuid() 기본값
 *   - user_id         UUID NOT NULL      FK → users.id (ON DELETE CASCADE)
 *   - name            text NOT NULL
 *   - birthday_month  int (nullable)     1..12 (앱 단 validation)
 *   - birthday_day    int (nullable)     1..31 (앱 단 validation)
 *   - note            text (nullable)
 *   - is_deleted      boolean NOT NULL   기본 false (soft delete — D-017)
 *   - created_at      timestamptz NOT NULL DEFAULT now()
 *   - updated_at      timestamptz NOT NULL DEFAULT now()
 *
 * 결정 로그 004 §A:
 *   - JS 프로퍼티명도 PRD 정의 그대로 snake_case 유지 (테스트 spec 의도와 정합).
 *   - RLS 정책은 `db/migrations/0002_rls.sql` 에서 별도로 설정.
 *   - 사용자별 격리는 RLS 가 본인 user_id 만 통과시키는 패턴 (auth.uid()).
 */
export const friends = pgTable("friends", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  birthday_month: integer("birthday_month"),
  birthday_day: integer("birthday_day"),
  note: text("note"),
  is_deleted: boolean("is_deleted").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Friend = typeof friends.$inferSelect;
export type NewFriend = typeof friends.$inferInsert;
