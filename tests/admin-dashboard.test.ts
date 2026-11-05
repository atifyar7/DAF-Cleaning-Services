import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { db, withActor } from "@/db";
import {
  auditLog,
  booking,
  bookingAssignment,
  bookingEvent,
  bookingNote,
  cleaner,
  customerAddress,
  enquiry,
  notificationOutbox,
  session,
  user,
} from "@/db/schema";
import {
  addNote,
  assignCleaners,
  attentionCounts,
  changeStatus,
  cleanersForBooking,
  daySchedule,
  getAdminBooking,
  listBookings,
  sendQuote,
  staffReschedule,
  updatePayment,
} from "@/lib/admin/bookings";
import { createCleaner, listCleaners, updateCleaner } from "@/lib/admin/cleaners";
import { eraseCustomer, getCustomer, listCustomers } from "@/lib/admin/customers";
import { listEnquiries, setEnquiryHandled } from "@/lib/admin/enquiries";
import {
  availableActions,
  isValidPayment,
  overlaps,
  parseAed,
  statusAfterAssignment,
  transition,
} from "@/lib/admin/workflow";
import { addAddress, requestDeletion, respondToQuote } from "@/lib/booking/customer";
import { placeBooking } from "@/lib/booking/server";
import { addDays, dubaiDate } from "@/lib/booking/time";
import { limits, reset } from "@/lib/rate-limit";

const marker = `adm-${randomUUID().slice(0, 8)}`;
const today = dubaiDate(new Date());
const adminId = randomUUID();
const staff = { role: "admin" as const, userId: adminId };
const ip = "203.0.113.9";
const erased: string[] = [];

async function book(email: string, change: Record<string, unknown> = {}) {
  await reset(limits.bookingPerEmail, email);
  const result = await placeBooking(
    {
      service: "general-cleaning",
      frequency: "one_time",
      cleaners: 2,
      hours: 2,
      addOns: [],
      jobDetails: "",
      date: addDays(today, 41),
      time: "09:00",
      terms: true,
      locale: "en",
      details: { name: "Admin Test", phone: "0501234567", email, whatsapp: true, building: "Tower", unit: "7", area: "JLT", notes: "", latitude: null, longitude: null },
      ...change,
    },
    { ip: randomUUID() },
  );
  if (!result.ok) throw new Error(`booking failed: ${result.error}`);
  return result.reference;
}

const customerEmail = (name: string) => `${marker}-${name}@example.com`;
const row = async (reference: string) =>
  (await withActor({ role: "system" }, (tx) => tx.select().from(booking).where(eq(booking.reference, reference))))[0];
const userIdOf = async (email: string) => (await db.select({ id: user.id }).from(user).where(eq(user.email, email)))[0].id;

async function newCleaner(name: string) {
  expect(await createCleaner(staff, { name: `${marker} ${name}`, phone: "" }, ip)).toEqual({ ok: true });
  const [found] = await withActor(staff, (tx) => tx.select().from(cleaner).where(eq(cleaner.name, `${marker} ${name}`)));
  return found.id;
}

async function confirmed(change: Record<string, unknown> = {}) {
  const reference = await book(customerEmail("team"), change);
  expect(await changeStatus(staff, reference, "confirm", undefined, ip)).toEqual({ ok: true });
  return reference;
}

beforeAll(async () => {
  await db.insert(user).values({ id: adminId, name: "Test Admin", email: `${marker}-admin@example.com`, role: "admin" });
});

afterAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.role', 'system', true)");
  const bookings = `select id from booking where contact_email like $1 or customer_id = any($2)`;
  await owner.query(`delete from notification_outbox where booking_id in (${bookings}) or payload->>'userId' = any($2)`, [`${marker}%`, erased]);
  await owner.query(`delete from booking where id in (${bookings})`, [`${marker}%`, erased]);
  await owner.query("delete from cleaner where name like $1", [`${marker}%`]);
  await owner.query("delete from enquiry where email like $1", [`${marker}%`]);
  await owner.query(`delete from "user" where email like $1 or id = any($2)`, [`${marker}%`, erased]);
  await owner.query("commit");
  await owner.end();
});

