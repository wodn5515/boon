CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"google_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
