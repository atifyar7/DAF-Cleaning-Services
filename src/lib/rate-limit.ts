import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitBucket } from "@/db/schema";

export type Limit = { name: string; max: number; windowSeconds: number };

export const limits = {
  otpSendPerEmail: { name: "otp-email", max: 3, windowSeconds: 3600 },
  loginFailuresShort: { name: "login-fail-15m", max: 5, windowSeconds: 900 },
  loginFailuresLong: { name: "login-fail-24h", max: 15, windowSeconds: 86400 },
  bookingPerIp: { name: "booking-ip", max: 5, windowSeconds: 3600 },
  bookingPerEmail: { name: "booking-email", max: 5, windowSeconds: 86400 },
  availabilityPerIp: { name: "availability-ip", max: 120, windowSeconds: 60 },
  enquiryPerIp: { name: "enquiry-ip", max: 5, windowSeconds: 3600 },
  enquiryPerEmail: { name: "enquiry-email", max: 3, windowSeconds: 3600 },
  userAction: { name: "user-action", max: 60, windowSeconds: 60 },
  staffAction: { name: "staff-action", max: 120, windowSeconds: 60 },
  adminExport: { name: "admin-export", max: 5, windowSeconds: 3600 },
} satisfies Record<string, Limit>;

// Identifiers are hashed so emails and IPs are not stored in this table.
function bucketKey(limit: Limit, identifier: string) {
  const hash = createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
  return `${limit.name}:${hash}`;
}

/** Counts one use atomically. Returns false once the limit is exceeded. */
export async function consume(limit: Limit, identifier: string) {
  const { rows } = await db.execute<{ count: number }>(sql`
    insert into rate_limit_bucket (key, count, reset_at)
    values (${bucketKey(limit, identifier)}, 1, now() + make_interval(secs => ${limit.windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limit_bucket.reset_at <= now() then 1 else rate_limit_bucket.count + 1 end,
      reset_at = case when rate_limit_bucket.reset_at <= now() then excluded.reset_at else rate_limit_bucket.reset_at end
    returning count
  `);
  return rows[0].count <= limit.max;
}

/** Reports whether the limit is already reached, without counting a use. */
export async function isBlocked(limit: Limit, identifier: string) {
  const { rows } = await db.execute<{ blocked: boolean }>(sql`
    select count >= ${limit.max} as blocked from rate_limit_bucket
    where key = ${bucketKey(limit, identifier)} and reset_at > now()
  `);
  return rows[0]?.blocked ?? false;
}

export async function reset(limit: Limit, identifier: string) {
  await db.delete(rateLimitBucket).where(eq(rateLimitBucket.key, bucketKey(limit, identifier)));
}
