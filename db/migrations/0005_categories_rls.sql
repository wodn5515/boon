-- 0005_categories_rls.sql
-- 결정 로그 005 §A·§I — categories RLS 정책 정의.
--
-- 사용자별 격리:
--   - categories: 본인 user_id 행만 (auth.uid()).
--
-- 정정-1 (004 §"sfx 라운드 1 🔴 #1") 패턴 그대로:
--   - application-layer `eq(categories.user_id, currentUser.id)` 가 본 방어선.
--   - RLS 는 두 번째 방어선 (엣지 흐름 / PostgREST 우발 경로 보호).
--   - drizzle 의 postgres-js 직결은 SUPERUSER 권한이라 RLS 가 자동 우회되므로
--     application-layer 필터가 반드시 명시되어야 한다 (queries.ts / actions.ts).
--
-- pglite 통합 테스트 호환 (004 §"sfx 라운드 1 🟢 #13" + 005 §I-3):
--   - `tests/integration/db-test-helpers.ts` 가 auth.uid() shim 을 0002_rls.sql 적용 전에 둔 그대로 사용.
--   - 본 마이그레이션 적용 시점에 authenticated role 이 이미 존재해 GRANT 가 추가로 필요 없음.

-- categories: RLS enable + FORCE.
--   table owner 도 정책에 종속시킨다 — 통합 테스트가 owner role 로 쿼리해도 user_id 격리가 동작.
--   Supabase 의 authenticated/anon 토큰은 owner 가 아니라 어차피 정책을 통과해야 하므로 영향 없음.
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "categories_own" ON "categories"
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);
