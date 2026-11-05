import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withActor } from "@/db";
import {
  addOn,
  auditLog,
  booking,
  bookingAddOn,
  bookingEvent,
  customerAddress,
  notificationOutbox,
  service,
  serviceCategory,
  user,
} from "@/db/schema";
import { business } from "@/content";
import { consume, limits } from "../rate-limit";
import { isInDubai, normalizeUaeMobile } from "./input";
import { buildSlots, isDateBookable, isSlotAllowed, peakCleaners } from "./rules";
import { capacityBookings, getBookingSettings, getFreeChangeHours } from "./server";
import { dubaiInstant, parseTime } from "./time";

// Everything here acts for one signed-in customer. Reads and writes run as that customer, so the
// database's row-level security refuses anything that is not theirs even if a check here were missed.

type Tx = Parameters<Parameters<typeof withActor>[1]>[0];
const asCustomer = (userId: string) => ({ role: "customer" as const, userId });

export type ActionError = "not_found" | "not_allowed" | "too_late" | "slot" | "invalid" | "limited" | "failed";
export type ActionResult = { ok: true } | { ok: false; error: ActionError };

const OPEN_STATUSES = ["pending", "confirmed", "assigned"] as const;
const isOpen = (status: string) => (OPEN_STATUSES as readonly string[]).includes(status);

/** Free changes are allowed while the booking is open and the start is far enough away. */
export function canChange(status: string, startAt: Date, freeHours: number, now = new Date()) {
  return isOpen(status) && startAt.getTime() - now.getTime() >= freeHours * 3_600_000;
}

/** Switches the rest of this transaction to the system role, for the message queue and capacity checks. */
async function asSystem(tx: Tx) {
  await tx.execute(sql`select set_config('app.role', 'system', true)`);
}

async function queue(tx: Tx, bookingId: string, email: string, template: string, payload: Record<string, unknown>) {
  await tx.insert(notificationOutbox).values([
    { channel: "email", template, recipient: email, payload, bookingId },
    { channel: "email", template: `${template}.dispatch`, recipient: business.email, payload, bookingId },
  ]);
}

export async function listCustomerBookings(userId: string) {
  return withActor(asCustomer(userId), (tx) =>
    tx
      .select({
        reference: booking.reference,
        status: booking.status,
        startAt: booking.startAt,
        totalFils: booking.totalFils,
        quoteRequired: booking.quoteRequired,
        quoteStatus: booking.quoteStatus,
        endAt: booking.endAt,
        building: booking.building,
        area: booking.area,
        serviceSlug: service.slug,
        nameEn: service.nameEn,
        nameAr: service.nameAr,
      })
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .where(eq(booking.customerId, userId))
      .orderBy(desc(booking.startAt)),
  );
}

/** Upcoming bookings soonest first; everything finished, cancelled or past after them, newest first. */
export function splitBookings<T extends { status: string; startAt: Date }>(bookings: T[], now = new Date()) {
  const isUpcoming = (b: T) => b.status !== "cancelled" && b.status !== "completed" && b.startAt >= now;
  return {
    upcoming: bookings.filter(isUpcoming).reverse(),
    past: bookings.filter((b) => !isUpcoming(b)),
  };
}

export async function getCustomerBooking(userId: string, reference: string) {
  return withActor(asCustomer(userId), async (tx) => {
    const [row] = await tx
      .select({
        booking,
        serviceSlug: service.slug,
        nameEn: service.nameEn,
        nameAr: service.nameAr,
        category: serviceCategory.slug,
      })
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
      .where(and(eq(booking.reference, reference), eq(booking.customerId, userId)));
    if (!row) return null;
    const addOns = await tx
      .select({ slug: addOn.slug, nameEn: addOn.nameEn, nameAr: addOn.nameAr })
      .from(bookingAddOn)
      .innerJoin(addOn, eq(bookingAddOn.addOnId, addOn.id))
      .where(eq(bookingAddOn.bookingId, row.booking.id));
    const events = await tx
      .select({ toStatus: bookingEvent.toStatus, note: bookingEvent.note, createdAt: bookingEvent.createdAt })
      .from(bookingEvent)
      .where(eq(bookingEvent.bookingId, row.booking.id))
      .orderBy(asc(bookingEvent.createdAt));
    return { ...row, addOns, events };
  });
}

/** Locks the customer's own open booking for this transaction, or returns why it cannot be changed. */
async function lockOwnBooking(tx: Tx, userId: string, reference: string) {
  const [row] = await tx
    .select()
    .from(booking)
    .where(and(eq(booking.reference, reference), eq(booking.customerId, userId)))
    .for("update");
  return row ?? null;
}

async function limited(userId: string) {
  return !(await consume(limits.userAction, userId));
}