describe("workflow rules", () => {
  const base = { quoteRequired: false, quoteStatus: "none", assigned: 0 };

  it("allows only the next sensible step", () => {
    expect(transition("confirm", { ...base, status: "pending" })).toEqual({ ok: true, to: "confirmed" });
    expect(transition("confirm", { ...base, status: "confirmed" })).toEqual({ ok: false, error: "not_allowed" });
    expect(transition("start", { ...base, status: "assigned", assigned: 2 })).toEqual({ ok: true, to: "in_progress" });
    expect(transition("start", { ...base, status: "assigned" })).toEqual({ ok: false, error: "team_needed" });
    expect(transition("complete", { ...base, status: "in_progress" })).toEqual({ ok: true, to: "completed" });
    expect(transition("complete", { ...base, status: "assigned" })).toEqual({ ok: false, error: "not_allowed" });
    for (const status of ["in_progress", "completed", "cancelled"] as const) {
      expect(transition("cancel", { ...base, status })).toEqual({ ok: false, error: "not_allowed" });
    }
    expect(availableActions({ ...base, status: "pending" })).toEqual(["confirm", "cancel"]);
    expect(availableActions({ ...base, status: "completed" })).toEqual([]);
  });

  it("needs an accepted quote before a quote job is confirmed", () => {
    expect(transition("confirm", { ...base, status: "pending", quoteRequired: true, quoteStatus: "sent" })).toEqual({ ok: false, error: "quote_needed" });
    expect(transition("confirm", { ...base, status: "pending", quoteRequired: true, quoteStatus: "accepted" }).ok).toBe(true);
  });

  it("moves between confirmed and assigned with the team", () => {
    expect(statusAfterAssignment("confirmed", 2)).toBe("assigned");
    expect(statusAfterAssignment("assigned", 0)).toBe("confirmed");
    expect(statusAfterAssignment("in_progress", 0)).toBe("in_progress");
  });

  it("reads quote amounts strictly", () => {
    expect(parseAed("180")).toBe(18000);
    expect(parseAed(" 180.5 ")).toBe(18050);
    expect(parseAed("99.99")).toBe(9999);
    for (const bad of ["", "0", "-5", "1e3", "12.345", "abc", "1,000", "9999999"]) expect(parseAed(bad)).toBeNull();
  });

  it("checks payment combinations and time overlaps", () => {
    expect(isValidPayment("cash", "link_sent", "unpaid")).toBe(false);
    expect(isValidPayment("card_link", "link_sent", "unpaid")).toBe(true);
    expect(isValidPayment("cash", "refunded", "unpaid")).toBe(false);
    expect(isValidPayment("cash", "refunded", "paid")).toBe(true);
    const at = (h: number) => new Date(Date.UTC(2027, 0, 1, h));
    expect(overlaps({ startAt: at(9), endAt: at(11) }, { startAt: at(10), endAt: at(12) })).toBe(true);
    expect(overlaps({ startAt: at(9), endAt: at(11) }, { startAt: at(11), endAt: at(12) })).toBe(false);
  });
});

