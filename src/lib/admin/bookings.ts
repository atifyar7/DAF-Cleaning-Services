import "server-only";
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "@/db";
import {
  addOn,
  booking,
  bookingAddOn,
  bookingAssignment,
  bookingEvent,
  bookingNote,
  cleaner,
  enquiry,
  service,
  user,
} from "@/db/schema";
import { buildSlots, isDateBookable, isSlotAllowed, peakCleaners } from "../booking/rules";
import { capacityBookings, getBookingSettings } from "../booking/server";
import { addDays, dubaiDate, dubaiInstant, parseTime } from "../booking/time";
import { audit, countAll, likePattern, notifyCustomer, PAGE_SIZE, pageOffset, staffLimited, type Staff, type Tx } from "./shared";
import {
  ACTIVE_STATUSES,
  canAssign,
  canQuote,
  isValidPayment,
  OPEN_STATUSES,
  parseAed,
  statusAfterAssignment,
  transition,
  type BookingStatus,
  type StatusAction,
  type WorkflowResult,
} from "./workflow";

export const bookingStatuses = ["pending", "confirmed", "assigned", "in_progress", "completed", "cancelled"] as const;

const assignedCount = sql<number>`(select count(*) from booking_assignment ba where ba.booking_id = booking.id)::int`;

/* Lists */

export type BookingFilters = { status?: string; q?: string; date?: string; page?: number };

const filterInput = z.object({
  status: z.enum(bookingStatuses).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

/** Search, filter and page through every booking. Unknown filter values are ignored, never trusted. */
export async function listBookings(staff: Staff, raw: BookingFilters) {
  const filters = filterInput.parse(raw);
  const conditions: (SQL | undefined)[] = [];
  if (filters.status) conditions.push(eq(booking.status, filters.status));
  if (filters.date) {
    conditions.push(gte(booking.startAt, dubaiInstant(filters.date, 0)), lt(booking.startAt, dubaiInstant(filters.date, 24 * 60)));
  }
  if (filters.q) {
    const pattern = likePattern(filters.q);
    conditions.push(
      or(
        ilike(booking.reference, pattern),
        ilike(booking.contactName, pattern),
        ilike(booking.contactEmail, pattern),
        ilike(booking.contactPhone, pattern),
        ilike(booking.area, pattern),
        ilike(booking.building, pattern),
      ),
    );
  }
  const where = and(...conditions);
  // Work still to do reads soonest first; finished work reads newest first.
  const finished = !filters.status || filters.status === "completed" || filters.status === "cancelled";

  return withActor(staff, async (tx) => {
    const rows = await tx
      .select({
        reference: booking.reference,
        status: booking.status,
        startAt: booking.startAt,
        endAt: booking.endAt,
        contactName: booking.contactName,
        contactPhone: booking.contactPhone,
        area: booking.area,
        cleanerCount: booking.cleanerCount,
        totalFils: booking.totalFils,
        quoteRequired: booking.quoteRequired,
        quoteStatus: booking.quoteStatus,
        paymentStatus: booking.paymentStatus,
        createdAt: booking.createdAt,
        nameEn: service.nameEn,
        nameAr: service.nameAr,
        assigned: assignedCount,
      })
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .where(where)
      .orderBy(finished ? desc(booking.startAt) : asc(booking.startAt))
      .limit(PAGE_SIZE)
      .offset(pageOffset(filters.page));
    const [{ total }] = await tx.select({ total: countAll }).from(booking).where(where);
    return { rows, total, page: filters.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), filters };
  });
}

export async function statusCounts(staff: Staff) {
  const rows = await withActor(staff, (tx) =>
    tx.select({ status: booking.status, count: countAll }).from(booking).groupBy(booking.status),
  );
  const counts = Object.fromEntries(bookingStatuses.map((s) => [s, 0])) as Record<BookingStatus, number>;
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

/** Badge numbers for the sidebar: work waiting for the team. */
export async function attentionCounts(staff: Staff) {
  return withActor(staff, async (tx) => {
    const [row] = await tx
      .select({
        review: sql<number>`count(*) filter (where ${booking.status} = 'pending' and (not ${booking.quoteRequired} or ${booking.quoteStatus} = 'accepted'))::int`,
        quotes: sql<number>`count(*) filter (where ${booking.status} = 'pending' and ${booking.quoteRequired} and ${booking.quoteStatus} = 'none')::int`,
        unassigned: sql<number>`count(*) filter (where ${booking.status} = 'confirmed')::int`,
      })
      .from(booking)
      .where(gt(booking.endAt, new Date()));
    const [enquiries] = await tx.select({ count: countAll }).from(enquiry).where(isNull(enquiry.handledAt));
    const [deletions] = await tx
      .select({ count: countAll })
      .from(user)
      .where(and(eq(user.role, "customer"), sql`${user.deletionRequestedAt} is not null`, isNull(user.disabledAt)));
    return { ...row, enquiries: enquiries.count, deletions: deletions.count };
  });
}

/* One booking */

export async function getAdminBooking(staff: Staff, reference: string) {
  return withActor(staff, async (tx) => {
    const [row] = await tx
      .select({ booking, serviceSlug: service.slug, nameEn: service.nameEn, nameAr: service.nameAr, pricingModel: service.pricingModel })
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .where(eq(booking.reference, reference));
    if (!row) return null;
    const id = row.booking.id;

    // One after another: a transaction has a single connection, which cannot run two queries at once.
    const addOns = await tx.select({ nameEn: addOn.nameEn, nameAr: addOn.nameAr }).from(bookingAddOn).innerJoin(addOn, eq(bookingAddOn.addOnId, addOn.id)).where(eq(bookingAddOn.bookingId, id));
    const events = await tx
      .select({ fromStatus: bookingEvent.fromStatus, toStatus: bookingEvent.toStatus, note: bookingEvent.note, createdAt: bookingEvent.createdAt, actorName: user.name, actorRole: user.role })
      .from(bookingEvent)
      .leftJoin(user, eq(bookingEvent.actorId, user.id))
      .where(eq(bookingEvent.bookingId, id))
      .orderBy(asc(bookingEvent.createdAt));
    const notes = await tx
      .select({ id: bookingNote.id, body: bookingNote.body, createdAt: bookingNote.createdAt, authorName: user.name })
      .from(bookingNote)
      .leftJoin(user, eq(bookingNote.authorId, user.id))
      .where(eq(bookingNote.bookingId, id))
      .orderBy(desc(bookingNote.createdAt));
    const team = await tx
      .select({ id: cleaner.id, name: cleaner.name, phone: cleaner.phone })
      .from(bookingAssignment)
      .innerJoin(cleaner, eq(bookingAssignment.cleanerId, cleaner.id))
      .where(eq(bookingAssignment.bookingId, id))
      .orderBy(asc(cleaner.name));
    const [customer] = row.booking.customerId
      ? await tx
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            bookings: sql<number>`(select count(*) from booking b where b.customer_id = "user".id)::int`,
          })
          .from(user)
          .where(eq(user.id, row.booking.customerId))
      : [null];
    return { ...row, addOns, events, notes, team, customer: customer ?? null };
  });
}

