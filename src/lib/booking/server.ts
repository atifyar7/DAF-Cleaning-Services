import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db, withActor } from "@/db";
import {
  addOn,
  booking,
  bookingAddOn,
  bookingEvent,
  notificationOutbox,
  service,
  serviceCategory,
  setting,
  user,
} from "@/db/schema";
import { business } from "@/content";
import { consume, limits } from "../rate-limit";
import { bookingInput, normalizeUaeMobile } from "./input";
import {
  allowsAddOns,
  buildSlots,
  durationMinutes,
  isDateBookable,
  isQuote,
  isSlotAllowed,
  peakCleaners,
  priceBooking,
  type BookingSettings,
  type CatalogService,
} from "./rules";
import { dubaiInstant, parseTime } from "./time";

export async function getBookingSettings(): Promise<BookingSettings> {
  const rows = await db.select().from(setting);
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  const number = (key: string, fallback: number) => {
    const found = Number(value(key));
    return Number.isFinite(found) && found > 0 ? found : fallback;
  };
  return {
    capacity: number("booking.slot_capacity", 50),
    openMinutes: parseTime(String(value("booking.open_time") ?? "")) ?? 9 * 60,
    closeMinutes: parseTime(String(value("booking.close_time") ?? "")) ?? 19 * 60,
    slotMinutes: number("booking.slot_minutes", 30),
    minHours: number("booking.min_hours", 2),
    maxHours: number("booking.max_hours", 10),
    maxCleaners: number("booking.max_cleaners", 10),
    leadMinutes: number("booking.lead_minutes", 120),
    maxDaysAhead: number("booking.max_days_ahead", 60),
  };
}

export async function getCatalog() {
  const services = await db
    .select({
      id: service.id,
      slug: service.slug,
      nameEn: service.nameEn,
      nameAr: service.nameAr,
      pricingModel: service.pricingModel,
      priceFils: service.priceFils,
      category: serviceCategory.slug,
    })
    .from(service)
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .where(and(eq(service.active, true), eq(serviceCategory.active, true)))
    .orderBy(serviceCategory.sortOrder, service.sortOrder);
  const addOns = await db
    .select({ id: addOn.id, slug: addOn.slug, nameEn: addOn.nameEn, nameAr: addOn.nameAr, priceFils: addOn.priceFils })
    .from(addOn)
    .where(eq(addOn.active, true));
  return { services, addOns };
}

/**
 * Bookings that hold cleaners on a day: everything not cancelled and not waiting for a quote.
 * A booking being rescheduled is left out, so it does not compete with itself.
 */
export function capacityBookings(tx: Pick<typeof db, "select">, date: string, excludeId?: string) {
  return tx
    .select({ startAt: booking.startAt, endAt: booking.endAt, cleaners: booking.cleanerCount })
    .from(booking)
    .where(
      and(
        lt(booking.startAt, dubaiInstant(date, 24 * 60)),
        gt(booking.endAt, dubaiInstant(date, 0)),
        ne(booking.status, "cancelled"),
        eq(booking.quoteRequired, false),
        excludeId ? ne(booking.id, excludeId) : undefined,
      ),
    );
}

/** Hours before the appointment until which a customer may cancel or reschedule for free. */
export async function getFreeChangeHours() {
  const [row] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, "booking.free_cancellation_hours"));
  const hours = Number(row?.value);
  return Number.isFinite(hours) && hours >= 0 ? hours : 24;
}

type Clamped = { service: CatalogService; cleaners: number; hours: number };

function clamp(found: CatalogService, cleaners: number, hours: number, settings: BookingSettings): Clamped | null {
  if (isQuote(found)) return { service: found, cleaners: 1, hours: 1 };
  if (cleaners < 1 || cleaners > Math.min(settings.maxCleaners, settings.capacity)) return null;
  if (hours < settings.minHours || hours > settings.maxHours) return null;
  return { service: found, cleaners, hours };
}

