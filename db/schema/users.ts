import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * users 테이블 — Supabase Auth 와 1:1.
 *
 * PRD §4 정의 그대로 4개 필드를 가진다:
 *   - id          UUID PK     — Supabase Auth user id 와 동일 값 사용
 *   - email       text NOT NULL UNIQUE
 *   - google_id   text UNIQUE (partial, NOT NULL 일 때만)
 *   - created_at  timestamp NOT NULL DEFAULT now()
 *
 * 결정 로그 004 §J-5: `email` UNIQUE 제약 + `google_id` partial unique index 추가
 * (003 §J deferred 항목 청산). Supabase 콘솔 user 삭제 후 재가입 시 같은 email/google_id
 * 행이 중복 생성되는 엣지 케이스 차단.
 *
 * 결정 로그 003 §B:
 *   - Application-layer upsert (callback handler 에서 onConflictDoNothing).
 *   - RLS 는 friends-crud 슬라이스(004)에서 본격 정의.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull().unique("users_email_unique"),
    google_id: text("google_id"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // partial unique: NULL 인 google_id 행은 unique 검사에서 제외 (이메일만으로 가입한 케이스 호환).
    uniqueIndex("users_google_id_unique")
      .on(table.google_id)
      .where(sql`${table.google_id} IS NOT NULL`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
