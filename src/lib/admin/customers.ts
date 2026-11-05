import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "@/db";
import {
  account,
  booking,
  customerAddress,
  notificationOutbox,
  service,
  session,
  twoFactor,
  user,
  verification,
} from "@/db/schema";
import { audit, countAll, likePattern, PAGE_SIZE, pageOffset, staffLimited, type Staff } from "./shared";
import { ACTIVE_STATUSES, type BookingStatus, type WorkflowResult } from "./workflow";

const filterInput = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  view: z.enum(["all", "deletion"]).catch("all"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

const bookingTotals = {
  bookings: sql<number>`(select count(*) from booking b where b.customer_id = "user".id)::int`,
  completed: sql<number>`(select count(*) from booking b where b.customer_id = "user".id and b.status = 'completed')::int`,
  lastBooking: sql<Date | null>`(select max(b.start_at) from booking b where b.customer_id = "user".id)`,
};

export async function listCustomers(staff: Staff, raw: Record<string, unknown>) {
  const filters = filterInput.parse(raw);
  const conditions: (SQL | undefined)[] = [eq(user.role, "customer")];
  if (filters.view === "deletion") conditions.push(isNotNull(user.deletionRequestedAt), isNull(user.disabledAt));
  if (filters.q) {
    const pattern = likePattern(filters.q);
    conditions.push(or(ilike(user.name, pattern), ilike(user.email, pattern), ilike(user.phone, pattern)));
  }
  const where = and(...conditions);

  return withActor(staff, async (tx) => {
    const rows = await tx
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt,
        deletionRequestedAt: user.deletionRequestedAt,
        disabledAt: user.disabledAt,
        ...bookingTotals,
      })
      .from(user)
      .where(where)
      .orderBy(filters.view === "deletion" ? asc(user.deletionRequestedAt) : desc(user.createdAt))
      .limit(PAGE_SIZE)
      .offset(pageOffset(filters.page));
    const [{ total }] = await tx.select({ total: countAll }).from(user).where(where);
    return { rows, total, page: filters.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), filters };
  });
}

export async function getCustomer(staff: Staff, id: string) {
  if (!z.string().min(1).max(100).safeParse(id).success) return null;
  return withActor(staff, async (tx) => {
    const [found] = await tx
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        locale: user.locale,
        createdAt: user.createdAt,
        deletionRequestedAt: user.deletionRequestedAt,
        disabledAt: user.disabledAt,
        ...bookingTotals,
      })
      .from(user)
      .where(and(eq(user.id, id), eq(user.role, "customer")));
    if (!found) return null;
    const addresses = await tx
      .select({ id: customerAddress.id, label: customerAddress.label, building: customerAddress.building, unit: customerAddress.unit, area: customerAddress.area })
      .from(customerAddress)
      .where(eq(customerAddress.userId, id))
      .orderBy(asc(customerAddress.createdAt));
    const bookings = await tx
      .select({
        reference: booking.reference,
        status: booking.status,
        startAt: booking.startAt,
        endAt: booking.endAt,
        totalFils: booking.totalFils,
        quoteRequired: booking.quoteRequired,
        nameEn: service.nameEn,
        nameAr: service.nameAr,
      })
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .where(eq(booking.customerId, id))
      .orderBy(desc(booking.startAt));
    const openBookings = bookings.filter((b) => (ACTIVE_STATUSES as readonly string[]).includes(b.status)).length;
    return { ...found, addresses, history: bookings, openBookings };
  });
}

const ERASED_NAME = "Deleted customer";

/**
 * Completes a customer's deletion request. Personal details are removed everywhere, while booking
 * records stay (without who or where) for the business's accounts. The account cannot sign in again.
 */
export async function eraseCustomer(staff: Staff, id: unknown, ip: string | null): Promise<WorkflowResult> {
  const parsed = z.string().min(1).max(100).safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };
  const userId = parsed.data;

  return withActor(staff, async (tx) => {
    const [target] = await tx.select().from(user).where(and(eq(user.id, userId), eq(user.role, "customer"))).for("update");
    if (!target) return { ok: false, error: "not_found" } as const;
    if (!target.deletionRequestedAt || target.disabledAt) return { ok: false, error: "not_allowed" } as const;

    const bookings = await tx.select({ id: booking.id, status: booking.status }).from(booking).where(eq(booking.customerId, userId)).for("update");
    if (bookings.some((b) => ACTIVE_STATUSES.includes(b.status as BookingStatus))) return { ok: false, error: "has_open_bookings" } as const;

    const erasedEmail = `deleted-${userId}@deleted.invalid`;
    const ids = bookings.map((b) => b.id);
    if (ids.length > 0) {
      await tx
        .update(booking)
        .set({
          contactName: ERASED_NAME,
          contactPhone: "-",
          contactEmail: erasedEmail,
          whatsappOptIn: false,
          building: "Removed",
          unit: "-",
          latitude: null,
          longitude: null,
          notes: null,
          jobDetails: null,
        })
        .where(inArray(booking.id, ids));
      // Nothing still waiting to be sent may carry their contact details.
      await tx
        .update(notificationOutbox)
        .set({ status: "failed", recipient: "erased", payload: {}, lastError: "Customer erased" })
        .where(and(inArray(notificationOutbox.bookingId, ids), eq(notificationOutbox.status, "pending")));
    }
    await tx.delete(customerAddress).where(eq(customerAddress.userId, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await tx.delete(account).where(eq(account.userId, userId));
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    await tx.delete(verification).where(ilike(verification.identifier, `%${target.email.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
    await tx
      .update(user)
      .set({ name: ERASED_NAME, email: erasedEmail, phone: null, image: null, emailVerified: false, disabledAt: new Date() })
      .where(eq(user.id, userId));
    // The audit entry records that it happened and who did it, never the removed details.
    await audit(tx, staff, "customer.erased", "user", userId, ip, { bookingsKept: ids.length });
    return { ok: true } as const;
  });
}
