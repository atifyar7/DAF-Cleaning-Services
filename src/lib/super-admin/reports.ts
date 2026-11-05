import "server-only";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { withActor } from "@/db";
import { booking, bookingAssignment, cleaner, service } from "@/db/schema";
import { addDays, dubaiDate, dubaiInstant, isValidDate } from "../booking/time";
import type { Staff, Tx } from "../admin/shared";

// Figures for the Super Admin. Revenue counts completed bookings only, by the day the job took place
// (Dubai time). Every query runs as the Super Admin, under the same database rules as the app.

export const MAX_RANGE_DAYS = 366;
export type Range = { from: string; to: string; days: number };
export type Bucket = "day" | "week" | "month";

const daysBetween = (from: string, to: string) => Math.round((dubaiInstant(to, 0).getTime() - dubaiInstant(from, 0).getTime()) / 86_400_000) + 1;

/** Reads a date range from the address bar. Anything invalid falls back to the last 30 days. */
export function parseRange(from: unknown, to: unknown, now = new Date()): Range {
  const today = dubaiDate(now);
  const fallback = { from: addDays(today, -29), to: today };
  const f = typeof from === "string" && isValidDate(from) ? from : null;
  const t = typeof to === "string" && isValidDate(to) ? to : null;
  const chosen = f && t && f <= t && daysBetween(f, t) <= MAX_RANGE_DAYS ? { from: f, to: t } : fallback;
  return { ...chosen, days: daysBetween(chosen.from, chosen.to) };
}

/** The equal-length period just before, for "compared with" figures. */
export function previousRange(range: Range): Range {
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(range.days - 1)), to, days: range.days };
}

export function bucketFor(days: number): Bucket {
  return days <= 45 ? "day" : days <= 200 ? "week" : "month";
}

const startsIn = (range: Range) => and(gte(booking.startAt, dubaiInstant(range.from, 0)), lt(booking.startAt, dubaiInstant(addDays(range.to, 1), 0)));
const createdIn = (range: Range) => and(gte(booking.createdAt, dubaiInstant(range.from, 0)), lt(booking.createdAt, dubaiInstant(addDays(range.to, 1), 0)));

async function totals(tx: Tx, range: Range) {
  const [row] = await tx
    .select({
      revenueFils: sql<number>`coalesce(sum(${booking.totalFils}) filter (where ${booking.status} = 'completed'), 0)::bigint`,
      completed: sql<number>`count(*) filter (where ${booking.status} = 'completed')::int`,
      cancelled: sql<number>`count(*) filter (where ${booking.status} = 'cancelled')::int`,
      scheduled: sql<number>`count(*)::int`,
    })
    .from(booking)
    .where(startsIn(range));
  const [received] = await tx.select({ count: sql<number>`count(*)::int` }).from(booking).where(createdIn(range));
  const [quotes] = await tx
    .select({
      sent: sql<number>`count(*) filter (where ${booking.quoteStatus} <> 'none')::int`,
      accepted: sql<number>`count(*) filter (where ${booking.quoteStatus} = 'accepted')::int`,
      declined: sql<number>`count(*) filter (where ${booking.quoteStatus} = 'declined')::int`,
    })
    .from(booking)
    .where(and(createdIn(range), eq(booking.quoteRequired, true)));
  return { ...row, revenueFils: Number(row.revenueFils), received: received.count, quotes };
}

/** Labels every bucket in the range, including empty ones, so a chart has no gaps. */
function bucketKeys(range: Range, bucket: Bucket) {
  const keys: string[] = [];
  let date = range.from;
  while (date <= range.to) {
    const key = bucket === "day" ? date : bucket === "month" ? `${date.slice(0, 7)}-01` : weekStart(date);
    if (keys.at(-1) !== key) keys.push(key);
    date = addDays(date, 1);
  }
  return keys;
}

/** Monday of the week a date falls in, matching Postgres date_trunc('week'). */
function weekStart(date: string) {
  const day = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -day);
}

/** Headline totals for one period, for comparisons that are not the period just before. */
export function periodTotals(owner: Staff, range: Range) {
  return withActor(owner, (tx) => totals(tx, range));
}