/** Active cleaners, each marked busy if they already work on another booking at the same time. */
export async function cleanersForBooking(staff: Staff, reference: string) {
  return withActor(staff, async (tx) => {
    const [item] = await tx.select({ id: booking.id, startAt: booking.startAt, endAt: booking.endAt }).from(booking).where(eq(booking.reference, reference));
    if (!item) return [];
    const everyone = await tx.select({ id: cleaner.id, name: cleaner.name, phone: cleaner.phone }).from(cleaner).where(eq(cleaner.active, true)).orderBy(asc(cleaner.name));
    const clashes = await clashingAssignments(tx, item.id, item, everyone.map((c) => c.id));
    return everyone.map((c) => ({ ...c, busyWith: clashes.get(c.id) ?? null }));
  });
}

/** For each cleaner, the reference of another live booking they are on that overlaps the given time. */
async function clashingAssignments(tx: Tx, bookingId: string, window: { startAt: Date; endAt: Date }, cleanerIds: string[]) {
  if (cleanerIds.length === 0) return new Map<string, string>();
  const rows = await tx
    .select({ cleanerId: bookingAssignment.cleanerId, reference: booking.reference })
    .from(bookingAssignment)
    .innerJoin(booking, eq(bookingAssignment.bookingId, booking.id))
    .where(
      and(
        inArray(bookingAssignment.cleanerId, cleanerIds),
        ne(booking.id, bookingId),
        inArray(booking.status, ACTIVE_STATUSES as BookingStatus[]),
        lt(booking.startAt, window.endAt),
        gt(booking.endAt, window.startAt),
      ),
    );
  return new Map(rows.map((r) => [r.cleanerId, r.reference]));
}

/* Changes. Each one locks the booking row, checks the rules, writes the change, its history and an audit entry. */

async function lockBooking(tx: Tx, reference: string) {
  const [row] = await tx.select().from(booking).where(eq(booking.reference, reference)).for("update");
  return row ?? null;
}

