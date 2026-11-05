import "server-only";
import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "@/db";
import { auditLog, user } from "@/db/schema";
import { addDays, dubaiInstant } from "../booking/time";
import { countAll, likePattern, PAGE_SIZE, pageOffset, type Staff } from "../admin/shared";

// The audit log is append-only (the database refuses edits and deletes) and readable by the Super Admin only.

export const auditAreas = ["auth", "booking", "staff", "catalog", "settings", "cleaner", "customer", "enquiry", "account", "report"] as const;

const filterInput = z.object({
  area: z.enum(auditAreas).optional().catch(undefined),
  actor: z.string().max(100).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export async function listAudit(owner: Staff, raw: Record<string, unknown>) {
  const filters = filterInput.parse(raw);
  const conditions: (SQL | undefined)[] = [];
  if (filters.area) conditions.push(ilike(auditLog.action, `${filters.area}.%`));
  if (filters.actor) conditions.push(eq(auditLog.actorId, filters.actor));
  if (filters.from) conditions.push(gte(auditLog.createdAt, dubaiInstant(filters.from, 0)));
  if (filters.to) conditions.push(lt(auditLog.createdAt, dubaiInstant(addDays(filters.to, 1), 0)));
  if (filters.q) {
    const pattern = likePattern(filters.q);
    conditions.push(or(ilike(auditLog.action, pattern), ilike(auditLog.entityId, pattern), ilike(auditLog.ipAddress, pattern), sql`${auditLog.meta}::text ilike ${pattern}`));
  }
  const where = and(...conditions);

  return withActor(owner, async (tx) => {
    const rows = await tx
      .select({
        id: auditLog.id,
        action: auditLog.action,
        actorId: auditLog.actorId,
        actorRole: auditLog.actorRole,
        actorName: user.name,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        ipAddress: auditLog.ipAddress,
        meta: auditLog.meta,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(user, eq(auditLog.actorId, user.id))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset(pageOffset(filters.page));
    const [{ total }] = await tx.select({ total: countAll }).from(auditLog).where(where);
    // Names for staff whose accounts the entries are about, so "who was changed" reads as a person.
    const subjectIds = [...new Set(rows.filter((r) => r.entity === "user" && r.entityId).map((r) => r.entityId!))];
    const subjects = subjectIds.length
      ? await tx.select({ id: user.id, name: user.name, role: user.role }).from(user).where(inArray(user.id, subjectIds))
      : [];
    return { rows, subjects, total, page: filters.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), filters };
  });
}

/** Staff who appear in the log, for the "who" filter. */
export async function auditActors(owner: Staff) {
  return withActor(owner, (tx) =>
    tx
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .where(inArray(user.role, ["admin", "super_admin"]))
      .orderBy(user.name),
  );
}

export async function recentAudit(owner: Staff, limit = 8) {
  return withActor(owner, (tx) =>
    tx
      .select({ id: auditLog.id, action: auditLog.action, actorId: auditLog.actorId, actorName: user.name, entity: auditLog.entity, meta: auditLog.meta, createdAt: auditLog.createdAt })
      .from(auditLog)
      .leftJoin(user, eq(auditLog.actorId, user.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit),
  );
}