export async function cancelBooking(userId: string, reference: string, now = new Date()): Promise<ActionResult> {
  if (await limited(userId)) return { ok: false, error: "limited" };
  const freeHours = await getFreeChangeHours();
  return withActor(asCustomer(userId), async (tx) => {
    const row = await lockOwnBooking(tx, userId, reference);
    if (!row) return { ok: false, error: "not_found" } as const;
    if (!isOpen(row.status)) return { ok: false, error: "not_allowed" } as const;
    if (!canChange(row.status, row.startAt, freeHours, now)) return { ok: false, error: "too_late" } as const;

    await tx
      .update(booking)
      .set({ status: "cancelled", cancelReason: "Cancelled by customer" })
      .where(eq(booking.id, row.id));
    await tx.insert(bookingEvent).values({ bookingId: row.id, fromStatus: row.status, toStatus: "cancelled", actorId: userId, note: "Cancelled by customer" });
    await asSystem(tx);
    await queue(tx, row.id, row.contactEmail, "booking.cancelled", { reference });
    return { ok: true } as const;
  });
}

const slotInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

/** Start times the customer could move this booking to, ignoring the cleaners it already holds. */
export async function getRescheduleSlots(userId: string, reference: string, date: string, now = new Date()) {
  if (await limited(userId)) return { ok: false as const, error: "limited" as const };
  const settings = await getBookingSettings();
  return withActor(asCustomer(userId), async (tx) => {
    const [row] = await tx
      .select({ id: booking.id, cleaners: booking.cleanerCount, duration: booking.durationMinutes, quote: booking.quoteRequired })
      .from(booking)
      .where(and(eq(booking.reference, reference), eq(booking.customerId, userId)));
    if (!row) return { ok: false as const, error: "not_found" as const };
    if (!isDateBookable(date, now, settings)) return { ok: true as const, slots: [] };
    await asSystem(tx);
    const bookings = row.quote ? [] : await capacityBookings(tx, date, row.id);
    const slots = buildSlots({ date, duration: row.duration, cleaners: row.cleaners, usesCapacity: !row.quote, now, settings, bookings });
    return { ok: true as const, slots };
  });
}

/** Moves the booking to a new start time. It goes back to "pending" so the team confirms the new time. */
export async function rescheduleBooking(userId: string, reference: string, input: unknown, now = new Date()): Promise<ActionResult> {
  const parsed = slotInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await limited(userId)) return { ok: false, error: "limited" };
  const { date, time } = parsed.data;
  const [settings, freeHours] = await Promise.all([getBookingSettings(), getFreeChangeHours()]);

  return withActor(asCustomer(userId), async (tx) => {
    const row = await lockOwnBooking(tx, userId, reference);
    if (!row) return { ok: false, error: "not_found" } as const;
    if (!isOpen(row.status)) return { ok: false, error: "not_allowed" } as const;
    if (!canChange(row.status, row.startAt, freeHours, now)) return { ok: false, error: "too_late" } as const;

    const request = { date, time, duration: row.durationMinutes, cleaners: row.cleanerCount, usesCapacity: false, now, settings };
    if (!isSlotAllowed(request)) return { ok: false, error: "slot" } as const;
    const startAt = dubaiInstant(date, parseTime(time)!);
    const endAt = new Date(startAt.getTime() + row.durationMinutes * 60_000);
    if (startAt.getTime() === row.startAt.getTime()) return { ok: false, error: "invalid" } as const;

    // Same capacity rule as a new booking, checked one day at a time.
    await asSystem(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`booking-day:${date}`}))`);
    if (!row.quoteRequired) {
      const peak = peakCleaners(await capacityBookings(tx, date, row.id), startAt, endAt);
      if (peak + row.cleanerCount > settings.capacity) return { ok: false, error: "slot" } as const;
    }

    await tx.update(booking).set({ startAt, endAt, status: "pending" }).where(eq(booking.id, row.id));
    await tx.insert(bookingEvent).values({
      bookingId: row.id,
      fromStatus: row.status,
      toStatus: "pending",
      actorId: userId,
      note: `Rescheduled by customer from ${row.startAt.toISOString()}`,
    });
    await queue(tx, row.id, row.contactEmail, "booking.rescheduled", { reference, from: row.startAt.toISOString(), to: startAt.toISOString() });
    return { ok: true } as const;
  });
}

/** The customer's answer to a quote the team has sent. Declining cancels the request. */
export async function respondToQuote(userId: string, reference: string, accept: boolean): Promise<ActionResult> {
  if (await limited(userId)) return { ok: false, error: "limited" };
  return withActor(asCustomer(userId), async (tx) => {
    const row = await lockOwnBooking(tx, userId, reference);
    if (!row) return { ok: false, error: "not_found" } as const;
    if (row.quoteStatus !== "sent" || row.quoteFils === null || !isOpen(row.status)) return { ok: false, error: "not_allowed" } as const;

    if (accept) {
      await tx
        .update(booking)
        .set({ quoteStatus: "accepted", serviceFils: row.quoteFils, totalFils: row.quoteFils })
        .where(eq(booking.id, row.id));
      await tx.insert(bookingEvent).values({ bookingId: row.id, fromStatus: row.status, toStatus: row.status, actorId: userId, note: "Quote accepted" });
    } else {
      await tx
        .update(booking)
        .set({ quoteStatus: "declined", status: "cancelled", cancelReason: "Quote declined" })
        .where(eq(booking.id, row.id));
      await tx.insert(bookingEvent).values({ bookingId: row.id, fromStatus: row.status, toStatus: "cancelled", actorId: userId, note: "Quote declined" });
    }
    await asSystem(tx);
    await queue(tx, row.id, row.contactEmail, accept ? "quote.accepted" : "quote.declined", { reference });
    return { ok: true } as const;
  });
}

/* Saved addresses */

export const MAX_ADDRESSES = 10;

const addressInput = z
  .object({
    label: z.string().trim().max(40),
    building: z.string().trim().min(1).max(120),
    unit: z.string().trim().min(1).max(60),
    area: z.string().trim().min(1).max(120),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  })
  .refine((a) => (a.latitude === null) === (a.longitude === null))
  .refine((a) => a.latitude === null || isInDubai(a.latitude, a.longitude!));

export async function listAddresses(userId: string) {
  return withActor(asCustomer(userId), (tx) =>
    tx
      .select({
        id: customerAddress.id,
        label: customerAddress.label,
        building: customerAddress.building,
        unit: customerAddress.unit,
        area: customerAddress.area,
        latitude: customerAddress.latitude,
        longitude: customerAddress.longitude,
      })
      .from(customerAddress)
      .where(eq(customerAddress.userId, userId))
      .orderBy(asc(customerAddress.createdAt)),
  );
}

export async function addAddress(userId: string, input: unknown): Promise<ActionResult> {
  const parsed = addressInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await limited(userId)) return { ok: false, error: "limited" };
  return withActor(asCustomer(userId), async (tx) => {
    // Serialises a customer's own address changes so the limit cannot be raced past.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`addresses:${userId}`}))`);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(customerAddress)
      .where(eq(customerAddress.userId, userId));
    if (count >= MAX_ADDRESSES) return { ok: false, error: "not_allowed" } as const;
    await tx.insert(customerAddress).values({ ...parsed.data, userId });
    return { ok: true } as const;
  });
}

