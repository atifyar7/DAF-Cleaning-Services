import { z } from "zod";

/** Accepts 050 123 4567, +971 50 123 4567 or 00971501234567 and returns +971501234567. */
export function normalizeUaeMobile(value: string) {
  const digits = value.replace(/[\s()-]/g, "");
  const match = /^(?:\+971|00971|971|0)?(5[0-9]{8})$/.exec(digits);
  return match ? `+971${match[1]}` : null;
}

/** A rough box around the emirate of Dubai, so a pin dropped elsewhere is caught. */
export const DUBAI_BOUNDS = { south: 24.6, north: 25.45, west: 54.85, east: 55.65 };

export function isInDubai(latitude: number, longitude: number) {
  return (
    latitude >= DUBAI_BOUNDS.south &&
    latitude <= DUBAI_BOUNDS.north &&
    longitude >= DUBAI_BOUNDS.west &&
    longitude <= DUBAI_BOUNDS.east
  );
}

const text = (max: number) => z.string().trim().min(1).max(max);

export const serviceStep = z.object({
  service: z.string().min(1).max(60),
  frequency: z.enum(["one_time", "daily", "weekly", "monthly"]),
  cleaners: z.number().int().min(1).max(50),
  hours: z.number().int().min(1).max(24),
  addOns: z.array(z.string().min(1).max(60)).max(5),
  jobDetails: z.string().trim().max(2000),
});

export const scheduleStep = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export const detailsStep = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().max(30).refine((value) => normalizeUaeMobile(value) !== null),
    email: z.email().max(200),
    whatsapp: z.boolean(),
    building: text(120),
    unit: text(60),
    area: text(120),
    notes: z.string().trim().max(1000),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  })
  .refine((d) => (d.latitude === null) === (d.longitude === null), { path: ["latitude"] })
  .refine((d) => d.latitude === null || isInDubai(d.latitude, d.longitude!), { path: ["latitude"] });

export const bookingInput = z.object({
  ...serviceStep.shape,
  ...scheduleStep.shape,
  details: detailsStep,
  terms: z.literal(true),
  locale: z.enum(["en", "ar"]),
  website: z.string().max(200).optional(),
});

export type BookingInput = z.input<typeof bookingInput>;
