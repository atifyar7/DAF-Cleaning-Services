"use server";

import { headers } from "next/headers";
import {
  addNote,
  assignCleaners,
  changeStatus,
  sendQuote,
  staffReschedule,
  staffSlots,
  updatePayment,
} from "@/lib/admin/bookings";
import { createCleaner, updateCleaner } from "@/lib/admin/cleaners";
import { eraseCustomer } from "@/lib/admin/customers";
import { setEnquiryHandled } from "@/lib/admin/enquiries";
import type { Staff } from "@/lib/admin/shared";
import type { StatusAction } from "@/lib/admin/workflow";
import { authorize } from "@/lib/dal";
import { env } from "@/lib/env";
import type { Permission } from "@/lib/permissions";

// Each action checks the signed-in staff member's permission first (including 2FA and the session age
// limit). Who is acting always comes from the server session, never from what the browser sends.

const denied = { ok: false as const, error: "not_allowed" as const };
const notFound = { ok: false as const, error: "not_found" as const };
const reference = (value: unknown) => (typeof value === "string" && /^DAF-[A-Z0-9]{8}$/.test(value) ? value : null);

async function staff(permission: Permission): Promise<{ staff: Staff; ip: string | null } | null> {
  try {
    const { actor } = await authorize(permission);
    if (actor.role !== "admin" && actor.role !== "super_admin") return null;
    return { staff: { role: actor.role, userId: actor.userId }, ip: (await headers()).get(env.CLIENT_IP_HEADER) };
  } catch {
    return null;
  }
}

const statusActions: StatusAction[] = ["confirm", "start", "complete", "cancel"];

export async function updateBookingStatus(ref: unknown, action: unknown, reason?: unknown) {
  const who = await staff("booking.update_status");
  if (!who) return denied;
  const valid = reference(ref);
  if (!valid || !statusActions.includes(action as StatusAction)) return notFound;
  return changeStatus(who.staff, valid, action as StatusAction, reason, who.ip);
}

export async function sendBookingQuote(ref: unknown, amount: unknown) {
  const who = await staff("booking.update_status");
  if (!who) return denied;
  const valid = reference(ref);
  return valid ? sendQuote(who.staff, valid, amount, who.ip) : notFound;
}

export async function setBookingTeam(ref: unknown, cleanerIds: unknown) {
  const who = await staff("booking.assign");
  if (!who) return denied;
  const valid = reference(ref);
  return valid ? assignCleaners(who.staff, valid, cleanerIds, who.ip) : notFound;
}

export async function setBookingPayment(ref: unknown, payment: unknown) {
  const who = await staff("booking.update_status");
  if (!who) return denied;
  const valid = reference(ref);
  return valid ? updatePayment(who.staff, valid, payment, who.ip) : notFound;
}

export async function addBookingNote(ref: unknown, body: unknown) {
  const who = await staff("booking.view_all");
  if (!who) return denied;
  const valid = reference(ref);
  return valid ? addNote(who.staff, valid, body, who.ip) : notFound;
}

export async function bookingSlots(ref: unknown, date: unknown) {
  const who = await staff("booking.update_status");
  if (!who) return denied;
  const valid = reference(ref);
  if (!valid || typeof date !== "string") return notFound;
  return staffSlots(who.staff, valid, date);
}

export async function rescheduleBookingAsStaff(ref: unknown, slot: unknown) {
  const who = await staff("booking.update_status");
  if (!who) return denied;
  const valid = reference(ref);
  return valid ? staffReschedule(who.staff, valid, slot, who.ip) : notFound;
}

export async function addCleaner(input: unknown) {
  const who = await staff("cleaner.manage");
  return who ? createCleaner(who.staff, input, who.ip) : denied;
}

export async function editCleaner(id: unknown, input: unknown) {
  const who = await staff("cleaner.manage");
  return who ? updateCleaner(who.staff, id, input, who.ip) : denied;
}

export async function completeCustomerDeletion(id: unknown) {
  const who = await staff("customer.erase");
  return who ? eraseCustomer(who.staff, id, who.ip) : denied;
}

export async function markEnquiry(id: unknown, handled: unknown) {
  const who = await staff("enquiry.manage");
  return who ? setEnquiryHandled(who.staff, id, handled, who.ip) : denied;
}