export async function removeAddress(userId: string, id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  if (await limited(userId)) return { ok: false, error: "limited" };
  return withActor(asCustomer(userId), async (tx) => {
    const removed = await tx
      .delete(customerAddress)
      .where(and(eq(customerAddress.id, id), eq(customerAddress.userId, userId)))
      .returning({ id: customerAddress.id });
    return removed.length ? ({ ok: true } as const) : ({ ok: false, error: "not_found" } as const);
  });
}

/* Profile and privacy */

const profileInput = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((value) => value === "" || normalizeUaeMobile(value) !== null),
  locale: z.enum(["en", "ar"]),
});

export async function getProfile(userId: string) {
  const [row] = await db
    .select({ name: user.name, email: user.email, phone: user.phone, locale: user.locale, deletionRequestedAt: user.deletionRequestedAt })
    .from(user)
    .where(eq(user.id, userId));
  return row ?? null;
}

export async function updateProfile(userId: string, input: unknown): Promise<ActionResult> {
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await limited(userId)) return { ok: false, error: "limited" };
  const { name, phone, locale } = parsed.data;
  await db
    .update(user)
    .set({ name, phone: phone ? normalizeUaeMobile(phone) : null, locale })
    .where(and(eq(user.id, userId), eq(user.role, "customer")));
  return { ok: true };
}

/** Records a deletion request for the team to complete. Asking twice keeps the first date. */
export async function requestDeletion(userId: string): Promise<ActionResult> {
  if (await limited(userId)) return { ok: false, error: "limited" };
  const updated = await db
    .update(user)
    .set({ deletionRequestedAt: new Date() })
    .where(and(eq(user.id, userId), eq(user.role, "customer"), sql`${user.deletionRequestedAt} is null`))
    .returning({ email: user.email });
  if (updated.length) {
    await db.insert(auditLog).values({ actorId: userId, actorRole: "customer", action: "account.deletion_requested", entity: "user", entityId: userId });
    await withActor({ role: "system" }, (tx) =>
      tx.insert(notificationOutbox).values({
        channel: "email",
        template: "account.deletion_requested.dispatch",
        recipient: business.email,
        payload: { userId },
      }),
    );
  }
  return { ok: true };
}
