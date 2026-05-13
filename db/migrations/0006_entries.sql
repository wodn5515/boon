CREATE TYPE "public"."repayment_timing" AS ENUM('anytime', 'friend_birthday', 'specific_event', 'specific_date');--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"memo" text NOT NULL,
	"received_date" date NOT NULL,
	"repayment_timing" "repayment_timing" NOT NULL,
	"repayment_specific_date" date,
	"is_repaid" boolean DEFAULT false NOT NULL,
	"repaid_method" text,
	"repaid_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_friend_id_friends_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."friends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;