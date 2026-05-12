import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { categories } from "./categories";
import { friends } from "./friends";
import { users } from "./users";

/**
 * entries 테이블 — 받은 신세(은혜) 본체. PRD §4 + 결정 로그 006 §A.
 *
 * 필드:
 *   - id                       UUID PK             gen_random_uuid()
 *   - user_id                  UUID NOT NULL       FK → users.id (ON DELETE CASCADE)
 *   - friend_id                UUID NOT NULL       FK → friends.id (ON DELETE CASCADE)
 *   - category_id              UUID NOT NULL       FK → categories.id (ON DELETE RESTRICT)
 *                                                  → 카테고리 삭제 시 강제 이전(migrateTo) 또는 거절 (006 §F)
 *   - memo                     text NOT NULL       빈 문자열 허용 (006 §D)
 *   - received_date            date NOT NULL
 *   - repayment_timing         enum NOT NULL       4종 (anytime/friend_birthday/specific_event/specific_date)
 *   - repayment_specific_date  date (nullable)     specific_date 일 때만 의미 (006 §E)
 *   - is_repaid                boolean NOT NULL    default false
 *   - repaid_method            text (nullable)
 *   - repaid_date              date (nullable)
 *   - created_at               timestamptz NOT NULL DEFAULT now()
 *   - updated_at               timestamptz NOT NULL DEFAULT now()
 *
 * 결정 로그 006 §A·§E:
 *   - `repayment_timing` 은 PostgreSQL enum (drizzle pgEnum) — 4종 외 값 입력 시 DB 단 차단.
 *   - JS 프로퍼티명도 PRD 정의 그대로 snake_case 유지 (테스트 spec 정합).
 *   - RLS 정책은 `db/migrations/0007_entries_rls.sql` 에서 별도 적용.
 *   - 사용자별 격리는 application-layer `eq(entries.user_id, currentUser.id)` 가 본 방어선,
 *     RLS 는 두 번째 방어선 (004 §"정정-1" 패턴).
 */

export const repaymentTimingEnum = pgEnum("repayment_timing", [
  "anytime",
  "friend_birthday",
  "specific_event",
  "specific_date",
]);

export const entries = pgTable("entries", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  friend_id: uuid("friend_id")
    .notNull()
    .references(() => friends.id, { onDelete: "cascade" }),
  category_id: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  memo: text("memo").notNull(),
  received_date: date("received_date").notNull(),
  repayment_timing: repaymentTimingEnum("repayment_timing").notNull(),
  repayment_specific_date: date("repayment_specific_date"),
  is_repaid: boolean("is_repaid").notNull().default(false),
  repaid_method: text("repaid_method"),
  repaid_date: date("repaid_date"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
