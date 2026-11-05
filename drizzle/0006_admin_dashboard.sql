CREATE TABLE "booking_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_note" ADD CONSTRAINT "booking_note_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_note" ADD CONSTRAINT "booking_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_note_booking_idx" ON "booking_note" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_assignment_cleaner_idx" ON "booking_assignment" USING btree ("cleaner_id");--> statement-breakpoint
-- Internal notes: staff only, and kept as a record (no edits or removal by the app).
ALTER TABLE "booking_note" ADD CONSTRAINT "booking_note_body_length" CHECK (char_length("body") BETWEEN 1 AND 2000);--> statement-breakpoint
GRANT SELECT, INSERT ON booking_note TO daf_app;--> statement-breakpoint
ALTER TABLE booking_note ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE booking_note FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY booking_note_staff ON booking_note FOR ALL USING (app_is_staff()) WITH CHECK (app_is_staff());
