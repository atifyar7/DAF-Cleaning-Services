import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { db, withActor } from "@/db";
import { auditLog, booking, bookingEvent, customerAddress, notificationOutbox, user } from "@/db/schema";
import {
  addAddress,
  cancelBooking,
  canChange,
  getCustomerBooking,
  getRescheduleSlots,
  listAddresses,
  listCustomerBookings,
  MAX_ADDRESSES,
  removeAddress,
  requestDeletion,
  rescheduleBooking,
  respondToQuote,
  updateProfile,
} from "@/lib/booking/customer";
import { placeBooking } from "@/lib/booking/server";
import { limits, reset } from "@/lib/rate-limit";
import { addDays, dubaiDate } from "@/lib/booking/time";

const marker = `dash-${randomUUID().slice(0, 8)}`;
const today = dubaiDate(new Date());
let alice = "";
let bob = "";

async function book(email: string, change: Record<string, unknown> = {}) {
  // Setup makes more bookings per customer than the real daily limit allows.
  await reset(limits.bookingPerEmail, email);
  const result = await placeBooking(
    {
      service: "general-cleaning",
      frequency: "one_time",
      cleaners: 2,
      hours: 2,
      addOns: [],
      jobDetails: "",
      date: addDays(today, 20),
      time: "09:00",
      terms: true,
      locale: "en",
      details: { name: "Dash Test", phone: "0501234567", email, whatsapp: false, building: "Tower", unit: "1", area: "Marina", notes: "", latitude: null, longitude: null },
      ...change,
    },
    { ip: randomUUID() },
  );
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.reference;
}

const row = async (reference: string) =>
  (await withActor({ role: "system" }, (tx) => tx.select().from(booking).where(eq(booking.reference, reference))))[0];

beforeAll(async () => {
  await book(`${marker}-alice@example.com`);
  await book(`${marker}-bob@example.com`);
  const users = await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.email, [`${marker}-alice@example.com`, `${marker}-bob@example.com`]));
  alice = users.find((u) => u.email.includes("alice"))!.id;
  bob = users.find((u) => u.email.includes("bob"))!.id;
});

afterAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.role', 'system', true)");
  await owner.query("delete from notification_outbox where booking_id in (select id from booking where contact_email like $1) or payload->>'userId' = any($2)", [`${marker}%`, [alice, bob]]);
  await owner.query("delete from booking where contact_email like $1", [`${marker}%`]);
  await owner.query(`delete from "user" where email like $1`, [`${marker}%`]);
  await owner.query("commit");
  await owner.end();
});

describe("free change window", () => {
  const start = new Date("2026-12-01T10:00:00Z");
  it("allows changes 24 hours or more before", () => {
    expect(canChange("pending", start, 24, new Date("2026-11-30T10:00:00Z"))).toBe(true);
    expect(canChange("confirmed", start, 24, new Date("2026-11-30T10:00:01Z"))).toBe(false);
  });
  it("never allows changes to finished or cancelled bookings", () => {
    const early = new Date("2026-11-01T00:00:00Z");
    for (const status of ["in_progress", "completed", "cancelled"]) expect(canChange(status, start, 24, early)).toBe(false);
  });
});

describe("viewing bookings", () => {
  it("shows a customer only their own bookings", async () => {
    const mine = await listCustomerBookings(alice);
    expect(mine.length).toBeGreaterThan(0);
    const theirs = await listCustomerBookings(bob);
    expect(mine.map((b) => b.reference)).not.toContain(theirs[0].reference);
  });

  it("returns nothing for someone else's booking reference", async () => {
    const [theirs] = await listCustomerBookings(bob);
    expect(await getCustomerBooking(alice, theirs.reference)).toBeNull();
    expect(await getCustomerBooking(bob, theirs.reference)).not.toBeNull();
  });
});

describe("cancelling", () => {
  it("cancels the customer's own booking and records why", async () => {
    const reference = await book(`${marker}-alice@example.com`, { time: "11:00" });
    expect(await cancelBooking(alice, reference)).toEqual({ ok: true });
    const saved = await row(reference);
    expect(saved.status).toBe("cancelled");
    const events = await withActor({ role: "system" }, (tx) => tx.select().from(bookingEvent).where(eq(bookingEvent.bookingId, saved.id)));
    expect(events.map((e) => e.toStatus)).toEqual(["pending", "cancelled"]);
    const queued = await withActor({ role: "system" }, (tx) => tx.select().from(notificationOutbox).where(eq(notificationOutbox.bookingId, saved.id)));
    expect(queued.map((q) => q.template).sort()).toContain("booking.cancelled.dispatch");
  });

  it("refuses to cancel inside the 24-hour window", async () => {
    const reference = await book(`${marker}-alice@example.com`, { time: "13:00" });
    const saved = await row(reference);
    const nearlyThere = new Date(saved.startAt.getTime() - 23 * 3_600_000);
    expect(await cancelBooking(alice, reference, nearlyThere)).toEqual({ ok: false, error: "too_late" });
    expect((await row(reference)).status).toBe("pending");
  });

  it("refuses to cancel twice", async () => {
    const reference = await book(`${marker}-alice@example.com`, { time: "15:00" });
    await cancelBooking(alice, reference);
    expect(await cancelBooking(alice, reference)).toEqual({ ok: false, error: "not_allowed" });
  });

  it("cannot cancel another customer's booking", async () => {
    const [theirs] = await listCustomerBookings(bob);
    expect(await cancelBooking(alice, theirs.reference)).toEqual({ ok: false, error: "not_found" });
    expect((await row(theirs.reference)).status).toBe("pending");
  });
});