/**
 * Locks cleaners in a fixed order, always after the booking row, so two people placing the same cleaner
 * on overlapping jobs cannot both succeed, and no two changes can wait on each other forever.
 */
async function lockCleaners(tx: Tx, ids: string[]) {
  for (const id of [...ids].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cleaner:${id}`}))`);
}

async function teamSize(tx: Tx, bookingId: string) {
  const [{ total }] = await tx.select({ total: countAll }).from(bookingAssignment).where(eq(bookingAssignment.bookingId, bookingId));
  return total;
}

const reasonInput = z.string().trim().min(3).max(300);

const statusTemplates: Record<StatusAction, string> = {
  confirm: "booking.confirmed",
  start: "booking.started",
  complete: "booking.completed",
  cancel: "booking.cancelled_by_team",
};

export async function changeStatus(staff: Staff, reference: string, action: StatusAction, reason: unknown, ip: string | null): Promise<WorkflowResult> {
  const cancelReason = action === "cancel" ? reasonInput.safeParse(reason) : null;
  if (cancelReason && !cancelReason.success) return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };

  return withActor(staff, async (tx) => {
    const row = await lockBooking(tx, reference);
    if (!row) return { ok: false, error: "not_found" } as const;
    const next = transition(action, { ...row, assigned: await teamSize(tx, row.id) });
    if (!next.ok) return next;

    const note = cancelReason?.success ? `Cancelled by team: ${cancelReason.data}` : null;
    await tx
      .update(booking)
      .set({ status: next.to, ...(note ? { cancelReason: cancelReason!.data } : {}) })
      .where(eq(booking.id, row.id));
    await tx.insert(bookingEvent).values({ bookingId: row.id, fromStatus: row.status, toStatus: next.to, actorId: staff.userId, note });
    await audit(tx, staff, `booking.${action}`, "booking", row.id, ip, { reference, from: row.status, to: next.to });
    if (action !== "start") await notifyCustomer(tx, row, statusTemplates[action], { reference, ...(note ? { reason: cancelReason!.data } : {}) });
    return { ok: true } as const;
  });
}

export async function sendQuote(staff: Staff, reference: string, amount: unknown, ip: string | null): Promise<WorkflowResult> {
  const fils = typeof amount === "string" ? parseAed(amount) : null;
  if (fils === null) return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };

  return withActor(staff, async (tx) => {
    const row = await lockBooking(tx, reference);
    if (!row) return { ok: false, error: "not_found" } as const;
    if (!canQuote(row)) return { ok: false, error: "not_allowed" } as const;
    await tx.update(booking).set({ quoteFils: fils, quoteStatus: "sent" }).where(eq(booking.id, row.id));
    await tx.insert(bookingEvent).values({ bookingId: row.id, fromStatus: row.status, toStatus: row.status, actorId: staff.userId, note: "Quote sent" });
    await audit(tx, staff, "booking.quote_sent", "booking", row.id, ip, { reference, fils, previous: row.quoteFils });
    await notifyCustomer(tx, row, "quote.sent", { reference, fils });
    return { ok: true } as const;
  });
}

const cleanerIds = z.array(z.uuid()).max(20).refine((ids) => new Set(ids).size === ids.length);

/** Replaces the team on a booking. A cleaner cannot be on two bookings at the same time. */
export async function assignCleaners(staff: Staff, reference: string, input: unknown, ip: string | null): Promise<WorkflowResult> {
  const parsed = cleanerIds.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };
  const ids = [...parsed.data].sort();

  return withActor(staff, async (tx) => {
    const row = await lockBooking(tx, reference);
    if (!row) return { ok: false, error: "not_found" } as const;
    if (!canAssign(row.status)) return { ok: false, error: "not_allowed" } as const;
    await lockCleaners(tx, ids);

    if (ids.length > 0) {
      const found = await tx.select({ id: cleaner.id, active: cleaner.active }).from(cleaner).where(inArray(cleaner.id, ids));
      if (found.length !== ids.length || found.some((c) => !c.active)) return { ok: false, error: "cleaner_inactive" } as const;
      if ((await clashingAssignments(tx, row.id, row, ids)).size > 0) return { ok: false, error: "cleaner_busy" } as const;
    }

    const before = await tx.select({ id: bookingAssignment.cleanerId }).from(bookingAssignment).where(eq(bookingAssignment.bookingId, row.id));
    await tx.delete(bookingAssignment).where(eq(bookingAssignment.bookingId, row.id));
    if (ids.length > 0) {
      await tx.insert(bookingAssignment).values(ids.map((cleanerId) => ({ bookingId: row.id, cleanerId, assignedBy: staff.userId })));
    }
    const status = statusAfterAssignment(row.status, ids.length);
    if (status !== row.status) {
      await tx.update(booking).set({ status }).where(eq(booking.id, row.id));
      await tx.insert(bookingEvent).values({ bookingId: row.id, fromStatus: row.status, toStatus: status, actorId: staff.userId });
      if (status === "assigned") await notifyCustomer(tx, row, "booking.assigned", { reference });
    }
    await audit(tx, staff, "booking.team_changed", "booking", row.id, ip, { reference, before: before.map((b) => b.id), after: ids });
    return { ok: true } as const;
  });
}

