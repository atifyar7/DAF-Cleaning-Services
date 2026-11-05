"use server";

import {
  addAddress,
  cancelBooking,
  getRescheduleSlots,
  removeAddress,
  requestDeletion,
  rescheduleBooking,
  respondToQuote,
  updateProfile,
} from "@/lib/booking/customer";
import { authorize } from "@/lib/dal";

// Each action checks the signed-in customer's permission first. The customer's id always comes from
// the server session, never from what the browser sends.

const reference = (value: unknown) => (typeof value === "string" && /^DAF-[A-Z0-9]{8}$/.test(value) ? value : null);

async function customer(permission: Parameters<typeof authorize>[0]) {
  try {
    return (await authorize(permission)).user.id;
  } catch {
    return null;
  }
}

const denied = { ok: false as const, error: "not_allowed" as const };
const notFound = { ok: false as const, error: "not_found" as const };

export async function cancelMyBooking(ref: unknown) {
  const userId = await customer("booking.manage_own");
  if (!userId) return denied;
  const valid = reference(ref);
  return valid ? cancelBooking(userId, valid) : notFound;
}

export async function rescheduleSlots(ref: unknown, date: unknown) {
  const userId = await customer("booking.manage_own");
  if (!userId) return denied;
  const valid = reference(ref);
  if (!valid || typeof date !== "string") return notFound;
  return getRescheduleSlots(userId, valid, date);
}

export async function rescheduleMyBooking(ref: unknown, slot: unknown) {
  const userId = await customer("booking.manage_own");
  if (!userId) return denied;
  const valid = reference(ref);
  return valid ? rescheduleBooking(userId, valid, slot) : notFound;
}

export async function answerQuote(ref: unknown, accept: unknown) {
  const userId = await customer("booking.manage_own");
  if (!userId) return denied;
  const valid = reference(ref);
  return valid && typeof accept === "boolean" ? respondToQuote(userId, valid, accept) : notFound;
}

export async function saveAddress(input: unknown) {
  const userId = await customer("address.manage_own");
  return userId ? addAddress(userId, input) : denied;
}

export async function deleteAddress(id: unknown) {
  const userId = await customer("address.manage_own");
  return userId && typeof id === "string" ? removeAddress(userId, id) : denied;
}

export async function saveProfile(input: unknown) {
  const userId = await customer("account.view");
  return userId ? updateProfile(userId, input) : denied;
}

export async function requestAccountDeletion() {
  const userId = await customer("account.view");
  return userId ? requestDeletion(userId) : denied;
}
