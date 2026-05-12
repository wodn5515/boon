-- 0003_users_unique.sql
-- 결정 로그 004 §J-5 (003 §J deferred 항목 청산).
--
-- - users.email UNIQUE: Supabase 콘솔 user 삭제 후 재가입 시 같은 email 중복 row 차단.
-- - users.google_id: partial unique index. NULL 허용이라 일반 unique 제약은 사용 못 함.

ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_id_unique"
	ON "users" USING btree ("google_id")
	WHERE "google_id" IS NOT NULL;
