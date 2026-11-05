ALTER TABLE "add_on" DROP CONSTRAINT "add_on_price_non_negative";--> statement-breakpoint
ALTER TABLE "booking" DROP CONSTRAINT "booking_total_non_negative";--> statement-breakpoint
ALTER TABLE "add_on" ALTER COLUMN "price_fils" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ALTER COLUMN "service_fils" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ALTER COLUMN "total_fils" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_add_on" ALTER COLUMN "unit_price_fils" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "quote_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "job_details" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "add_on" ADD CONSTRAINT "add_on_price_non_negative" CHECK ("add_on"."price_fils" IS NULL OR "add_on"."price_fils" >= 0);--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_priced_or_quote" CHECK ("booking"."quote_required" OR "booking"."total_fils" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_total_non_negative" CHECK ("booking"."total_fils" IS NULL OR "booking"."total_fils" >= 0);--> statement-breakpoint
-- Data changes agreed on 2026-11-03: quotes for specialist services and add-ons, 50 cleaners, 2-hour minimum.
SELECT set_config('app.role', 'system', true);--> statement-breakpoint
UPDATE service SET pricing_model = 'quote', price_fils = NULL WHERE slug IN ('sofa-upholstery', 'mattress', 'carpet-rug', 'ac-maintenance');--> statement-breakpoint
UPDATE add_on SET price_fils = NULL;--> statement-breakpoint
INSERT INTO setting (key, value) VALUES
  ('booking.slot_capacity', '50'), ('booking.min_hours', '2'), ('booking.max_hours', '10'),
  ('booking.max_cleaners', '10'), ('booking.slot_minutes', '30'), ('booking.lead_minutes', '120'),
  ('booking.max_days_ahead', '60')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE setting.key = 'booking.slot_capacity';
