import "server-only";
import { sql } from "drizzle-orm";
import { withActor } from "@/db";
import { auditLog, notificationOutbox } from "@/db/schema";
import { consume, limits } from "../rate-limit";

// Helpers shared by the admin modules. Every read and write runs as the signed-in staff member, so the
// database's row-level security applies to the team as well.

export type Staff = { role: "admin" | "super_admin"; userId: string };
export type Tx = Parameters<Parameters<typeof withActor>[1]>[0];

export const PAGE_SIZE = 20;

/** Staff get a generous limit, but a stolen session still cannot hammer the database. */
export async function staffLimited(staff: Staff) {
  return !(await consume(limits.staffAction, staff.userId));
}

export async function audit(
  tx: Tx,
  staff: Staff,
  action: string,
  entity: string,
  entityId: string,
  ip: string | null,
  meta?: Record<string, unknown>,
) {
  await tx.insert(auditLog).values({ actorId: staff.userId, actorRole: staff.role, action, entity, entityId, ipAddress: ip, meta: meta ?? null });
}

/** Queues a customer message for the notifications phase. WhatsApp is added only if they asked for it. */
export async function notifyCustomer(
  tx: Tx,
  item: { id: string; contactEmail: string; contactPhone: string; whatsappOptIn: boolean },
  template: string,
  payload: Record<string, unknown>,
) {
  const messages: (typeof notificationOutbox.$inferInsert)[] = [
    { channel: "email", template, recipient: item.contactEmail, payload, bookingId: item.id },
  ];
  if (item.whatsappOptIn) messages.push({ channel: "whatsapp", template, recipient: item.contactPhone, payload, bookingId: item.id });
  await tx.insert(notificationOutbox).values(messages);
}

/** Makes a search term safe for ILIKE, so % and _ typed by staff match literally. */
export function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export const pageOffset = (page: number) => (Math.max(1, Math.floor(page)) - 1) * PAGE_SIZE;

export const countAll = sql<number>`count(*)::int`;
