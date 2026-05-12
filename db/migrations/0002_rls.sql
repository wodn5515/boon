-- 0002_rls.sql
-- 결정 로그 004 §A·§I — RLS 본격 정의.
--
-- 사용자별 격리:
--   - users: 본인 행(SELECT/UPDATE)만. INSERT 는 callback handler 가 service role 로 우회.
--   - friends: 본인 user_id 행만 (auth.uid()).
--
-- pglite 통합 테스트는 `tests/integration/db-test-helpers.ts` 에서
-- auth.uid() 함수를 polyfill 한다 (Supabase 호환 GUC current_setting 패턴).

-- users: RLS enable. INSERT 는 callback handler 가 service role 로 우회 (Supabase 패턴).
--   FORCE 는 걸지 않는다 — Supabase 의 service_role 토큰이 owner 권한으로 우회하는 흐름과 정합.
--   pglite 통합 테스트의 seed insert 도 동일 경로로 통과.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "users_own" ON "users"
	FOR ALL
	USING (auth.uid() = id)
	WITH CHECK (auth.uid() = id);
--> statement-breakpoint
-- friends: RLS enable + FORCE.
--   table owner 도 정책에 종속시킨다 — 통합 테스트가 owner role 로 쿼리해도 user_id 격리가 동작.
--   Supabase 의 authenticated/anon 토큰은 owner 가 아니라 어차피 정책을 통과해야 하므로 영향 없음.
ALTER TABLE "friends" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "friends" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "friends_own" ON "friends"
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);