export async function getReport(owner: Staff, range: Range) {
  const bucket = bucketFor(range.days);
  return withActor(owner, async (tx) => {
    const current = await totals(tx, range);
    const previous = await totals(tx, previousRange(range));

    const local = sql`(${booking.startAt} at time zone 'Asia/Dubai')`;
    const revenueRows = await tx
      .select({
        key: sql<string>`to_char(date_trunc(${bucket}, ${local}), 'YYYY-MM-DD')`,
        fils: sql<number>`coalesce(sum(${booking.totalFils}), 0)::bigint`,
        jobs: sql<number>`count(*)::int`,
      })
      .from(booking)
      .where(and(startsIn(range), eq(booking.status, "completed")))
      .groupBy(sql`1`);
    const revenue = bucketKeys(range, bucket).map((key) => {
      const found = revenueRows.find((r) => r.key === key);
      return { key, fils: Number(found?.fils ?? 0), jobs: found?.jobs ?? 0 };
    });

    const byStatus = await tx.select({ status: booking.status, count: sql<number>`count(*)::int` }).from(booking).where(startsIn(range)).groupBy(booking.status);

    const byService = await tx
      .select({
        nameEn: service.nameEn,
        nameAr: service.nameAr,
        bookings: sql<number>`count(*) filter (where ${booking.status} <> 'cancelled')::int`,
        completed: sql<number>`count(*) filter (where ${booking.status} = 'completed')::int`,
        fils: sql<number>`coalesce(sum(${booking.totalFils}) filter (where ${booking.status} = 'completed'), 0)::bigint`,
      })
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .where(startsIn(range))
      .groupBy(service.id, service.nameEn, service.nameAr)
      .orderBy(desc(sql`4`), desc(sql`3`));

    const byArea = await tx
      .select({ area: sql<string>`initcap(trim(${booking.area}))`, bookings: sql<number>`count(*)::int` })
      .from(booking)
      .where(and(startsIn(range), sql`${booking.status} <> 'cancelled'`))
      .groupBy(sql`1`)
      .orderBy(desc(sql`2`), asc(sql`1`))
      .limit(8);

    const cleaners = await tx
      .select({
        name: cleaner.name,
        active: cleaner.active,
        jobs: sql<number>`count(*)::int`,
        minutes: sql<number>`coalesce(sum(${booking.durationMinutes}), 0)::int`,
      })
      .from(bookingAssignment)
      .innerJoin(booking, eq(bookingAssignment.bookingId, booking.id))
      .innerJoin(cleaner, eq(bookingAssignment.cleanerId, cleaner.id))
      .where(and(startsIn(range), eq(booking.status, "completed")))
      .groupBy(cleaner.id, cleaner.name, cleaner.active)
      .orderBy(desc(sql`3`), asc(cleaner.name));

    return {
      bucket,
      current,
      previous,
      revenue,
      byStatus,
      byService: byService.map((s) => ({ ...s, fils: Number(s.fils) })),
      byArea,
      cleaners,
    };
  });
}

/** Percentage change, or null when there is nothing to compare with. */
export function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/* CSV export */

/**
 * Makes a value safe for a spreadsheet cell. Cells starting with = + - @ (or tab/CR) are prefixed with
 * a quote so Excel cannot run them as formulas, then the value is quoted for CSV.
 */
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportBookingsCsv(owner: Staff, range: Range) {
  const rows = await withActor(owner, (tx) =>
    tx
      .select({
        reference: booking.reference,
        createdAt: sql<string>`to_char(${booking.createdAt} at time zone 'Asia/Dubai', 'YYYY-MM-DD HH24:MI')`,
        start: sql<string>`to_char(${booking.startAt} at time zone 'Asia/Dubai', 'YYYY-MM-DD HH24:MI')`,
        end: sql<string>`to_char(${booking.endAt} at time zone 'Asia/Dubai', 'HH24:MI')`,
        status: booking.status,
        service: service.nameEn,
        cleaners: booking.cleanerCount,
        hours: sql<number>`round(${booking.durationMinutes} / 60.0, 2)`,
        customer: booking.contactName,
        phone: booking.contactPhone,
        email: booking.contactEmail,
        area: booking.area,
        quote: booking.quoteStatus,
        totalFils: booking.totalFils,
        paymentMethod: booking.paymentMethod,
        paymentStatus: booking.paymentStatus,
        team: sql<string>`(select string_agg(c.name, '; ' order by c.name) from booking_assignment ba join cleaner c on c.id = ba.cleaner_id where ba.booking_id = ${booking.id})`,
      })
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .where(startsIn(range))
      .orderBy(asc(booking.startAt)),
  );
  const header = ["Reference", "Requested", "Start", "End", "Status", "Service", "Cleaners", "Hours", "Customer", "Phone", "Email", "Area", "Quote", "Total (AED)", "Payment method", "Payment status", "Team"];
  const lines = rows.map((r) =>
    [r.reference, r.createdAt, r.start, r.end, r.status, r.service, r.cleaners, r.hours, r.customer, r.phone, r.email, r.area, r.quote, r.totalFils === null ? "" : (r.totalFils / 100).toFixed(2), r.paymentMethod, r.paymentStatus, r.team ?? ""]
      .map(csvCell)
      .join(","),
  );
  // The byte-order mark lets Excel open Arabic names correctly.
  return { csv: `﻿${[header.join(","), ...lines].join("\r\n")}\r\n`, count: rows.length };
}
