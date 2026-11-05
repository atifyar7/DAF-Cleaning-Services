import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { db, withActor } from "@/db";
import { booking, bookingAddOn, notificationOutbox, user } from "@/db/schema";
import { getAvailability, getCustomerBookings, placeBooking } from "@/lib/booking/server";
import { addDays, dubaiDate } from "@/lib/booking/time";

const created: string[] = [];
const marker = `test-${randomUUID().slice(0, 8)}`;
const date = addDays(dubaiDate(new Date()), 40);
const ip = () => randomUUID();

function request(change: Record<string, unknown> = {}, details: Record<string, unknown> = {}) {
  return {
    service: "general-cleaning",
    frequency: "one_time",
    cleaners: 2,
    hours: 3,
    addOns: [],
    jobDetails: "",
    date,
    time: "09:00",
    terms: true,
    locale: "en",
    details: {
      name: "Test Customer",
      phone: "050 123 4567",
      email: `${marker}-${randomUUID().slice(0, 6)}@example.com`,
      whatsapp: true,
      building: "Marina Tower",
      unit: "1203",
      area: "Dubai Marina",
      notes: "",
      latitude: 25.08,
      longitude: 55.14,
      ...details,
    },
    ...change,
  };
}

async function saved(reference: string) {
  const [row] = await withActor({ role: "system" }, (tx) => tx.select().from(booking).where(eq(booking.reference, reference)));
  created.push(row.id);
  return row;
}

afterAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.role', 'system', true)");
  await owner.query("delete from notification_outbox where booking_id = any($1)", [created]);
  await owner.query("delete from booking where id = any($1) or contact_email like $2", [created, `${marker}%`]);
  await owner.query(`delete from "user" where email like $1`, [`${marker}%`]);
  await owner.query("commit");
  await owner.end();
});

describe("placing a booking", () => {
  it("saves an hourly booking with the price worked out on the server", async () => {
    const result = await placeBooking(request({ totalFils: 1, price: 0 }), { ip: ip() });
    expect(result.ok).toBe(true);
    const row = await saved((result as { reference: string }).reference);
    expect(row.reference).toMatch(/^DAF-[A-HJ-NP-Z2-9]{8}$/);
    expect(row.totalFils).toBe(21000);
    expect(row.quoteRequired).toBe(false);
    expect(row.status).toBe("pending");
    expect(row.contactPhone).toBe("+971501234567");
    expect(row.startAt.toISOString()).toBe(`${date}T05:00:00.000Z`);
    expect(row.endAt.toISOString()).toBe(`${date}T08:00:00.000Z`);
  });

  it("creates the customer's account and lets only them see the booking", async () => {
    const email = `${marker}-owner@example.com`;
    const result = await placeBooking(request({}, { email }), { ip: ip() });
    const row = await saved((result as { reference: string }).reference);
    const [account] = await db.select().from(user).where(eq(user.email, email));
    expect(account.role).toBe("customer");
    expect(row.customerId).toBe(account.id);
    expect((await getCustomerBookings(account.id)).map((b) => b.reference)).toEqual([row.reference]);
    expect(await getCustomerBookings(randomUUID())).toEqual([]);
  });

  it("reuses the account when the same email books again", async () => {
    const email = `${marker}-repeat@example.com`;
    const first = await saved(((await placeBooking(request({}, { email }), { ip: ip() })) as { reference: string }).reference);
    const second = await saved(
      ((await placeBooking(request({ time: "13:00" }, { email: email.toUpperCase() }), { ip: ip() })) as { reference: string }).reference,
    );
    expect(second.customerId).toBe(first.customerId);
  });

  it("saves a quote booking without a price", async () => {
    const result = await placeBooking(
      request({ service: "plumbing", cleaners: 7, hours: 9, jobDetails: "Kitchen sink is leaking under the cabinet." }),
      { ip: ip() },
    );
    const row = await saved((result as { reference: string }).reference);
    expect(row.quoteRequired).toBe(true);
    expect(row.totalFils).toBeNull();
    expect(row.cleanerCount).toBe(1);
    expect(row.durationMinutes).toBe(60);
  });

  it("requires job details for a quote booking", async () => {
    const result = await placeBooking(request({ service: "plumbing", jobDetails: "leak" }), { ip: ip() });
    expect(result).toEqual({ ok: false, error: "invalid", fields: ["jobDetails"] });
  });

  it("saves add-ons for housekeeping without changing the price", async () => {
    const result = await placeBooking(request({ addOns: ["ironing", "laundry"] }), { ip: ip() });
    const row = await saved((result as { reference: string }).reference);
    expect(row.totalFils).toBe(21000);
    const addOns = await withActor({ role: "system" }, (tx) => tx.select().from(bookingAddOn).where(eq(bookingAddOn.bookingId, row.id)));
    expect(addOns).toHaveLength(2);
    expect(addOns.every((item) => item.unitPriceFils === null)).toBe(true);
  });

  it("queues the customer, dispatch and WhatsApp messages", async () => {
    const result = await placeBooking(request(), { ip: ip() });
    const row = await saved((result as { reference: string }).reference);
    const queued = await withActor({ role: "system" }, (tx) =>
      tx.select().from(notificationOutbox).where(eq(notificationOutbox.bookingId, row.id)),
    );
    expect(queued.map((item) => `${item.channel}:${item.template}`).sort()).toEqual([
      "email:booking.dispatch",
      "email:booking.received",
      "whatsapp:booking.received",
    ]);
  });
});

