import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "@/db";
import { setting } from "@/db/schema";
import { getBookingSettings, getFreeChangeHours } from "../booking/server";
import { formatTime, parseTime } from "../booking/time";
import { audit, staffLimited, type Staff } from "../admin/shared";

// The rules the booking engine follows. They are checked together, so the business can never save a
// combination that makes booking impossible (for example, opening hours shorter than the minimum job).

export type BusinessSettings = {
  capacity: number;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  minHours: number;
  maxHours: number;
  maxCleaners: number;
  leadMinutes: number;
  maxDaysAhead: number;
  freeCancellationHours: number;
};

const keys: Record<keyof BusinessSettings, string> = {
  capacity: "booking.slot_capacity",
  openTime: "booking.open_time",
  closeTime: "booking.close_time",
  slotMinutes: "booking.slot_minutes",
  minHours: "booking.min_hours",
  maxHours: "booking.max_hours",
  maxCleaners: "booking.max_cleaners",
  leadMinutes: "booking.lead_minutes",
  maxDaysAhead: "booking.max_days_ahead",
  freeCancellationHours: "booking.free_cancellation_hours",
};

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const [s, freeCancellationHours] = await Promise.all([getBookingSettings(), getFreeChangeHours()]);
  return {
    capacity: s.capacity,
    openTime: formatTime(s.openMinutes),
    closeTime: formatTime(s.closeMinutes),
    slotMinutes: s.slotMinutes,
    minHours: s.minHours,
    maxHours: s.maxHours,
    maxCleaners: s.maxCleaners,
    leadMinutes: s.leadMinutes,
    maxDaysAhead: s.maxDaysAhead,
    freeCancellationHours,
  };
}

const whole = (min: number, max: number) => z.number().int().min(min).max(max);
const time = z.string().refine((t) => parseTime(t) !== null);

export const settingsInput = z
  .object({
    capacity: whole(1, 500),
    openTime: time,
    closeTime: time,
    slotMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    minHours: whole(1, 12),
    maxHours: whole(1, 16),
    maxCleaners: whole(1, 50),
    leadMinutes: whole(0, 2880),
    maxDaysAhead: whole(7, 365),
    freeCancellationHours: whole(0, 168),
  })
  .superRefine((s, ctx) => {
    const open = parseTime(s.openTime) ?? 0;
    const close = parseTime(s.closeTime) ?? 0;
    const issue = (path: keyof BusinessSettings, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (close <= open) issue("closeTime", "close_after_open");
    if (open % s.slotMinutes !== 0) issue("openTime", "open_on_slot");
    if (s.minHours * 60 > close - open) issue("minHours", "min_fits_day");
    if (s.maxHours < s.minHours) issue("maxHours", "max_at_least_min");
    if (s.maxHours * 60 > close - open) issue("maxHours", "max_fits_day");
    if (s.maxCleaners > s.capacity) issue("maxCleaners", "cleaners_within_capacity");
  });

export type SettingsResult = { ok: true } | { ok: false; error: "invalid" | "limited"; fields?: { field: string; rule: string }[] };

export async function updateBusinessSettings(owner: Staff, input: unknown, ip: string | null): Promise<SettingsResult> {
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", fields: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? ""), rule: i.message })) };
  }
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  const before = await getBusinessSettings();
  const next = parsed.data;
  const changed = (Object.keys(keys) as (keyof BusinessSettings)[]).filter((k) => before[k] !== next[k]);
  if (changed.length === 0) return { ok: true };

  await withActor(owner, async (tx) => {
    for (const key of changed) {
      await tx
        .insert(setting)
        .values({ key: keys[key], value: next[key], updatedBy: owner.userId })
        .onConflictDoUpdate({ target: setting.key, set: { value: sql`excluded.value`, updatedBy: owner.userId, updatedAt: new Date() } });
    }
    await audit(tx, owner, "settings.updated", "setting", "booking", ip, Object.fromEntries(changed.map((k) => [k, { from: before[k], to: next[k] }])));
  });
  return { ok: true };
}
