import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "@/db";
import { account, passkey, session, twoFactor, user } from "@/db/schema";
import { audit, staffLimited, type Staff, type Tx } from "../admin/shared";
import { hashPassword } from "../password";

// Staff accounts are managed only here, by a Super Admin. Every change is one transaction with an audit
// entry, and the rules below make it impossible to lock the business out of its own dashboard.

export type StaffError = "invalid" | "not_found" | "email_taken" | "self" | "last_owner" | "limited" | "failed";
export type StaffResult = { ok: true; password?: string } | { ok: false; error: StaffError };

const STAFF_ROLES = ["admin", "super_admin"] as const;

/** A long random password, shown once. Staff are asked to change it from their security page. */
export function temporaryPassword() {
  return randomBytes(18).toString("base64url");
}

export async function listStaff(owner: Staff) {
  return withActor(owner, async (tx) => {
    const people = await tx
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        disabledAt: user.disabledAt,
        createdAt: user.createdAt,
        passkeys: sql<number>`(select count(*) from passkey p where p.user_id = "user".id)::int`,
        // Read from the audit log, which keeps every staff sign-in even after the session ends.
        lastSignIn: sql<string | null>`(select max(a.created_at) from audit_log a where a.actor_id = "user".id and a.action = 'auth.session_created')`,
      })
      .from(user)
      .where(inArray(user.role, [...STAFF_ROLES]))
      .orderBy(sql`${user.disabledAt} is not null`, sql`${user.role} desc`, asc(user.name));
    return people.map((p) => ({ ...p, lastSignIn: p.lastSignIn ? new Date(p.lastSignIn) : null }));
  });
}

const createInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(200).transform((e) => e.trim().toLowerCase()),
  role: z.enum(STAFF_ROLES),
});

export async function createStaff(owner: Staff, input: unknown, ip: string | null): Promise<StaffResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  const { name, email, role } = parsed.data;
  const password = temporaryPassword();
  const hash = await hashPassword(password);

  return withActor(owner, async (tx) => {
    const [taken] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (taken) return { ok: false, error: "email_taken" } as const;
    const id = randomUUID();
    await tx.insert(user).values({ id, name, email, emailVerified: true, role });
    await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
    await audit(tx, owner, "staff.created", "user", id, ip, { role });
    return { ok: true, password } as const;
  });
}

/** Locks and returns a staff member the owner may change. Nobody may change their own access here. */
async function lockTarget(tx: Tx, owner: Staff, id: unknown): Promise<{ ok: true; target: { id: string; role: string; disabledAt: Date | null } } | { ok: false; error: StaffError }> {
  const parsed = z.string().min(1).max(100).safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data === owner.userId) return { ok: false, error: "self" };
  // One staff change at a time, so two owners cannot remove each other in the same moment.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('staff-roles'))`);
  const [target] = await tx
    .select({ id: user.id, role: user.role, disabledAt: user.disabledAt })
    .from(user)
    .where(and(eq(user.id, parsed.data), inArray(user.role, [...STAFF_ROLES])))
    .for("update");
  return target ? { ok: true, target } : { ok: false, error: "not_found" };
}

/** True when someone other than the target would still be an active Super Admin. */
async function anotherOwnerRemains(tx: Tx, targetId: string) {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .where(and(eq(user.role, "super_admin"), isNull(user.disabledAt), ne(user.id, targetId)));
  return count > 0;
}

const signOutEverywhere = (tx: Tx, userId: string) => tx.delete(session).where(eq(session.userId, userId));

export async function setStaffDisabled(owner: Staff, id: unknown, disabled: unknown, ip: string | null): Promise<StaffResult> {
  if (typeof disabled !== "boolean") return { ok: false, error: "invalid" };
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  return withActor(owner, async (tx) => {
    const found = await lockTarget(tx, owner, id);
    if (!found.ok) return found;
    const { target } = found;
    if (disabled && target.role === "super_admin" && !(await anotherOwnerRemains(tx, target.id))) return { ok: false, error: "last_owner" } as const;
    await tx.update(user).set({ disabledAt: disabled ? new Date() : null }).where(eq(user.id, target.id));
    // A disabled account is signed out at once, everywhere.
    if (disabled) await signOutEverywhere(tx, target.id);
    await audit(tx, owner, disabled ? "staff.disabled" : "staff.enabled", "user", target.id, ip);
    return { ok: true } as const;
  });
}

