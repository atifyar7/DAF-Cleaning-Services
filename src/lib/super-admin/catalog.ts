import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "@/db";
import { addOn, service, serviceCategory } from "@/db/schema";
import { parseAed } from "../admin/workflow";
import { audit, staffLimited, type Staff } from "../admin/shared";

// Prices and the service list. Bookings keep the price they were made at (their price snapshot), so a
// change here only affects new bookings. Writes run as the Super Admin; the database refuses anyone else.

export type CatalogError = "invalid" | "not_found" | "limited";
export type CatalogResult = { ok: true } | { ok: false; error: CatalogError };

export async function getCatalogForEditing(owner: Staff) {
  return withActor(owner, async (tx) => {
    const categories = await tx.select().from(serviceCategory).orderBy(asc(serviceCategory.sortOrder));
    const services = await tx.select().from(service).orderBy(asc(service.sortOrder));
    const addOns = await tx.select().from(addOn).orderBy(asc(addOn.nameEn));
    return { categories, services, addOns };
  });
}

const names = { nameEn: z.string().trim().min(2).max(80), nameAr: z.string().trim().min(2).max(80) };

// The booking engine prices only hourly services itself; anything else is quoted by the team.
const serviceInput = z
  .object({
    ...names,
    pricingModel: z.enum(["hourly", "quote"]),
    price: z.string().max(12),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(999),
  })
  .transform((s) => ({ ...s, priceFils: s.pricingModel === "hourly" ? parseAed(s.price) : null }))
  .refine((s) => s.pricingModel === "quote" || s.priceFils !== null, { path: ["price"] });

export async function updateService(owner: Staff, id: unknown, input: unknown, ip: string | null): Promise<CatalogResult> {
  const serviceId = z.uuid().safeParse(id);
  const parsed = serviceInput.safeParse(input);
  if (!serviceId.success || !parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  const { nameEn, nameAr, pricingModel, priceFils, active, sortOrder } = parsed.data;

  return withActor(owner, async (tx) => {
    const [before] = await tx.select().from(service).where(eq(service.id, serviceId.data)).for("update");
    if (!before) return { ok: false, error: "not_found" } as const;
    // Row-level security turns a write by anyone but the owner into "no rows changed", so check it.
    const updated = await tx
      .update(service)
      .set({ nameEn, nameAr, pricingModel, priceFils, active, sortOrder })
      .where(eq(service.id, before.id))
      .returning({ id: service.id });
    if (!updated.length) return { ok: false, error: "not_found" } as const;
    await audit(tx, owner, "catalog.service_updated", "service", before.id, ip, {
      slug: before.slug,
      from: { pricingModel: before.pricingModel, priceFils: before.priceFils, active: before.active },
      to: { pricingModel, priceFils, active },
    });
    return { ok: true } as const;
  });
}

const addOnInput = z.object({ ...names, active: z.boolean() });

export async function updateAddOn(owner: Staff, id: unknown, input: unknown, ip: string | null): Promise<CatalogResult> {
  const addOnId = z.uuid().safeParse(id);
  const parsed = addOnInput.safeParse(input);
  if (!addOnId.success || !parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  return withActor(owner, async (tx) => {
    const updated = await tx.update(addOn).set(parsed.data).where(eq(addOn.id, addOnId.data)).returning({ slug: addOn.slug });
    if (!updated.length) return { ok: false, error: "not_found" } as const;
    await audit(tx, owner, "catalog.add_on_updated", "add_on", addOnId.data, ip, { slug: updated[0].slug, active: parsed.data.active });
    return { ok: true } as const;
  });
}

const categoryInput = z.object({ ...names, active: z.boolean() });

export async function updateCategory(owner: Staff, id: unknown, input: unknown, ip: string | null): Promise<CatalogResult> {
  const categoryId = z.uuid().safeParse(id);
  const parsed = categoryInput.safeParse(input);
  if (!categoryId.success || !parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  return withActor(owner, async (tx) => {
    const updated = await tx.update(serviceCategory).set(parsed.data).where(eq(serviceCategory.id, categoryId.data)).returning({ slug: serviceCategory.slug });
    if (!updated.length) return { ok: false, error: "not_found" } as const;
    await audit(tx, owner, "catalog.category_updated", "service_category", categoryId.data, ip, { slug: updated[0].slug, active: parsed.data.active });
    return { ok: true } as const;
  });
}
