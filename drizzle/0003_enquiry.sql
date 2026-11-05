CREATE TYPE "public"."enquiry_kind" AS ENUM('contact', 'monthly_contract');--> statement-breakpoint
CREATE TABLE "enquiry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "enquiry_kind" NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"service" text,
	"area" text,
	"message" text NOT NULL,
	"details" jsonb,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "enquiry_created_idx" ON "enquiry" USING btree ("created_at");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON enquiry TO daf_app;--> statement-breakpoint
ALTER TABLE enquiry ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE enquiry FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY enquiry_insert ON enquiry FOR INSERT WITH CHECK (true);--> statement-breakpoint
CREATE POLICY enquiry_staff ON enquiry FOR ALL USING (app_is_staff()) WITH CHECK (app_is_staff());