export async function changeStaffRole(owner: Staff, id: unknown, role: unknown, ip: string | null): Promise<StaffResult> {
  const parsed = z.enum(STAFF_ROLES).safeParse(role);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  return withActor(owner, async (tx) => {
    const found = await lockTarget(tx, owner, id);
    if (!found.ok) return found;
    const { target } = found;
    if (target.role === parsed.data) return { ok: true } as const;
    if (target.role === "super_admin" && !(await anotherOwnerRemains(tx, target.id))) return { ok: false, error: "last_owner" } as const;
    await tx.update(user).set({ role: parsed.data }).where(eq(user.id, target.id));
    // A passkey is a Super Admin privilege, so it goes when the role does.
    if (parsed.data === "admin") await tx.delete(passkey).where(eq(passkey.userId, target.id));
    await signOutEverywhere(tx, target.id);
    await audit(tx, owner, "staff.role_changed", "user", target.id, ip, { from: target.role, to: parsed.data });
    return { ok: true } as const;
  });
}

/** Issues a new temporary password and signs the person out everywhere. */
export async function resetStaffPassword(owner: Staff, id: unknown, ip: string | null): Promise<StaffResult> {
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  return withActor(owner, async (tx) => {
    const found = await lockTarget(tx, owner, id);
    if (!found.ok) return found;
    const { target } = found;
    const updated = await tx
      .update(account)
      .set({ password: hash })
      .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (!updated.length) {
      await tx.insert(account).values({ id: randomUUID(), accountId: target.id, providerId: "credential", userId: target.id, password: hash });
    }
    await signOutEverywhere(tx, target.id);
    await audit(tx, owner, "staff.password_reset", "user", target.id, ip);
    return { ok: true, password } as const;
  });
}

/** For a lost phone: removes their authenticator and passkeys. They set up a new one at next sign-in. */
export async function resetStaffTwoFactor(owner: Staff, id: unknown, ip: string | null): Promise<StaffResult> {
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  return withActor(owner, async (tx) => {
    const found = await lockTarget(tx, owner, id);
    if (!found.ok) return found;
    const { target } = found;
    await tx.delete(twoFactor).where(eq(twoFactor.userId, target.id));
    await tx.delete(passkey).where(eq(passkey.userId, target.id));
    await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, target.id));
    await signOutEverywhere(tx, target.id);
    await audit(tx, owner, "staff.two_factor_reset", "user", target.id, ip);
    return { ok: true } as const;
  });
}

/* The Super Admin's own passkeys */

export async function listOwnPasskeys(owner: Staff) {
  return withActor(owner, (tx) =>
    tx
      .select({ id: passkey.id, name: passkey.name, deviceType: passkey.deviceType, backedUp: passkey.backedUp, createdAt: passkey.createdAt })
      .from(passkey)
      .where(eq(passkey.userId, owner.userId))
      .orderBy(asc(passkey.createdAt)),
  );
}

export async function removeOwnPasskey(owner: Staff, id: unknown, ip: string | null): Promise<StaffResult> {
  const parsed = z.string().min(1).max(200).safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await staffLimited(owner)) return { ok: false, error: "limited" };
  return withActor(owner, async (tx) => {
    const removed = await tx
      .delete(passkey)
      .where(and(eq(passkey.id, parsed.data), eq(passkey.userId, owner.userId)))
      .returning({ id: passkey.id });
    if (!removed.length) return { ok: false, error: "not_found" } as const;
    await audit(tx, owner, "auth.passkey_removed", "user", owner.userId, ip);
    return { ok: true } as const;
  });
}
