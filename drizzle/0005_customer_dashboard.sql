CREATE TYPE "public"."quote_status" AS ENUM('none', 'sent', 'accepted', 'declined');--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "quote_fils" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "quote_status" "quote_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_quote_non_negative" CHECK ("booking"."quote_fils" IS NULL OR "booking"."quote_fils" >= 0);