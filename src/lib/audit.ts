import { db } from "@/db";
import { auditLog } from "@/db/schema";

type AuditEntry = typeof auditLog.$inferInsert;

export async function writeAudit(entry: AuditEntry) {
  await db.insert(auditLog).values(entry);
}