export async function getAvailability(
  input: { service: string; date: string; cleaners: number; hours: number },
  ip: string,
  now = new Date(),
) {
  if (!(await consume(limits.availabilityPerIp, ip))) return { ok: false as const, error: "limited" as const };
  const [settings, { services }] = await Promise.all([getBookingSettings(), getCatalog()]);
  const found = services.find((item) => item.slug === input.service);
  const request = found && clamp(found, input.cleaners, input.hours, settings);
  if (!request) return { ok: false as const, error: "invalid" as const };
  if (!isDateBookable(input.date, now, settings)) return { ok: true as const, slots: [] };

  const bookings = await withActor({ role: "system" }, (tx) => capacityBookings(tx, input.date));
  const slots = buildSlots({
    date: input.date,
    duration: durationMinutes(request.service, request.hours),
    cleaners: request.cleaners,
    usesCapacity: !isQuote(request.service),
    now,
    settings,
    bookings,
  });
  return { ok: true as const, slots };
}

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newReference() {
  let code = "";
  for (let i = 0; i < 8; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `DAF-${code}`;
}

export type BookingResult =
  | { ok: true; reference: string }
  | { ok: false; error: "invalid" | "slot" | "limited" | "failed"; fields?: string[] };

type Context = { ip: string; customerId?: string; now?: Date };

/**
 * Validates and saves a booking request. Every price, time and capacity rule is checked here on
 * the server; nothing the browser sends about price is used.
 */
export async function placeBooking(raw: unknown, { ip, customerId, now = new Date() }: Context): Promise<BookingResult> {
  const parsed = bookingInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid", fields: parsed.error.issues.map((issue) => issue.path.join(".")) };
  }
  const input = parsed.data;
  // Bots fill the hidden field. They get a believable reply and nothing is saved.
  if (input.website) return { ok: true, reference: newReference() };

  const email = input.details.email.toLowerCase();
  if (!(await consume(limits.bookingPerIp, ip))) return { ok: false, error: "limited" };
  if (!(await consume(limits.bookingPerEmail, email))) return { ok: false, error: "limited" };

  const [settings, catalog] = await Promise.all([getBookingSettings(), getCatalog()]);
  const found = catalog.services.find((item) => item.slug === input.service);
  const request = found && clamp(found, input.cleaners, input.hours, settings);
  if (!found || !request) return { ok: false, error: "invalid", fields: ["service"] };

  const addOns = catalog.addOns.filter((item) => input.addOns.includes(item.slug));
  if (addOns.length !== new Set(input.addOns).size || (addOns.length > 0 && !allowsAddOns(found))) {
    return { ok: false, error: "invalid", fields: ["addOns"] };
  }
  if (isQuote(found) && input.jobDetails.length < 10) return { ok: false, error: "invalid", fields: ["jobDetails"] };

  const duration = durationMinutes(found, request.hours);
  const slotRequest = { date: input.date, time: input.time, duration, cleaners: request.cleaners, now, settings };
  if (!isSlotAllowed({ ...slotRequest, usesCapacity: false })) return { ok: false, error: "slot" };

  const startAt = dubaiInstant(input.date, parseTime(input.time)!);
  const endAt = new Date(startAt.getTime() + duration * 60_000);
  const price = priceBooking(found, request.cleaners, request.hours);
  const phone = normalizeUaeMobile(input.details.phone)!;
  const reference = newReference();

  try {
    const saved = await withActor({ role: "system" }, async (tx) => {
      // One booking per day is checked at a time, so two people cannot take the last cleaners together.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`booking-day:${input.date}`}))`);
      if (!price.quoteRequired) {
        const peak = peakCleaners(await capacityBookings(tx, input.date), startAt, endAt);
        if (peak + request.cleaners > settings.capacity) return false;
      }

      const owner = customerId ?? (await findOrCreateCustomer(tx, email, input.details.name, phone, input.locale));
      const [created] = await tx
        .insert(booking)
        .values({
          reference,
          customerId: owner,
          contactName: input.details.name,
          contactPhone: phone,
          contactEmail: email,
          whatsappOptIn: input.details.whatsapp,
          serviceId: found.id,
          frequency: input.frequency,
          cleanerCount: request.cleaners,
          durationMinutes: duration,
          startAt,
          endAt,
          building: input.details.building,
          unit: input.details.unit,
          area: input.details.area,
          latitude: input.details.latitude,
          longitude: input.details.longitude,
          paymentMethod: "cash",
          quoteRequired: price.quoteRequired,
          serviceFils: price.serviceFils,
          addOnsFils: 0,
          totalFils: price.totalFils,
          priceSnapshot: {
            pricingModel: found.pricingModel,
            unitFils: found.priceFils,
            cleaners: request.cleaners,
            hours: price.quoteRequired ? null : request.hours,
            addOns: addOns.map((item) => ({ slug: item.slug, priceFils: item.priceFils })),
          },
          notes: input.details.notes || null,
          jobDetails: input.jobDetails || null,
          locale: input.locale,
        })
        .returning({ id: booking.id });

      if (addOns.length > 0) {
        await tx
          .insert(bookingAddOn)
          .values(addOns.map((item) => ({ bookingId: created.id, addOnId: item.id, unitPriceFils: item.priceFils })));
      }
      await tx.insert(bookingEvent).values({ bookingId: created.id, toStatus: "pending", actorId: owner });

      // Sent by the notifications phase. Saved now so no booking is ever missed.
      const payload = { reference };
      const messages: (typeof notificationOutbox.$inferInsert)[] = [
        { channel: "email", template: "booking.received", recipient: email, payload, bookingId: created.id },
        { channel: "email", template: "booking.dispatch", recipient: business.email, payload, bookingId: created.id },
      ];
      if (input.details.whatsapp) {
        messages.push({ channel: "whatsapp", template: "booking.received", recipient: phone, payload, bookingId: created.id });
      }
      await tx.insert(notificationOutbox).values(messages);
      return true;
    });
    return saved ? { ok: true, reference } : { ok: false, error: "slot" };
  } catch (error) {
    console.error("Booking failed", error);
    return { ok: false, error: "failed" };
  }
}

/** Links the booking to the customer's account, creating one if needed. Staff accounts are never linked. */
async function findOrCreateCustomer(
  tx: Parameters<Parameters<typeof withActor>[1]>[0],
  email: string,
  name: string,
  phone: string,
  locale: string,
) {
  const [existing] = await tx.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, email));
  if (existing) return existing.role === "customer" ? existing.id : null;
  const id = randomUUID();
  await tx.insert(user).values({ id, email, name, phone, locale, role: "customer" });
  return id;
}

export async function getCustomerBookings(customerId: string) {
  return withActor({ role: "customer", userId: customerId }, (tx) =>
    tx
      .select({
        reference: booking.reference,
        status: booking.status,
        startAt: booking.startAt,
        totalFils: booking.totalFils,
        quoteRequired: booking.quoteRequired,
        nameEn: service.nameEn,
        nameAr: service.nameAr,
      })
      .from(booking)
      .innerJoin(service, eq(booking.serviceId, service.id))
      .where(eq(booking.customerId, customerId))
      .orderBy(sql`${booking.startAt} desc`),
  );
}

