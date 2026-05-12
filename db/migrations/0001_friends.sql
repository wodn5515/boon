-- 0001_friends.sql
-- PRD §4 friends 테이블. 결정 로그 004 §A.
-- soft delete (is_deleted) + user_id FK CASCADE.

CREATE TABLE "friends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"birthday_month" integer,
	"birthday_day" integer,
	"note" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE cascade ON UPDATE no action;