describe("rescheduling", () => {
  it("moves the booking and sends it back for confirmation", async () => {
    const reference = await book(`${marker}-alice@example.com`, { time: "09:00", date: addDays(today, 21) });
    await withActor({ role: "system" }, (tx) => tx.update(booking).set({ status: "confirmed" }).where(eq(booking.reference, reference)));
    const newDate = addDays(today, 22);
    expect(await rescheduleBooking(alice, reference, { date: newDate, time: "14:30" })).toEqual({ ok: true });
    const saved = await row(reference);
    expect(saved.status).toBe("pending");
    expect(saved.startAt.toISOString()).toBe(`${newDate}T10:30:00.000Z`);
    expect(saved.endAt.toISOString()).toBe(`${newDate}T12:30:00.000Z`);
    expect(saved.totalFils).toBe(14000);
  });

  it("rejects times outside the rules", async () => {
    const reference = await book(`${marker}-alice@example.com`, { time: "10:00", date: addDays(today, 23) });
    for (const slot of [
      { date: addDays(today, 23), time: "18:00" },
      { date: addDays(today, 23), time: "09:10" },
      { date: "2020-01-01", time: "09:00" },
      { date: addDays(today, 61), time: "09:00" },
      { date: "2026-13-45", time: "09:00" },
    ]) {
      expect(await rescheduleBooking(alice, reference, slot)).toEqual({ ok: false, error: "slot" });
    }
    expect(await rescheduleBooking(alice, reference, { date: "soon", time: "now" })).toEqual({ ok: false, error: "invalid" });
  });

  it("refuses a full slot but ignores the booking's own cleaners", async () => {
    const day = addDays(today, 30);
    const filler = await Promise.all(
      Array.from({ length: 4 }, () => book(`${marker}-filler@example.com`, { date: day, time: "10:00", cleaners: 10, hours: 2 })),
    );
    expect(filler).toHaveLength(4);
    // 40 of 50 cleaners are busy 10:00-12:00.
    const mine = await book(`${marker}-alice@example.com`, { date: day, time: "10:00", cleaners: 10, hours: 2 });
    const big = await book(`${marker}-alice@example.com`, { date: day, time: "14:00", cleaners: 10, hours: 2 });
    // Moving my own 10:00 booking to 10:30 still fits, because it no longer counts against itself.
    expect(await rescheduleBooking(alice, mine, { date: day, time: "10:30" })).toEqual({ ok: true });
    // Moving a different 10-cleaner booking into 10:00 would make 60, so it is refused.
    expect(await rescheduleBooking(alice, big, { date: day, time: "10:00" })).toEqual({ ok: false, error: "slot" });
    const slots = await getRescheduleSlots(alice, big, day);
    if (!slots.ok) throw new Error("slots failed");
    expect(slots.slots.find((s) => s.time === "10:00")!.available).toBe(false);
    expect(slots.slots.find((s) => s.time === "14:00")!.available).toBe(true);
  });

  it("refuses inside the 24-hour window and for other customers", async () => {
    const reference = await book(`${marker}-alice@example.com`, { time: "16:00", date: addDays(today, 24) });
    const saved = await row(reference);
    const late = new Date(saved.startAt.getTime() - 2 * 3_600_000);
    expect(await rescheduleBooking(alice, reference, { date: addDays(today, 25), time: "09:00" }, late)).toEqual({ ok: false, error: "too_late" });
    expect(await rescheduleBooking(bob, reference, { date: addDays(today, 25), time: "09:00" })).toEqual({ ok: false, error: "not_found" });
    expect(await getRescheduleSlots(bob, reference, addDays(today, 25))).toEqual({ ok: false, error: "not_found" });
  });
});