describe("rejected bookings", () => {
  it.each([
    ["an unknown service", { service: "free-cleaning" }],
    ["fewer than 2 hours", { hours: 1 }],
    ["more than 10 hours", { hours: 11 }],
    ["more than 10 cleaners", { cleaners: 11 }],
    ["zero cleaners", { cleaners: 0 }],
    ["fractional hours", { hours: 2.5 }],
    ["add-ons on a technical service", { service: "plumbing", jobDetails: "Leaking pipe in the bathroom.", addOns: ["ironing"] }],
    ["an unknown add-on", { addOns: ["gold-polish"] }],
    ["unaccepted terms", { terms: false }],
    ["a bad frequency", { frequency: "hourly" }],
  ])("refuses %s", async (_name, change) => {
    expect((await placeBooking(request(change), { ip: ip() })).ok).toBe(false);
  });

  it.each([
    ["a non-UAE phone", { phone: "+44 7700 900123" }],
    ["a bad email", { email: "nobody" }],
    ["a missing building", { building: " " }],
    ["a pin outside Dubai", { latitude: 24.45, longitude: 54.37 }],
    ["half a pin", { latitude: 25.2, longitude: null }],
  ])("refuses %s", async (_name, details) => {
    expect((await placeBooking(request({}, details), { ip: ip() })).ok).toBe(false);
  });

  it.each([
    ["a time that ends after 7 PM", { time: "17:30" }],
    ["an off-grid time", { time: "09:10" }],
    ["a past date", { date: "2020-01-01" }],
    ["an impossible date", { date: "2026-13-45" }],
    ["a date beyond 60 days", { date: addDays(dubaiDate(new Date()), 61) }],
  ])("refuses %s", async (_name, change) => {
    expect(await placeBooking(request(change), { ip: ip() })).toEqual({ ok: false, error: "slot" });
  });

  it("ignores bots that fill the hidden field", async () => {
    const email = `${marker}-bot@example.com`;
    const result = await placeBooking(request({ website: "spam" }, { email }), { ip: ip() });
    expect(result.ok).toBe(true);
    const rows = await withActor({ role: "system" }, (tx) => tx.select().from(booking).where(eq(booking.contactEmail, email)));
    expect(rows).toEqual([]);
  });

  it("limits repeated bookings from one IP", async () => {
    const address = ip();
    const results = [];
    for (let i = 0; i < 6; i++) {
      const result = await placeBooking(request({ time: `${10 + i}:00` }), { ip: address });
      if (result.ok) await saved(result.reference);
      results.push(result.ok ? "ok" : result.error);
    }
    expect(results).toEqual(["ok", "ok", "ok", "ok", "ok", "limited"]);
  });
});

describe("capacity", () => {
  const busyDate = addDays(dubaiDate(new Date()), 45);

  it("never overbooks the 50 cleaners, even with simultaneous requests", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () => placeBooking(request({ date: busyDate, time: "14:00", cleaners: 10, hours: 2 }), { ip: ip() })),
    );
    for (const result of attempts) if (result.ok) await saved(result.reference);
    expect(attempts.filter((result) => result.ok)).toHaveLength(5);
    expect(attempts.filter((result) => !result.ok)).toEqual([{ ok: false, error: "slot" }]);
  });

  it("shows the full time as unavailable and the next free time as open", async () => {
    const result = await getAvailability({ service: "general-cleaning", date: busyDate, cleaners: 1, hours: 2 }, ip());
    if (!result.ok) throw new Error("availability failed");
    const slot = (time: string) => result.slots.find((item) => item.time === time)!;
    expect(slot("13:00").available).toBe(false);
    expect(slot("15:30").available).toBe(false);
    expect(slot("16:00").available).toBe(true);
    expect(slot("09:00").available).toBe(true);
  });

  it("returns no times for impossible or out-of-range dates", async () => {
    for (const bad of ["2026-13-45", "2020-01-01", addDays(dubaiDate(new Date()), 61)]) {
      const result = await getAvailability({ service: "general-cleaning", date: bad, cleaners: 1, hours: 2 }, ip());
      expect(result).toEqual({ ok: true, slots: [] });
    }
  });

  it("frees the cleaners when a booking is cancelled", async () => {
    const rows = await withActor({ role: "system" }, (tx) =>
      tx.select({ id: booking.id, startAt: booking.startAt }).from(booking).where(inArray(booking.id, created)),
    );
    const target = rows.find((row) => row.startAt.toISOString() === `${busyDate}T10:00:00.000Z`)!;
    await withActor({ role: "system" }, (tx) => tx.update(booking).set({ status: "cancelled" }).where(eq(booking.id, target.id)));
    const retry = await placeBooking(request({ date: busyDate, time: "14:00", cleaners: 10, hours: 2 }), { ip: ip() });
    expect(retry.ok).toBe(true);
    if (retry.ok) await saved(retry.reference);
  });
});
