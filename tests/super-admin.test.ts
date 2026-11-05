import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { db, withActor } from "@/db";
import { account, auditLog, booking, passkey, service, session, setting, twoFactor, user } from "@/db/schema";
import { getBookingSettings, getFreeChangeHours, placeBooking } from "@/lib/booking/server";
import { addDays, dubaiDate } from "@/lib/booking/time";
import { verifyPassword } from "@/lib/password";
import { limits, reset } from "@/lib/rate-limit";
import { listAudit } from "@/lib/super-admin/audit";
import { getCatalogForEditing, updateService } from "@/lib/super-admin/catalog";
import { bucketFor, change, csvCell, exportBookingsCsv, getReport, parseRange, previousRange } from "@/lib/super-admin/reports";
import { getBusinessSettings, updateBusinessSettings } from "@/lib/super-admin/settings";
import {
  changeStaffRole,
  createStaff,
  listStaff,
  resetStaffPassword,
  resetStaffTwoFactor,
  setStaffDisabled,
} from "@/lib/super-admin/staff";

const marker = `sa-${randomUUID().slice(0, 8)}`;
const ownerId = randomUUID();
const owner = { role: "super_admin" as const, userId: ownerId };
const ip = "198.51.100.7";
const today = dubaiDate(new Date());
let savedSettings: { key: string; value: unknown }[] = [];
let savedServices: (typeof service.$inferSelect)[] = [];

const email = (name: string) => `${marker}-${name}@example.com`;
const idOf = async (address: string) => (await db.select({ id: user.id }).from(user).where(eq(user.email, address)))[0].id;

async function newStaff(name: string, role: "admin" | "super_admin") {
  const result = await createStaff(owner, { name: `Staff ${name}`, email: email(name), role }, ip);
  if (!result.ok) throw new Error(result.error);
  return { id: await idOf(email(name)), password: result.password! };
}

beforeAll(async () => {
  await db.insert(user).values({ id: ownerId, name: "Test Owner", email: email("owner"), role: "super_admin", twoFactorEnabled: true });
  savedSettings = await db.select({ key: setting.key, value: setting.value }).from(setting);
  savedServices = await db.select().from(service);
});

afterAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.role', 'system', true)");
  // Put back every price and setting these tests touched.
  for (const s of savedServices) {
    await owner.query("update service set name_en = $2, name_ar = $3, pricing_model = $4, price_fils = $5, active = $6, sort_order = $7 where id = $1", [
      s.id, s.nameEn, s.nameAr, s.pricingModel, s.priceFils, s.active, s.sortOrder,
    ]);
  }
  await owner.query("delete from setting");
  for (const s of savedSettings) await owner.query("insert into setting (key, value) values ($1, $2)", [s.key, JSON.stringify(s.value)]);
  await owner.query("delete from notification_outbox where booking_id in (select id from booking where contact_email like $1)", [`${marker}%`]);
  await owner.query("delete from booking where contact_email like $1", [`${marker}%`]);
  await owner.query(`delete from "user" where email like $1`, [`${marker}%`]);
  await owner.query("commit");
  await owner.end();
});

