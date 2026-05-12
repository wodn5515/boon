-- 0004_categories.sql
-- PRD §4 categories 테이블. 결정 로그 005 §A.
-- user_id FK CASCADE + sort_order 정렬 가중치 + is_system 보호 플래그.
-- RLS 정책은 후속 0005_categories_rls.sql 에서 분리 적용.

CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE cascade ON UPDATE no action;
