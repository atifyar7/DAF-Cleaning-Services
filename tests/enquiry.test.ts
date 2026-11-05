import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db, withActor } from "@/db";
import { enquiry } from "@/db/schema";
import { saveEnquiry } from "@/lib/enquiry";

const valid = (email = `${randomUUID()}@example.com`) => ({
  kind: "contact",
  name: "Test Customer",
  phone: "+971 50 000 0000",
  email,
  message: "I would like a quote for cleaning.",
});
const ip = () => randomUUID();

describe("enquiries", () => {
  it("saves a valid enquiry", async () => {
    expect(await saveEnquiry(valid(), ip())).toBe("success");
  });

  it.each([
    ["a bad email", { email: "not-an-email" }],
    ["a bad phone", { phone: "call me" }],
    ["a short message", { message: "hi" }],
    ["an unknown kind", { kind: "admin" }],
    ["an oversized message", { message: "x".repeat(2001) }],
  ])("rejects %s", async (_name, change) => {
    expect(await saveEnquiry({ ...valid(), ...change }, ip())).toBe("invalid");
  });

  it("quietly ignores bots that fill the hidden field", async () => {
    const email = `${randomUUID()}@example.com`;
    expect(await saveEnquiry({ ...valid(email), website: "spam.example" }, ip())).toBe("success");
    const rows = await withActor({ role: "system" }, (tx) => tx.select({ email: enquiry.email }).from(enquiry));
    expect(rows.map((row) => row.email)).not.toContain(email);
  });

  it("limits repeat enquiries from one email", async () => {
    const email = `${randomUUID()}@example.com`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await saveEnquiry(valid(email), ip()));
    expect(results).toEqual(["success", "success", "success", "limited"]);
  });

  it("limits repeat enquiries from one IP", async () => {
    const address = ip();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await saveEnquiry(valid(), address));
    expect(results.at(-1)).toBe("limited");
  });

  it("keeps enquiries private from visitors and customers", async () => {
    expect(await db.select().from(enquiry)).toEqual([]);
    const asCustomer = await withActor({ role: "customer", userId: randomUUID() }, (tx) => tx.select().from(enquiry));
    expect(asCustomer).toEqual([]);
  });
});