describe("staff accounts", () => {
  it("creates staff with a one-time password that works, and refuses a taken email", async () => {
    const { id, password } = await newStaff("ali", "admin");
    expect(password.length).toBeGreaterThanOrEqual(20);
    const [cred] = await db.select().from(account).where(eq(account.userId, id));
    expect(await verifyPassword({ hash: cred.password!, password })).toBe(true);
    expect(await createStaff(owner, { name: "Again", email: email("ali").toUpperCase(), role: "admin" }, ip)).toEqual({ ok: false, error: "email_taken" });
    expect(await createStaff(owner, { name: "X", email: "not-an-email", role: "admin" }, ip)).toEqual({ ok: false, error: "invalid" });
    expect(await createStaff(owner, { name: "Bad Role", email: email("bad"), role: "customer" }, ip)).toEqual({ ok: false, error: "invalid" });
    const listed = (await listStaff(owner)).find((s) => s.id === id)!;
    expect([listed.role, listed.twoFactorEnabled, listed.disabledAt]).toEqual(["admin", false, null]);
  });

  it("disables someone, signs them out everywhere, and enables them again", async () => {
    const { id } = await newStaff("sara", "admin");
    await db.insert(session).values({ id: randomUUID(), token: randomUUID(), userId: id, expiresAt: new Date(Date.now() + 3_600_000) });
    expect(await setStaffDisabled(owner, id, true, ip)).toEqual({ ok: true });
    expect((await db.select().from(user).where(eq(user.id, id)))[0].disabledAt).not.toBeNull();
    expect(await db.select().from(session).where(eq(session.userId, id))).toEqual([]);
    expect(await setStaffDisabled(owner, id, false, ip)).toEqual({ ok: true });
    expect((await db.select().from(user).where(eq(user.id, id)))[0].disabledAt).toBeNull();
  });

  it("never lets an owner change their own access", async () => {
    expect(await setStaffDisabled(owner, ownerId, true, ip)).toEqual({ ok: false, error: "self" });
    expect(await changeStaffRole(owner, ownerId, "admin", ip)).toEqual({ ok: false, error: "self" });
    expect(await resetStaffTwoFactor(owner, ownerId, ip)).toEqual({ ok: false, error: "self" });
    expect(await resetStaffPassword(owner, ownerId, ip)).toEqual({ ok: false, error: "self" });
  });

  it("keeps at least one active Super Admin", async () => {
    // An owner whose own account was disabled mid-session cannot remove the only other owner.
    const ghostId = randomUUID();
    await db.insert(user).values({ id: ghostId, name: "Ghost", email: email("ghost"), role: "super_admin", disabledAt: new Date() });
    const ghost = { role: "super_admin" as const, userId: ghostId };
    // Briefly leave the test owner as the only active Super Admin, then restore exactly who was active.
    const active = (await db.select({ id: user.id, disabledAt: user.disabledAt }).from(user).where(eq(user.role, "super_admin")))
      .filter((u) => !u.disabledAt && u.id !== ownerId)
      .map((u) => u.id);
    if (active.length) await db.update(user).set({ disabledAt: new Date() }).where(inArray(user.id, active));
    try {
      expect(await setStaffDisabled(ghost, ownerId, true, ip)).toEqual({ ok: false, error: "last_owner" });
      expect(await changeStaffRole(ghost, ownerId, "admin", ip)).toEqual({ ok: false, error: "last_owner" });
    } finally {
      if (active.length) await db.update(user).set({ disabledAt: null }).where(inArray(user.id, active));
    }
  });

  it("changes roles, and a demoted owner loses their passkeys", async () => {
    const { id } = await newStaff("noor", "super_admin");
    await db.insert(passkey).values({ id: randomUUID(), publicKey: "k", userId: id, credentialID: randomUUID(), counter: 0, deviceType: "singleDevice", backedUp: false });
    expect(await changeStaffRole(owner, id, "admin", ip)).toEqual({ ok: true });
    expect((await db.select().from(user).where(eq(user.id, id)))[0].role).toBe("admin");
    expect(await db.select().from(passkey).where(eq(passkey.userId, id))).toEqual([]);
    expect(await changeStaffRole(owner, id, "customer", ip)).toEqual({ ok: false, error: "invalid" });
  });

  it("resets a password and an authenticator", async () => {
    const { id, password } = await newStaff("huda", "admin");
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, id));
    await db.insert(twoFactor).values({ id: randomUUID(), secret: "s", backupCodes: "b", userId: id });
    const reset1 = await resetStaffPassword(owner, id, ip);
    if (!reset1.ok) throw new Error(reset1.error);
    const [cred] = await db.select().from(account).where(eq(account.userId, id));
    expect(await verifyPassword({ hash: cred.password!, password: reset1.password! })).toBe(true);
    expect(await verifyPassword({ hash: cred.password!, password })).toBe(false);
    expect(await resetStaffTwoFactor(owner, id, ip)).toEqual({ ok: true });
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, id))).toEqual([]);
    expect((await db.select().from(user).where(eq(user.id, id)))[0].twoFactorEnabled).toBe(false);
  });

  it("cannot be used on customer accounts", async () => {
    const customerId = randomUUID();
    await db.insert(user).values({ id: customerId, name: "Cust", email: email("cust"), role: "customer" });
    for (const result of [
      await setStaffDisabled(owner, customerId, true, ip),
      await changeStaffRole(owner, customerId, "super_admin", ip),
      await resetStaffPassword(owner, customerId, ip),
    ]) {
      expect(result).toEqual({ ok: false, error: "not_found" });
    }
    expect((await db.select().from(user).where(eq(user.id, customerId)))[0].role).toBe("customer");
  });

  it("records every change in the audit log", async () => {
    const { id } = await newStaff("audit", "admin");
    await setStaffDisabled(owner, id, true, ip);
    const logged = await withActor(owner, (tx) => tx.select().from(auditLog).where(eq(auditLog.entityId, id)));
    expect(logged.map((l) => [l.action, l.actorId, l.ipAddress]).sort()).toEqual([
      ["staff.created", ownerId, ip],
      ["staff.disabled", ownerId, ip],
    ]);
    // The log never holds the password.
    expect(JSON.stringify(logged)).not.toMatch(/password":/);
  });
});

