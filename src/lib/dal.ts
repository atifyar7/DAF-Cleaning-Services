import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db, type Actor } from "@/db";
import { session as sessionTable } from "@/db/schema";
import { auth } from "./auth";
import { can, isStaff, isStaffSessionExpired, type Permission } from "./permissions";

/** Reads the session once per request. The role always comes from the database, not the browser. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

function actorFor(user: { id: string; role?: string | null }): Actor {
  const role = user.role === "admin" || user.role === "super_admin" ? user.role : "customer";
  return { role, userId: user.id };
}

/**
 * Guards a page. Call it in every protected page, because layouts do not re-run on client navigation.
 * Hidden pages return 404, so a signed-in user cannot tell which staff pages exist.
 */
export async function requirePermission(permission: Permission, locale: string) {
  const current = await getSession();
  const staffArea = permission.startsWith("dashboard.");

  if (!current || current.user.disabledAt) {
    redirect(`/${locale}${staffArea ? "/staff/login" : "/login"}`);
  }

  if (isStaff(current.user.role)) {
    if (isStaffSessionExpired(current.session.createdAt)) {
      await db.delete(sessionTable).where(eq(sessionTable.id, current.session.id));
      redirect(`/${locale}/staff/login`);
    }
    if (!current.user.twoFactorEnabled) {
      redirect(`/${locale}/staff/security`);
    }
  }

  if (!can(current.user.role, permission)) notFound();

  return { user: current.user, actor: actorFor(current.user) };
}

/** Guards a staff page and returns the staff member to run queries as. */
export async function requireStaff(permission: Permission, locale: string) {
  const { user, actor } = await requirePermission(permission, locale);
  if (actor.role !== "admin" && actor.role !== "super_admin") notFound();
  return { user, staff: { role: actor.role, userId: actor.userId } };
}

/** Guards a server action or route handler. Throws instead of redirecting. */
export async function authorize(permission: Permission) {
  const current = await getSession();
  const valid =
    current &&
    !current.user.disabledAt &&
    can(current.user.role, permission) &&
    (!isStaff(current.user.role) ||
      (current.user.twoFactorEnabled && !isStaffSessionExpired(current.session.createdAt)));

  if (!valid) throw new Error("Not authorized");
  return { user: current.user, actor: actorFor(current.user) };
}