describe("booking status changes", () => {
  it("confirms, records history and an audit entry, and queues the customer's messages", async () => {
    const reference = await book(customerEmail("flow"));
    expect(await changeStatus(staff, reference, "confirm", undefined, ip)).toEqual({ ok: true });
    const saved = await row(reference);
    expect(saved.status).toBe("confirmed");
    const events = await withActor(staff, (tx) => tx.select().from(bookingEvent).where(eq(bookingEvent.bookingId, saved.id)));
    expect(events.map((e) => [e.toStatus, e.actorId])).toEqual([["pending", expect.any(String)], ["confirmed", adminId]]);
    const queued = await withActor(staff, (tx) => tx.select().from(notificationOutbox).where(eq(notificationOutbox.bookingId, saved.id)));
    expect(queued.filter((q) => q.template === "booking.confirmed").map((q) => q.channel).sort()).toEqual(["email", "whatsapp"]);
    const logged = await withActor({ role: "super_admin", userId: adminId }, (tx) => tx.select().from(auditLog).where(eq(auditLog.entityId, saved.id)));
    expect(logged.map((l) => [l.action, l.actorId, l.ipAddress])).toEqual([["booking.confirm", adminId, ip]]);
  });

  it("refuses to cancel without a reason, and keeps the reason it was given", async () => {
    const reference = await book(customerEmail("flow"), { time: "11:00" });
    expect(await changeStatus(staff, reference, "cancel", "", ip)).toEqual({ ok: false, error: "invalid" });
    expect(await changeStatus(staff, reference, "cancel", "Customer called to cancel", ip)).toEqual({ ok: true });
    const saved = await row(reference);
    expect([saved.status, saved.cancelReason]).toEqual(["cancelled", "Customer called to cancel"]);
    expect(await changeStatus(staff, reference, "confirm", undefined, ip)).toEqual({ ok: false, error: "not_allowed" });
  });

  it("returns not found for unknown bookings", async () => {
    expect(await changeStatus(staff, "DAF-ZZZZZZZZ", "confirm", undefined, ip)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("quotes", () => {
  const quoteJob = () => book(customerEmail("quote"), { service: "plumbing", jobDetails: "Leaking pipe under the kitchen sink." });

  it("sends a quote the customer can accept, then the job can be confirmed", async () => {
    const reference = await quoteJob();
    expect(await changeStatus(staff, reference, "confirm", undefined, ip)).toEqual({ ok: false, error: "quote_needed" });
    expect(await sendQuote(staff, reference, "abc", ip)).toEqual({ ok: false, error: "invalid" });
    expect(await sendQuote(staff, reference, "150", ip)).toEqual({ ok: true });
    // A revised quote replaces the first while the customer has not answered.
    expect(await sendQuote(staff, reference, "175.50", ip)).toEqual({ ok: true });
    const customer = await userIdOf(customerEmail("quote"));
    expect(await respondToQuote(customer, reference, true)).toEqual({ ok: true });
    expect(await sendQuote(staff, reference, "200", ip)).toEqual({ ok: false, error: "not_allowed" });
    expect(await changeStatus(staff, reference, "confirm", undefined, ip)).toEqual({ ok: true });
    const saved = await row(reference);
    expect([saved.quoteFils, saved.totalFils, saved.status]).toEqual([17550, 17550, "confirmed"]);
  });

  it("cannot quote an hourly booking", async () => {
    expect(await sendQuote(staff, await book(customerEmail("quote"), { time: "13:00" }), "100", ip)).toEqual({ ok: false, error: "not_allowed" });
  });
});

describe("assigning cleaners", () => {
  it("needs a confirmed booking, then moves it to assigned and back", async () => {
    const pending = await book(customerEmail("team"), { date: addDays(today, 42) });
    const amira = await newCleaner("Amira");
    expect(await assignCleaners(staff, pending, [amira], ip)).toEqual({ ok: false, error: "not_allowed" });

    const reference = await confirmed({ date: addDays(today, 42), time: "11:00" });
    expect(await assignCleaners(staff, reference, [amira], ip)).toEqual({ ok: true });
    expect((await row(reference)).status).toBe("assigned");
    const detail = await getAdminBooking(staff, reference);
    expect(detail!.team.map((t) => t.id)).toEqual([amira]);
    expect(await assignCleaners(staff, reference, [], ip)).toEqual({ ok: true });
    expect((await row(reference)).status).toBe("confirmed");
  });

  it("will not put a cleaner on two jobs at the same time", async () => {
    const day = addDays(today, 43);
    const sara = await newCleaner("Sara");
    const first = await confirmed({ date: day, time: "10:00" });
    const overlapping = await confirmed({ date: day, time: "11:00" });
    const later = await confirmed({ date: day, time: "12:00" });
    expect(await assignCleaners(staff, first, [sara], ip)).toEqual({ ok: true });
    expect(await assignCleaners(staff, overlapping, [sara], ip)).toEqual({ ok: false, error: "cleaner_busy" });
    // 10:00-12:00 and 12:00-14:00 only touch, so the same cleaner can do both.
    expect(await assignCleaners(staff, later, [sara], ip)).toEqual({ ok: true });
    const options = await cleanersForBooking(staff, overlapping);
    expect([first, later]).toContain(options.find((c) => c.id === sara)!.busyWith);
  });

  it("lets only one of two simultaneous assignments of the same cleaner win", async () => {
    const day = addDays(today, 44);
    const noor = await newCleaner("Noor");
    const a = await confirmed({ date: day, time: "10:00" });
    const b = await confirmed({ date: day, time: "10:30" });
    const results = await Promise.all([assignCleaners(staff, a, [noor], ip), assignCleaners(staff, b, [noor], ip)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("rejects unknown, repeated and inactive cleaners", async () => {
    const reference = await confirmed({ date: addDays(today, 45) });
    const idle = await newCleaner("Idle");
    expect(await updateCleaner(staff, idle, { name: `${marker} Idle`, phone: "", active: false }, ip)).toEqual({ ok: true });
    expect(await assignCleaners(staff, reference, [idle], ip)).toEqual({ ok: false, error: "cleaner_inactive" });
    expect(await assignCleaners(staff, reference, [randomUUID()], ip)).toEqual({ ok: false, error: "cleaner_inactive" });
    expect(await assignCleaners(staff, reference, [idle, idle], ip)).toEqual({ ok: false, error: "invalid" });
    expect(await assignCleaners(staff, reference, ["not-a-uuid"], ip)).toEqual({ ok: false, error: "invalid" });
  });

  it("starts only with a team, then completes", async () => {
    const reference = await confirmed({ date: addDays(today, 46) });
    expect(await changeStatus(staff, reference, "start", undefined, ip)).toEqual({ ok: false, error: "not_allowed" });
    await assignCleaners(staff, reference, [await newCleaner("Huda")], ip);
    expect(await changeStatus(staff, reference, "start", undefined, ip)).toEqual({ ok: true });
    expect(await changeStatus(staff, reference, "cancel", "Too late to cancel", ip)).toEqual({ ok: false, error: "not_allowed" });
    expect(await changeStatus(staff, reference, "complete", undefined, ip)).toEqual({ ok: true });
    expect((await row(reference)).status).toBe("completed");
  });
});

describe("rescheduling by the team", () => {
  it("moves the booking, keeps its status and checks the team is free", async () => {
    const day = addDays(today, 47);
    const lina = await newCleaner("Lina");
    const blocker = await confirmed({ date: day, time: "14:00" });
    await assignCleaners(staff, blocker, [lina], ip);
    const reference = await confirmed({ date: day, time: "09:00" });
    await assignCleaners(staff, reference, [lina], ip);

    expect(await staffReschedule(staff, reference, { date: day, time: "13:30" }, ip)).toEqual({ ok: false, error: "cleaner_busy" });
    expect(await staffReschedule(staff, reference, { date: day, time: "18:00" }, ip)).toEqual({ ok: false, error: "slot" });
    expect(await staffReschedule(staff, reference, { date: day, time: "11:00" }, ip)).toEqual({ ok: true });
    const saved = await row(reference);
    expect([saved.status, saved.startAt.toISOString()]).toEqual(["assigned", `${day}T07:00:00.000Z`]);
  });
});

describe("payments and notes", () => {
  it("records payment changes and refuses impossible ones", async () => {
    const reference = await book(customerEmail("pay"), { date: addDays(today, 48) });
    expect(await updatePayment(staff, reference, { method: "cash", status: "link_sent" }, ip)).toEqual({ ok: false, error: "invalid" });
    expect(await updatePayment(staff, reference, { method: "cash", status: "refunded" }, ip)).toEqual({ ok: false, error: "invalid" });
    expect(await updatePayment(staff, reference, { method: "card_link", status: "link_sent" }, ip)).toEqual({ ok: true });
    expect(await updatePayment(staff, reference, { method: "card_link", status: "paid" }, ip)).toEqual({ ok: true });
    expect(await updatePayment(staff, reference, { method: "bitcoin", status: "paid" }, ip)).toEqual({ ok: false, error: "invalid" });
    const saved = await row(reference);
    expect([saved.paymentMethod, saved.paymentStatus]).toEqual(["card_link", "paid"]);
  });

  it("keeps internal notes away from customers", async () => {
    const reference = await book(customerEmail("notes"), { date: addDays(today, 48), time: "12:00" });
    expect(await addNote(staff, reference, "   ", ip)).toEqual({ ok: false, error: "invalid" });
    expect(await addNote(staff, reference, "Gate code 4411. Customer prefers Arabic.", ip)).toEqual({ ok: true });
    expect((await getAdminBooking(staff, reference))!.notes.map((n) => [n.body, n.authorName])).toEqual([["Gate code 4411. Customer prefers Arabic.", "Test Admin"]]);
    const customer = await userIdOf(customerEmail("notes"));
    const seen = await withActor({ role: "customer", userId: customer }, (tx) => tx.select().from(bookingNote));
    expect(seen).toEqual([]);
    const saved = await row(reference);
    await expect(
      withActor({ role: "customer", userId: customer }, (tx) => tx.insert(bookingNote).values({ bookingId: saved.id, body: "sneaky" })),
    ).rejects.toThrow();
  });
});

describe("lists and schedule", () => {
  it("searches safely and filters by status", async () => {
    const reference = await book(customerEmail("search"), { date: addDays(today, 49) });
    const found = await listBookings(staff, { q: reference });
    expect(found.rows.map((r) => r.reference)).toEqual([reference]);
    expect((await listBookings(staff, { q: `${marker}-search` })).total).toBe(1);
    // A wildcard typed by staff matches literally, not everything.
    expect((await listBookings(staff, { q: "%%%" })).total).toBe(0);
    const pending = await listBookings(staff, { status: "pending", date: addDays(today, 49) });
    expect(pending.rows.every((r) => r.status === "pending")).toBe(true);
    const ignored = await listBookings(staff, { status: "drop table", page: -4 });
    expect([ignored.filters.status, ignored.page]).toEqual([undefined, 1]);
  });

  it("shows a day's jobs with their team and cleaner load", async () => {
    const day = addDays(today, 50);
    const reference = await confirmed({ date: day, time: "10:00", cleaners: 3 });
    await assignCleaners(staff, reference, [await newCleaner("Rana")], ip);
    const schedule = await daySchedule(staff, day);
    const job = schedule.bookings.find((b) => b.reference === reference)!;
    expect(job.team).toEqual([`${marker} Rana`]);
    expect(schedule.load.find((l) => l.minutes === 10 * 60)!.used).toBeGreaterThanOrEqual(3);
    expect(schedule.load.find((l) => l.minutes === 9 * 60)!.used).toBe(0);
    expect(schedule.capacity).toBe(50);
    const counts = await attentionCounts(staff);
    expect(counts.review).toBeGreaterThan(0);
  });
});

describe("cleaners", () => {
  it("validates details and blocks deactivating someone with upcoming jobs", async () => {
    expect(await createCleaner(staff, { name: "X", phone: "" }, ip)).toEqual({ ok: false, error: "invalid" });
    expect(await createCleaner(staff, { name: `${marker} Bad Phone`, phone: "12345" }, ip)).toEqual({ ok: false, error: "invalid" });
    expect(await createCleaner(staff, { name: `${marker} Maya`, phone: "050 111 2233" }, ip)).toEqual({ ok: true });
    const maya = (await listCleaners(staff)).find((c) => c.name === `${marker} Maya`)!;
    expect(maya.phone).toBe("+971501112233");

    const reference = await confirmed({ date: addDays(today, 51) });
    await assignCleaners(staff, reference, [maya.id], ip);
    expect(await updateCleaner(staff, maya.id, { name: maya.name, phone: "", active: false }, ip)).toEqual({ ok: false, error: "has_open_bookings" });
    expect((await listCleaners(staff)).find((c) => c.id === maya.id)!.upcoming).toBe(1);
    await assignCleaners(staff, reference, [], ip);
    expect(await updateCleaner(staff, maya.id, { name: maya.name, phone: "", active: false }, ip)).toEqual({ ok: true });
  });

  it("are hidden from customers", async () => {
    const customer = await userIdOf(customerEmail("team"));
    expect(await withActor({ role: "customer", userId: customer }, (tx) => tx.select().from(cleaner))).toEqual([]);
  });
});

describe("customer deletion", () => {
  it("only completes a request the customer made, once their bookings are finished", async () => {
    const email = customerEmail("erase");
    const reference = await book(email, { date: addDays(today, 52) });
    const id = await userIdOf(email);
    erased.push(id);
    await addAddress(id, { label: "Home", building: "Villa 9", unit: "9", area: "Mirdif", latitude: null, longitude: null });

    expect(await eraseCustomer(staff, id, ip)).toEqual({ ok: false, error: "not_allowed" });
    await requestDeletion(id);
    expect((await listCustomers(staff, { view: "deletion" })).rows.map((r) => r.id)).toContain(id);
    expect(await eraseCustomer(staff, id, ip)).toEqual({ ok: false, error: "has_open_bookings" });
    expect((await getCustomer(staff, id))!.openBookings).toBe(1);

    await changeStatus(staff, reference, "cancel", "Customer is leaving Dubai", ip);
    expect(await eraseCustomer(staff, id, ip)).toEqual({ ok: true });

    const [gone] = await db.select().from(user).where(eq(user.id, id));
    expect([gone.name, gone.email, gone.phone, gone.disabledAt === null]).toEqual(["Deleted customer", `deleted-${id}@deleted.invalid`, null, false]);
    const kept = await row(reference);
    expect([kept.contactName, kept.contactEmail, kept.building, kept.status]).toEqual(["Deleted customer", `deleted-${id}@deleted.invalid`, "Removed", "cancelled"]);
    expect(await withActor(staff, (tx) => tx.select().from(customerAddress).where(eq(customerAddress.userId, id)))).toEqual([]);
    expect(await db.select().from(session).where(eq(session.userId, id))).toEqual([]);
    const pendingMail = await withActor(staff, (tx) => tx.select().from(notificationOutbox).where(eq(notificationOutbox.bookingId, kept.id)));
    expect(pendingMail.every((m) => m.status !== "pending" && !m.recipient.includes(marker))).toBe(true);
    const logged = await withActor({ role: "super_admin", userId: adminId }, (tx) => tx.select().from(auditLog).where(eq(auditLog.entityId, id)));
    expect(logged.map((l) => l.action)).toContain("customer.erased");
    expect(JSON.stringify(logged)).not.toContain(marker);
    expect(await eraseCustomer(staff, id, ip)).toEqual({ ok: false, error: "not_allowed" });
  });

  it("never touches staff accounts", async () => {
    await db.update(user).set({ deletionRequestedAt: new Date() }).where(eq(user.id, adminId));
    expect(await eraseCustomer(staff, adminId, ip)).toEqual({ ok: false, error: "not_found" });
    await db.update(user).set({ deletionRequestedAt: null }).where(eq(user.id, adminId));
  });
});

describe("enquiries", () => {
  it("are marked handled and reopened", async () => {
    await withActor({ role: "anonymous" }, (tx) =>
      tx.insert(enquiry).values({ kind: "contact", name: "Enquirer", phone: "0501234567", email: `${marker}-enq@example.com`, message: "Do you clean offices on Fridays?" }),
    );
    const open = await listEnquiries(staff, { view: "open", q: marker });
    expect(open.rows).toHaveLength(1);
    const id = open.rows[0].id;
    expect(await setEnquiryHandled(staff, id, true, ip)).toEqual({ ok: true });
    expect((await listEnquiries(staff, { view: "open", q: marker })).rows).toHaveLength(0);
    expect((await listEnquiries(staff, { view: "handled", q: marker })).rows).toHaveLength(1);
    expect(await setEnquiryHandled(staff, id, false, ip)).toEqual({ ok: true });
    expect(await setEnquiryHandled(staff, randomUUID(), true, ip)).toEqual({ ok: false, error: "not_found" });
    expect(await setEnquiryHandled(staff, id, "yes", ip)).toEqual({ ok: false, error: "invalid" });
  });
});

describe("assignment records", () => {
  it("note who assigned each cleaner", async () => {
    const reference = await confirmed({ date: addDays(today, 53) });
    const omar = await newCleaner("Omar");
    await assignCleaners(staff, reference, [omar], ip);
    const saved = await row(reference);
    const [assignment] = await withActor(staff, (tx) => tx.select().from(bookingAssignment).where(inArray(bookingAssignment.bookingId, [saved.id])));
    expect([assignment.cleanerId, assignment.assignedBy]).toEqual([omar, adminId]);
  });
});