describe("services and prices", () => {
  const general = async () => (await getCatalogForEditing(owner)).services.find((s) => s.slug === "general-cleaning")!;

  it("changes the hourly price, and only the Super Admin can", async () => {
    const before = await general();
    const input = { nameEn: before.nameEn, nameAr: before.nameAr, pricingModel: "hourly", price: "42.50", active: true, sortOrder: before.sortOrder };
    expect(await updateService(owner, before.id, input, ip)).toEqual({ ok: true });
    expect((await general()).priceFils).toBe(4250);
    // An Admin is refused by the database itself, even if the app's check were skipped.
    expect(await updateService({ role: "admin", userId: ownerId }, before.id, { ...input, price: "1" }, ip)).toEqual({ ok: false, error: "not_found" });
    expect((await general()).priceFils).toBe(4250);
  });

  it("switches between hourly and quote, and needs a price for hourly", async () => {
    const before = await general();
    const base = { nameEn: before.nameEn, nameAr: before.nameAr, active: true, sortOrder: before.sortOrder };
    expect(await updateService(owner, before.id, { ...base, pricingModel: "hourly", price: "" }, ip)).toEqual({ ok: false, error: "invalid" });
    expect(await updateService(owner, before.id, { ...base, pricingModel: "fixed", price: "50" }, ip)).toEqual({ ok: false, error: "invalid" });
    expect(await updateService(owner, before.id, { ...base, pricingModel: "quote", price: "50" }, ip)).toEqual({ ok: true });
    expect((await general()).priceFils).toBeNull();
    expect(await updateService(owner, before.id, { ...base, pricingModel: "hourly", price: "35" }, ip)).toEqual({ ok: true });
    expect(await updateService(owner, randomUUID(), { ...base, pricingModel: "hourly", price: "35" }, ip)).toEqual({ ok: false, error: "not_found" });
  });

  it("does not change the price of bookings already made", async () => {
    const before = await general();
    await reset(limits.bookingPerEmail, email("price"));
    const made = await placeBooking(
      {
        service: "general-cleaning", frequency: "one_time", cleaners: 1, hours: 2, addOns: [], jobDetails: "",
        date: addDays(today, 30), time: "09:00", terms: true, locale: "en",
        details: { name: "Price Test", phone: "0501234567", email: email("price"), whatsapp: false, building: "B", unit: "1", area: "JLT", notes: "", latitude: null, longitude: null },
      },
      { ip: randomUUID() },
    );
    if (!made.ok) throw new Error(made.error);
    const totalBefore = (await withActor(owner, (tx) => tx.select().from(booking).where(eq(booking.reference, made.reference))))[0].totalFils;
    await updateService(owner, before.id, { nameEn: before.nameEn, nameAr: before.nameAr, pricingModel: "hourly", price: "99", active: true, sortOrder: before.sortOrder }, ip);
    const totalAfter = (await withActor(owner, (tx) => tx.select().from(booking).where(eq(booking.reference, made.reference))))[0].totalFils;
    expect(totalAfter).toBe(totalBefore);
  });
});

describe("business settings", () => {
  it("rejects combinations that would make booking impossible", async () => {
    const good = await getBusinessSettings();
    const tryIt = async (change: Record<string, unknown>) => {
      const result = await updateBusinessSettings(owner, { ...good, ...change }, ip);
      return result.ok ? [] : (result.fields ?? []).map((f) => f.rule);
    };
    expect(await tryIt({ closeTime: "08:00" })).toContain("close_after_open");
    expect(await tryIt({ minHours: 11 })).toContain("min_fits_day");
    expect(await tryIt({ maxHours: 1, minHours: 2 })).toContain("max_at_least_min");
    expect(await tryIt({ maxCleaners: 20, capacity: 10 })).toContain("cleaners_within_capacity");
    expect(await tryIt({ openTime: "09:10" })).toContain("open_on_slot");
    expect(await tryIt({ slotMinutes: 20 })).not.toEqual([]);
    expect(await tryIt({ capacity: -1 })).not.toEqual([]);
  });

  it("saves changes that the booking engine then uses, and logs what changed", async () => {
    const good = await getBusinessSettings();
    expect(await updateBusinessSettings(owner, { ...good, capacity: 42, closeTime: "18:00", maxHours: 9, freeCancellationHours: 12 }, ip)).toEqual({ ok: true });
    const engine = await getBookingSettings();
    expect([engine.capacity, engine.closeMinutes, await getFreeChangeHours()]).toEqual([42, 18 * 60, 12]);
    const [entry] = (await withActor(owner, (tx) => tx.select().from(auditLog).where(eq(auditLog.action, "settings.updated")))).filter((e) => e.actorId === ownerId);
    expect(entry.meta).toMatchObject({ capacity: { from: good.capacity, to: 42 }, closeTime: { from: good.closeTime, to: "18:00" } });
    // The database refuses an Admin's write outright.
    await expect(updateBusinessSettings({ role: "admin", userId: ownerId }, { ...good, capacity: 60 }, ip)).rejects.toThrow();
    expect((await getBookingSettings()).capacity).toBe(42);
  });
});