const paymentInput = z.object({ method: z.enum(["cash", "card_link"]), status: z.enum(["unpaid", "link_sent", "paid", "refunded"]) });

export async function updatePayment(staff: Staff, reference: string, input: unknown, ip: string | null): Promise<WorkflowResult> {
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };
  const { method, status } = parsed.data;

  return withActor(staff, async (tx) => {
    const row = await lockBooking(tx, reference);
    if (!row) return { ok: false, error: "not_found" } as const;
    if (!isValidPayment(method, status, row.paymentStatus)) return { ok: false, error: "invalid" } as const;
    await tx.update(booking).set({ paymentMethod: method, paymentStatus: status }).where(eq(booking.id, row.id));
    await audit(tx, staff, "booking.payment_updated", "booking", row.id, ip, {
      reference,
      from: { method: row.paymentMethod, status: row.paymentStatus },
      to: { method, status },
    });
    return { ok: true } as const;
  });
}

const noteInput = z.string().trim().min(1).max(2000);

export async function addNote(staff: Staff, reference: string, body: unknown, ip: string | null): Promise<WorkflowResult> {
  const parsed = noteInput.safeParse(body);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };
  return withActor(staff, async (tx) => {
    const [row] = await tx.select({ id: booking.id }).from(booking).where(eq(booking.reference, reference));
    if (!row) return { ok: false, error: "not_found" } as const;
    await tx.insert(bookingNote).values({ bookingId: row.id, authorId: staff.userId, body: parsed.data });
    await audit(tx, staff, "booking.note_added", "booking", row.id, ip, { reference });
    return { ok: true } as const;
  });
}

const slotInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) });

/** Start times the team could move a booking to, using the same capacity rules as customers. */
export async function staffSlots(staff: Staff, reference: string, date: string, now = new Date()) {
  if (await staffLimited(staff)) return { ok: false as const, error: "limited" as const };
  const settings = await getBookingSettings();
  return withActor(staff, async (tx) => {
    const [row] = await tx
      .select({ id: booking.id, cleaners: booking.cleanerCount, duration: booking.durationMinutes, quote: booking.quoteRequired })
      .from(booking)
      .where(eq(booking.reference, reference));
    if (!row) return { ok: false as const, error: "not_found" as const };
    if (!isDateBookable(date, now, settings)) return { ok: true as const, slots: [] };
    const bookings = row.quote ? [] : await capacityBookings(tx, date, row.id);
    return { ok: true as const, slots: buildSlots({ date, duration: row.duration, cleaners: row.cleaners, usesCapacity: !row.quote, now, settings, bookings }) };
  });
}

