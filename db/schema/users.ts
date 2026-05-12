import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * users 테이블 — Supabase Auth 와 1:1.
 *
 * PRD §4 정의 그대로 4개 필드를 가진다:
 *   - id          UUID PK     — Supabase Auth user id 와 동일 값 사용
 *   - email       text NOT NULL
 *   - google_id   text        — Google OAuth sub claim (user_metadata.sub)
 *   - created_at  timestamp NOT NULL DEFAULT now()
 *
 * 결정 로그 003 §B:
 *   - Application-layer upsert (callback handler 에서 onConflictDoNothing).
 *   - RLS 는 friends-crud 슬라이스에서 본격 정의. 이번 슬라이스는 callback 전용.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  google_id: text("google_id"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