describe("reports", () => {
  it("reads date ranges safely", () => {
    const now = new Date("2026-11-05T08:00:00Z");
    expect(parseRange("2026-10-01", "2026-10-31", now)).toEqual({ from: "2026-10-01", to: "2026-10-31", days: 31 });
    expect(parseRange("2026-10-31", "2026-10-01", now)).toEqual({ from: "2026-10-07", to: "2026-11-05", days: 30 });
    expect(parseRange("drop table", null, now).days).toBe(30);
    expect(parseRange("2024-01-01", "2026-01-01", now).days).toBe(30);
    expect(previousRange({ from: "2026-10-01", to: "2026-10-31", days: 31 })).toEqual({ from: "2026-08-31", to: "2026-09-30", days: 31 });
    expect([bucketFor(30), bucketFor(90), bucketFor(365)]).toEqual(["day", "week", "month"]);
    expect([change(150, 100), change(0, 0), change(5, 0), change(50, 100)]).toEqual([50, 0, null, -50]);
  });

  it("stops spreadsheet formulas in exported cells", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+971501234567")).toBe("'+971501234567");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("Marina, Tower 2")).toBe(`"Marina, Tower 2"`);
    expect(csvCell("line\nbreak")).toBe(`"line\nbreak"`);
    expect(csvCell(null)).toBe("");
    expect(csvCell(140)).toBe("140");
  });

  it("counts revenue from completed jobs only, and exports the bookings", async () => {
    // Jobs in the past, so they can be completed for the report.
    const ownerClient = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
    await ownerClient.connect();
    await ownerClient.query("select set_config('app.role', 'system', false)");
    const [svc] = (await ownerClient.query("select id from service where slug = 'general-cleaning'")).rows;
    const day = addDays(today, -400);
    const insert = (ref: string, status: string, total: number) =>
      ownerClient.query(
        `insert into booking (reference, contact_name, contact_phone, contact_email, service_id, frequency, cleaner_count, duration_minutes, start_at, end_at, building, unit, area, status, payment_method, service_fils, total_fils, price_snapshot)
         values ($1, $2, '+971501234567', $3, $4, 'one_time', 2, 120, $5, $6, 'Tower', '1', 'Dubai Marina', $7, 'cash', $8, $8, '{}')`,
        [ref, "=cmd|' /C calc'!A0", email("report"), svc.id, `${day}T06:00:00Z`, `${day}T08:00:00Z`, status, total],
      );
    await insert(`TEST-${marker}-1`, "completed", 14000);
    await insert(`TEST-${marker}-2`, "completed", 7000);
    await insert(`TEST-${marker}-3`, "cancelled", 9900);
    await ownerClient.end();

    const range = { from: day, to: day, days: 1 };
    const report = await getReport(owner, range);
    expect([report.current.revenueFils, report.current.completed, report.current.cancelled, report.current.scheduled]).toEqual([21000, 2, 1, 3]);
    expect(report.revenue).toEqual([{ key: day, fils: 21000, jobs: 2 }]);
    expect(report.byArea).toEqual([{ area: "Dubai Marina", bookings: 2 }]);

    const { csv, count } = await exportBookingsCsv(owner, range);
    expect(count).toBe(3);
    expect(csv.startsWith("﻿Reference,")).toBe(true);
    expect(csv).toContain(`'=cmd|' /C calc'!A0`);
    expect(csv).toContain("140.00");
  });
});

describe("audit log", () => {
  it("filters by area and is hidden from Admins", async () => {
    const result = await listAudit(owner, { area: "staff", actor: ownerId });
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.action.startsWith("staff.") && r.actorId === ownerId)).toBe(true);
    const asAdmin = await listAudit({ role: "admin", userId: ownerId }, {});
    expect([asAdmin.rows.length, asAdmin.total]).toEqual([0, 0]);
    expect((await listAudit(owner, { area: "nonsense", page: -1 })).filters).toMatchObject({ area: undefined, page: 1 });
  });

  it("cannot be changed or deleted", async () => {
    const [entry] = await withActor(owner, (tx) => tx.select().from(auditLog).where(eq(auditLog.actorId, ownerId)).limit(1));
    await expect(withActor({ role: "system" }, (tx) => tx.update(auditLog).set({ action: "x" }).where(eq(auditLog.id, entry.id)))).rejects.toThrow();
    await expect(withActor({ role: "system" }, (tx) => tx.delete(auditLog).where(inArray(auditLog.id, [entry.id])))).rejects.toThrow();
  });
});