/** Moves a booking when the customer asks the team by phone. Its status stays, because the team agreed it. */
export async function staffReschedule(staff: Staff, reference: string, input: unknown, ip: string | null, now = new Date()): Promise<WorkflowResult> {
  const parsed = slotInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };
  const { date, time } = parsed.data;
  const settings = await getBookingSettings();

  return withActor(staff, async (tx) => {
    // Same lock order as a customer reschedule (booking, then day), so the two cannot deadlock.
    const row = await lockBooking(tx, reference);
    if (!row) return { ok: false, error: "not_found" } as const;
    if (!OPEN_STATUSES.includes(row.status)) return { ok: false, error: "not_allowed" } as const;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`booking-day:${date}`}))`);
    if (!isSlotAllowed({ date, time, duration: row.durationMinutes, cleaners: row.cleanerCount, usesCapacity: false, now, settings })) {
      return { ok: false, error: "slot" } as const;
    }
    const startAt = dubaiInstant(date, parseTime(time)!);
    const endAt = new Date(startAt.getTime() + row.durationMinutes * 60_000);
    if (startAt.getTime() === row.startAt.getTime()) return { ok: false, error: "invalid" } as const;
    if (!row.quoteRequired) {
      const peak = peakCleaners(await capacityBookings(tx, date, row.id), startAt, endAt);
      if (peak + row.cleanerCount > settings.capacity) return { ok: false, error: "slot" } as const;
    }
    // The team already on the job must be free at the new time too.
    const team = await tx.select({ id: bookingAssignment.cleanerId }).from(bookingAssignment).where(eq(bookingAssignment.bookingId, row.id));
    await lockCleaners(tx, team.map((t) => t.id));
    if ((await clashingAssignments(tx, row.id, { startAt, endAt }, team.map((t) => t.id))).size > 0) return { ok: false, error: "cleaner_busy" } as const;

    await tx.update(booking).set({ startAt, endAt }).where(eq(booking.id, row.id));
    await tx.insert(bookingEvent).values({
      bookingId: row.id,
      fromStatus: row.status,
      toStatus: row.status,
      actorId: staff.userId,
      note: `Rescheduled by team from ${row.startAt.toISOString()}`,
    });
    await audit(tx, staff, "booking.rescheduled", "booking", row.id, ip, { reference, from: row.startAt.toISOString(), to: startAt.toISOString() });
    await notifyCustomer(tx, row, "booking.rescheduled_by_team", { reference, from: row.startAt.toISOString(), to: startAt.toISOString() });
    return { ok: true } as const;
  });
}

/* Overview and schedule */

const scheduleColumns = {
  id: booking.id,
  reference: booking.reference,
  status: booking.status,
  startAt: booking.startAt,
  endAt: booking.endAt,
  contactName: booking.contactName,
  contactPhone: booking.contactPhone,
  building: booking.building,
  area: booking.area,
  cleanerCount: booking.cleanerCount,
  quoteRequired: booking.quoteRequired,
  nameEn: service.nameEn,
  nameAr: service.nameAr,
  serviceSlug: service.slug,
};

/** Every live booking on a Dubai day, with its team, plus how many cleaners are busy across the day. */
export async function daySchedule(staff: Staff, date: string) {
  const settings = await getBookingSettings();
  return withActor(staff, async (tx) => {
    const rows = await tx
      .select(scheduleColumns)
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .where(and(gte(booking.startAt, dubaiInstant(date, 0)), lt(booking.startAt, dubaiInstant(date, 24 * 60)), ne(booking.status, "cancelled")))
      .orderBy(asc(booking.startAt));
    const team = rows.length
      ? await tx
          .select({ bookingId: bookingAssignment.bookingId, name: cleaner.name })
          .from(bookingAssignment)
          .innerJoin(cleaner, eq(bookingAssignment.cleanerId, cleaner.id))
          .where(inArray(bookingAssignment.bookingId, rows.map((r) => r.id)))
      : [];
    const holding = await capacityBookings(tx, date);
    // Busy cleaners in each half hour of the working day.
    const load = [];
    for (let minutes = settings.openMinutes; minutes < settings.closeMinutes; minutes += 30) {
      const start = dubaiInstant(date, minutes);
      load.push({ minutes, used: peakCleaners(holding, start, new Date(start.getTime() + 30 * 60_000)) });
    }
    return {
      bookings: rows.map((r) => ({ ...r, team: team.filter((t) => t.bookingId === r.id).map((t) => t.name) })),
      load,
      capacity: settings.capacity,
    };
  });
}

/** Booking counts for each of the next days, for the week strip on the schedule. */
export async function weekCounts(staff: Staff, firstDate: string, days = 7) {
  const rows = await withActor(staff, (tx) =>
    tx
      .select({ day: sql<string>`to_char(${booking.startAt} at time zone 'Asia/Dubai', 'YYYY-MM-DD')`, count: countAll })
      .from(booking)
      .where(and(gte(booking.startAt, dubaiInstant(firstDate, 0)), lt(booking.startAt, dubaiInstant(addDays(firstDate, days), 0)), ne(booking.status, "cancelled")))
      .groupBy(sql`1`),
  );
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(firstDate, i);
    return { date, count: rows.find((r) => r.day === date)?.count ?? 0 };
  });
}

/** Bookings waiting on the team, oldest request first. */
export async function attentionList(staff: Staff, limit = 6) {
  return withActor(staff, (tx) =>
    tx
      .select({ ...scheduleColumns, quoteStatus: booking.quoteStatus, createdAt: booking.createdAt })
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .where(and(inArray(booking.status, ["pending", "confirmed"]), gt(booking.endAt, new Date())))
      .orderBy(asc(booking.createdAt))
      .limit(limit),
  );
}

export const todayInDubai = () => dubaiDate(new Date());
