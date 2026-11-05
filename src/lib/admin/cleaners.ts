import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "@/db";
import { booking, bookingAssignment, cleaner } from "@/db/schema";
import { normalizeUaeMobile } from "../booking/input";
import { audit, staffLimited, type Staff } from "./shared";
import type { WorkflowResult } from "./workflow";

const LIVE = ["confirmed", "assigned", "in_progress"] as const;

/** Every cleaner with their upcoming jobs, active ones first. */
export async function listCleaners(staff: Staff, now = new Date()) {
  return withActor(staff, (tx) =>
    tx
      .select({
        id: cleaner.id,
        name: cleaner.name,
        phone: cleaner.phone,
        active: cleaner.active,
        createdAt: cleaner.createdAt,
        upcoming: sql<number>`(
          select count(*) from booking_assignment ba join booking b on b.id = ba.booking_id
          where ba.cleaner_id = cleaner.id and b.status in ('confirmed', 'assigned', 'in_progress') and b.end_at > ${now}
        )::int`,
        completed: sql<number>`(
          select count(*) from booking_assignment ba join booking b on b.id = ba.booking_id
          where ba.cleaner_id = cleaner.id and b.status = 'completed'
        )::int`,
      })
      .from(cleaner)
      .orderBy(sql`${cleaner.active} desc`, asc(cleaner.name)),
  );
}

const cleanerInput = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((value) => value === "" || normalizeUaeMobile(value) !== null),
});

export async function createCleaner(staff: Staff, input: unknown, ip: string | null): Promise<WorkflowResult> {
  const parsed = cleanerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };
  return withActor(staff, async (tx) => {
    const [created] = await tx
      .insert(cleaner)
      .values({ name: parsed.data.name, phone: parsed.data.phone ? normalizeUaeMobile(parsed.data.phone) : null })
      .returning({ id: cleaner.id });
    await audit(tx, staff, "cleaner.created", "cleaner", created.id, ip);
    return { ok: true } as const;
  });
}

const updateInput = cleanerInput.extend({ active: z.boolean() });

/** A cleaner with upcoming jobs cannot be deactivated until those jobs have someone else. */
export async function updateCleaner(staff: Staff, id: unknown, input: unknown, ip: string | null, now = new Date()): Promise<WorkflowResult> {
  const cleanerId = z.uuid().safeParse(id);
  const parsed = updateInput.safeParse(input);
  if (!cleanerId.success || !parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };

  return withActor(staff, async (tx) => {
    // Same lock as assigning, so a cleaner cannot be deactivated while being put on a job.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cleaner:${cleanerId.data}`}))`);
    const [current] = await tx.select().from(cleaner).where(eq(cleaner.id, cleanerId.data)).for("update");
    if (!current) return { ok: false, error: "not_found" } as const;

    if (current.active && !parsed.data.active) {
      const [busy] = await tx
        .select({ reference: booking.reference })
        .from(bookingAssignment)
        .innerJoin(booking, eq(bookingAssignment.bookingId, booking.id))
        .where(and(eq(bookingAssignment.cleanerId, current.id), inArray(booking.status, [...LIVE]), gt(booking.endAt, now)))
        .limit(1);
      if (busy) return { ok: false, error: "has_open_bookings" } as const;
    }

    const phone = parsed.data.phone ? normalizeUaeMobile(parsed.data.phone) : null;
    await tx.update(cleaner).set({ name: parsed.data.name, phone, active: parsed.data.active }).where(eq(cleaner.id, current.id));
    await audit(tx, staff, "cleaner.updated", "cleaner", current.id, ip, {
      active: current.active === parsed.data.active ? undefined : parsed.data.active,
    });
    return { ok: true } as const;
  });
}
