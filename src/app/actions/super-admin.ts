"use server";

import { headers } from "next/headers";
import type { Staff } from "@/lib/admin/shared";
import { authorize } from "@/lib/dal";
import { env } from "@/lib/env";
import type { Permission } from "@/lib/permissions";
import { updateAddOn, updateCategory, updateService } from "@/lib/super-admin/catalog";
import { updateBusinessSettings } from "@/lib/super-admin/settings";
import {
  changeStaffRole,
  createStaff,
  removeOwnPasskey,
  resetStaffPassword,
  resetStaffTwoFactor,
  setStaffDisabled,
} from "@/lib/super-admin/staff";

// Every action re-checks the signed-in Super Admin's permission, 2FA and session age. Who is acting
// always comes from the server session, never from what the browser sends.

const denied = { ok: false as const, error: "not_allowed" as const };

async function owner(permission: Permission): Promise<{ owner: Staff; ip: string | null } | null> {
  try {
    const { actor } = await authorize(permission);
    if (actor.role !== "super_admin") return null;
    return { owner: { role: "super_admin", userId: actor.userId }, ip: (await headers()).get(env.CLIENT_IP_HEADER) };
  } catch {
    return null;
  }
}

export async function addStaffMember(input: unknown) {
  const who = await owner("staff.manage");
  return who ? createStaff(who.owner, input, who.ip) : denied;
}

export async function setStaffMemberDisabled(id: unknown, disabled: unknown) {
  const who = await owner("staff.manage");
  return who ? setStaffDisabled(who.owner, id, disabled, who.ip) : denied;
}

export async function setStaffMemberRole(id: unknown, role: unknown) {
  const who = await owner("staff.manage");
  return who ? changeStaffRole(who.owner, id, role, who.ip) : denied;
}

export async function resetStaffMemberPassword(id: unknown) {
  const who = await owner("staff.manage");
  return who ? resetStaffPassword(who.owner, id, who.ip) : denied;
}

export async function resetStaffMemberTwoFactor(id: unknown) {
  const who = await owner("staff.manage");
  return who ? resetStaffTwoFactor(who.owner, id, who.ip) : denied;
}

export async function saveService(id: unknown, input: unknown) {
  const who = await owner("catalog.manage");
  return who ? updateService(who.owner, id, input, who.ip) : denied;
}

export async function saveAddOn(id: unknown, input: unknown) {
  const who = await owner("catalog.manage");
  return who ? updateAddOn(who.owner, id, input, who.ip) : denied;
}

export async function saveCategory(id: unknown, input: unknown) {
  const who = await owner("catalog.manage");
  return who ? updateCategory(who.owner, id, input, who.ip) : denied;
}

export async function saveBusinessSettings(input: unknown) {
  const who = await owner("settings.manage");
  return who ? updateBusinessSettings(who.owner, input, who.ip) : denied;
}

export async function removePasskey(id: unknown) {
  const who = await owner("dashboard.super_admin");
  return who ? removeOwnPasskey(who.owner, id, who.ip) : denied;
}
