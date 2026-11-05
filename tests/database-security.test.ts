import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { db, withActor } from "@/db";
import { auditLog, booking, customerAddress, service, user } from "@/db/schema";
import { consume, isBlocked, reset } from "@/lib/rate-limit";

const alice = randomUUID();
const bob = randomUUID();
let bookingId: string;

const asAlice = { role: "customer", userId: alice } as const;
const asBob = { role: "customer", userId: bob } as const;

function bookingRow(serviceId: string, customerId: string) {
  return {
    reference: `TEST-${randomUUID()}`,
    customerId,
    contactName: "Test",
    contactPhone: "+971500000000",
    contactEmail: "test@example.com",
    serviceId,
    frequency: "one_time" as const,
    cleanerCount: 1,
    durationMinutes: 120,
    startAt: new Date("2027-01-01T06:00:00Z"),
    endAt: new Date("2027-01-01T08:00:00Z"),
    building: "Tower",
    unit: "101",
    area: "Marina",
    paymentMethod: "cash" as const,
    serviceFils: 7000,
    totalFils: 7000,
    priceSnapshot: {},
  };
}

beforeAll(async () => {
  await db.insert(user).values([
    { id: alice, name: "Alice", email: `${alice}@example.com` },
    { id: bob, name: "Bob", email: `${bob}@example.com` },
  ]);
  const [first] = await db.select({ id: service.id }).from(service).limit(1);
  const [row] = await withActor({ role: "system" }, (tx) =>
    tx.insert(booking).values(bookingRow(first.id, alice)).returning({ id: booking.id }),
  );
  bookingId = row.id;
});

afterAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.role', 'system', true)");
  await owner.query("delete from booking where id = $1", [bookingId]);
  await owner.query(`delete from "user" where id = any($1)`, [[alice, bob]]);
  await owner.query("commit");
  await owner.end();
});

describe("row-level security", () => {
  it("shows a customer their own booking", async () => {
    const rows = await withActor(asAlice, (tx) => tx.select().from(booking));
    expect(rows.map((row) => row.id)).toEqual([bookingId]);
  });

  it("hides it from another customer, even by exact id", async () => {
    const rows = await withActor(asBob, (tx) => tx.select().from(booking).where(eq(booking.id, bookingId)));
    expect(rows).toEqual([]);
  });

  it("hides all bookings when no actor is set", async () => {
    expect(await db.select().from(booking)).toEqual([]);
    expect(await withActor({ role: "anonymous" }, (tx) => tx.select().from(booking))).toEqual([]);
  });

  it("does not let a customer change another customer's booking", async () => {
    const updated = await withActor(asBob, (tx) =>
      tx.update(booking).set({ totalFils: 0 }).where(eq(booking.id, bookingId)).returning(),
    );
    expect(updated).toEqual([]);
  });

  it("does not let a customer attach a booking or address to someone else", async () => {
    const [first] = await db.select({ id: service.id }).from(service).limit(1);
    await expect(
      withActor(asBob, (tx) => tx.insert(booking).values(bookingRow(first.id, alice))),
    ).rejects.toThrow();
    await expect(
      withActor(asBob, (tx) =>
        tx.insert(customerAddress).values({ userId: alice, building: "A", unit: "1", area: "B" }),
      ),
    ).rejects.toThrow();
  });

  it("lets staff see all bookings", async () => {
    const rows = await withActor({ role: "admin", userId: randomUUID() }, (tx) =>
      tx.select().from(booking).where(eq(booking.id, bookingId)),
    );
    expect(rows).toHaveLength(1);
  });

  it("stops the app deleting bookings", async () => {
    await expect(
      withActor({ role: "system" }, (tx) => tx.delete(booking).where(eq(booking.id, bookingId))),
    ).rejects.toThrow();
  });

  it("stops a customer or admin changing prices", async () => {
    for (const actor of [asAlice, { role: "admin", userId: bob } as const]) {
      const changed = await withActor(actor, (tx) => tx.update(service).set({ priceFils: 1 }).returning());
      expect(changed).toEqual([]);
    }
  });
});

describe("audit log", () => {
  it("is append-only for the app", async () => {
    await db.insert(auditLog).values({ action: "test.entry" });
    await expect(
      withActor({ role: "system" }, (tx) => tx.update(auditLog).set({ action: "forged" })),
    ).rejects.toThrow();
    await expect(withActor({ role: "system" }, (tx) => tx.delete(auditLog))).rejects.toThrow();
  });

  it("blocks changes even for the table owner", async () => {
    const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
    await owner.connect();
    await owner.query("begin");
    await owner.query("select set_config('app.role', 'system', true)");
    const updated = await owner.query(`update audit_log set action = 'forged'`);
    const deleted = await owner.query(`delete from audit_log`);
    expect([updated.rowCount, deleted.rowCount]).toEqual([0, 0]);
    await expect(owner.query(`truncate audit_log`)).rejects.toThrow(/append-only/);
    await owner.query("rollback");
    await owner.end();
  });

  it("can be read only by the Super Admin", async () => {
    const count = (actor: Parameters<typeof withActor>[0]) =>
      withActor(actor, async (tx) => (await tx.select().from(auditLog)).length);
    expect(await count(asAlice)).toBe(0);
    expect(await count({ role: "admin", userId: bob })).toBe(0);
    expect(await count({ role: "super_admin", userId: bob })).toBeGreaterThan(0);
  });
});

describe("database account", () => {
  it("cannot bypass security or alter tables", async () => {
    const { rows } = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    await expect(db.execute(sql`alter table booking disable row level security`)).rejects.toThrow();
    await expect(db.execute(sql`drop table audit_log`)).rejects.toThrow();
  });
});

describe("rate limiter", () => {
  const limit = { name: "test", max: 3, windowSeconds: 60 };

  it("blocks after the limit, including under concurrent requests", async () => {
    const id = randomUUID();
    const results = await Promise.all(Array.from({ length: 10 }, () => consume(limit, id)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await isBlocked(limit, id)).toBe(true);
    await reset(limit, id);
    expect(await isBlocked(limit, id)).toBe(false);
  });

  it("treats differently-cased emails as the same identifier", async () => {
    const id = `${randomUUID()}@example.com`;
    for (let i = 0; i < 3; i++) await consume(limit, id);
    expect(await consume(limit, id.toUpperCase())).toBe(false);
    await reset(limit, id);
  });
});