describe("quotes", () => {
  async function quoted(fils: number | null, status: "none" | "sent") {
    const reference = await book(`${marker}-alice@example.com`, { service: "plumbing", jobDetails: "Leaking pipe under the kitchen sink." });
    await withActor({ role: "system" }, (tx) => tx.update(booking).set({ quoteFils: fils, quoteStatus: status }).where(eq(booking.reference, reference)));
    return reference;
  }

  it("accepting sets the agreed price", async () => {
    const reference = await quoted(18000, "sent");
    expect(await respondToQuote(alice, reference, true)).toEqual({ ok: true });
    const saved = await row(reference);
    expect([saved.quoteStatus, saved.totalFils, saved.status]).toEqual(["accepted", 18000, "pending"]);
    expect(await respondToQuote(alice, reference, false)).toEqual({ ok: false, error: "not_allowed" });
  });

  it("declining cancels the request", async () => {
    const reference = await quoted(25000, "sent");
    expect(await respondToQuote(alice, reference, false)).toEqual({ ok: true });
    const saved = await row(reference);
    expect([saved.quoteStatus, saved.status]).toEqual(["declined", "cancelled"]);
  });

  it("cannot answer a quote that was never sent, or someone else's", async () => {
    expect(await respondToQuote(alice, await quoted(null, "none"), true)).toEqual({ ok: false, error: "not_allowed" });
    expect(await respondToQuote(bob, await quoted(9000, "sent"), true)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("saved addresses", () => {
  const address = { label: "Home", building: "Marina Tower", unit: "1203", area: "Dubai Marina", latitude: 25.08, longitude: 55.14 };

  it("adds, lists and removes the customer's own addresses", async () => {
    expect(await addAddress(alice, address)).toEqual({ ok: true });
    const [saved] = await listAddresses(alice);
    expect(saved.building).toBe("Marina Tower");
    expect(await listAddresses(bob)).toEqual([]);
    expect(await removeAddress(bob, saved.id)).toEqual({ ok: false, error: "not_found" });
    expect(await removeAddress(alice, saved.id)).toEqual({ ok: true });
    expect(await listAddresses(alice)).toEqual([]);
  });

  it("rejects bad addresses and pins outside Dubai", async () => {
    expect(await addAddress(alice, { ...address, building: "" })).toEqual({ ok: false, error: "invalid" });
    expect(await addAddress(alice, { ...address, latitude: 24.45, longitude: 54.37 })).toEqual({ ok: false, error: "invalid" });
    expect(await addAddress(alice, { ...address, userId: bob })).toEqual({ ok: true });
    const mine = await listAddresses(alice);
    expect(mine).toHaveLength(1);
    expect(await listAddresses(bob)).toEqual([]);
    await removeAddress(alice, mine[0].id);
  });

  it(`stops at ${MAX_ADDRESSES} addresses, even when added all at once`, async () => {
    const results = await Promise.all(Array.from({ length: MAX_ADDRESSES + 3 }, () => addAddress(bob, address)));
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_ADDRESSES);
    const rows = await withActor({ role: "system" }, (tx) => tx.select().from(customerAddress).where(eq(customerAddress.userId, bob)));
    expect(rows).toHaveLength(MAX_ADDRESSES);
  });
});

describe("profile and privacy", () => {
  it("updates name, phone and language, and normalises the phone", async () => {
    expect(await updateProfile(alice, { name: "Alice Updated", phone: "055 123 4567", locale: "ar" })).toEqual({ ok: true });
    const [saved] = await db.select().from(user).where(eq(user.id, alice));
    expect([saved.name, saved.phone, saved.locale, saved.role]).toEqual(["Alice Updated", "+971551234567", "ar", "customer"]);
  });

  it("rejects invalid details and ignores attempts to change role or email", async () => {
    expect(await updateProfile(alice, { name: "A", phone: "", locale: "en" })).toEqual({ ok: false, error: "invalid" });
    expect(await updateProfile(alice, { name: "Alice", phone: "+44 7700 900123", locale: "en" })).toEqual({ ok: false, error: "invalid" });
    await updateProfile(alice, { name: "Alice", phone: "", locale: "en", role: "super_admin", email: "x@example.com" });
    const [saved] = await db.select().from(user).where(eq(user.id, alice));
    expect([saved.role, saved.email, saved.phone]).toEqual(["customer", `${marker}-alice@example.com`, null]);
  });

  it("records a deletion request once and logs it", async () => {
    expect(await requestDeletion(bob)).toEqual({ ok: true });
    const [first] = await db.select().from(user).where(eq(user.id, bob));
    expect(first.deletionRequestedAt).not.toBeNull();
    await requestDeletion(bob);
    const [second] = await db.select().from(user).where(eq(user.id, bob));
    expect(second.deletionRequestedAt!.getTime()).toBe(first.deletionRequestedAt!.getTime());
    const logged = await withActor({ role: "super_admin", userId: bob }, (tx) => tx.select().from(auditLog).where(eq(auditLog.entityId, bob)));
    expect(logged.map((l) => l.action)).toEqual(["account.deletion_requested"]);
  });
});
