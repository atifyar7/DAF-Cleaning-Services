import "server-only";
import { and, desc, eq, ilike, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "@/db";
import { enquiry } from "@/db/schema";
import { audit, countAll, likePattern, PAGE_SIZE, pageOffset, staffLimited, type Staff } from "./shared";
import type { WorkflowResult } from "./workflow";

const filterInput = z.object({
  view: z.enum(["open", "handled", "all"]).catch("open"),
  kind: z.enum(["contact", "monthly_contract"]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export async function listEnquiries(staff: Staff, raw: Record<string, unknown>) {
  const filters = filterInput.parse(raw);
  const conditions: (SQL | undefined)[] = [];
  if (filters.view === "open") conditions.push(isNull(enquiry.handledAt));
  if (filters.view === "handled") conditions.push(isNotNull(enquiry.handledAt));
  if (filters.kind) conditions.push(eq(enquiry.kind, filters.kind));
  if (filters.q) {
    const pattern = likePattern(filters.q);
    conditions.push(or(ilike(enquiry.name, pattern), ilike(enquiry.email, pattern), ilike(enquiry.phone, pattern), ilike(enquiry.message, pattern)));
  }
  const where = and(...conditions);

  return withActor(staff, async (tx) => {
    const rows = await tx.select().from(enquiry).where(where).orderBy(desc(enquiry.createdAt)).limit(PAGE_SIZE).offset(pageOffset(filters.page));
    const [{ total }] = await tx.select({ total: countAll }).from(enquiry).where(where);
    const [{ open }] = await tx.select({ open: countAll }).from(enquiry).where(isNull(enquiry.handledAt));
    return { rows, total, open, page: filters.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), filters };
  });
}

export async function setEnquiryHandled(staff: Staff, id: unknown, handled: unknown, ip: string | null): Promise<WorkflowResult> {
  const enquiryId = z.uuid().safeParse(id);
  if (!enquiryId.success || typeof handled !== "boolean") return { ok: false, error: "invalid" };
  if (await staffLimited(staff)) return { ok: false, error: "limited" };
  return withActor(staff, async (tx) => {
    const updated = await tx
      .update(enquiry)
      .set({ handledAt: handled ? new Date() : null })
      .where(eq(enquiry.id, enquiryId.data))
      .returning({ id: enquiry.id });
    if (!updated.length) return { ok: false, error: "not_found" } as const;
    await audit(tx, staff, handled ? "enquiry.handled" : "enquiry.reopened", "enquiry", enquiryId.data, ip);
    return { ok: true } as const;
  });
}
