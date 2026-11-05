// The rules for how the team moves a booking through its life. Kept free of the database so every
// transition can be tested on its own; src/lib/admin/bookings.ts applies them inside a locked transaction.

export type BookingStatus = "pending" | "confirmed" | "assigned" | "in_progress" | "completed" | "cancelled";
export type StatusAction = "confirm" | "start" | "complete" | "cancel";
export type PaymentMethod = "cash" | "card_link";
export type PaymentStatus = "unpaid" | "link_sent" | "paid" | "refunded";

export type WorkflowError =
  | "not_found"
  | "not_allowed"
  | "quote_needed"
  | "team_needed"
  | "cleaner_busy"
  | "cleaner_inactive"
  | "slot"
  | "invalid"
  | "limited"
  | "has_open_bookings"
  | "failed";

export type WorkflowResult = { ok: true } | { ok: false; error: WorkflowError };

type Current = { status: BookingStatus; quoteRequired: boolean; quoteStatus: string; assigned: number };

export const OPEN_STATUSES: readonly BookingStatus[] = ["pending", "confirmed", "assigned"];
export const ACTIVE_STATUSES: readonly BookingStatus[] = ["pending", "confirmed", "assigned", "in_progress"];

const from: Record<StatusAction, readonly BookingStatus[]> = {
  confirm: ["pending"],
  start: ["assigned"],
  complete: ["in_progress"],
  cancel: OPEN_STATUSES,
};

const to: Record<StatusAction, BookingStatus> = {
  confirm: "confirmed",
  start: "in_progress",
  complete: "completed",
  cancel: "cancelled",
};

/** Where an action takes a booking, or why it cannot. */
export function transition(action: StatusAction, current: Current): { ok: true; to: BookingStatus } | { ok: false; error: WorkflowError } {
  if (!from[action].includes(current.status)) return { ok: false, error: "not_allowed" };
  // A quote job is confirmed only once the customer has accepted a price.
  if (action === "confirm" && current.quoteRequired && current.quoteStatus !== "accepted") return { ok: false, error: "quote_needed" };
  if (action === "start" && current.assigned === 0) return { ok: false, error: "team_needed" };
  return { ok: true, to: to[action] };
}

/** The actions the team may take on a booking right now, for the buttons on its page. */
export function availableActions(current: Current): StatusAction[] {
  return (Object.keys(from) as StatusAction[]).filter((action) => transition(action, current).ok);
}

/** Assigning a team moves a confirmed booking to "assigned"; removing everyone moves it back. */
export function statusAfterAssignment(status: BookingStatus, assigned: number): BookingStatus {
  if (status === "confirmed" && assigned > 0) return "assigned";
  if (status === "assigned" && assigned === 0) return "confirmed";
  return status;
}

export const canAssign = (status: BookingStatus) => status === "confirmed" || status === "assigned";
export const canQuote = (current: Pick<Current, "status" | "quoteRequired" | "quoteStatus">) =>
  current.quoteRequired && current.status === "pending" && (current.quoteStatus === "none" || current.quoteStatus === "sent");

/** A card link only makes sense for card payments, and only a paid booking can be refunded. */
export function isValidPayment(method: PaymentMethod, status: PaymentStatus, previous: PaymentStatus) {
  if (status === "link_sent" && method !== "card_link") return false;
  if (status === "refunded" && previous !== "paid" && previous !== "refunded") return false;
  return true;
}

/** "180" or "180.50" AED to fils. Returns null for anything else, including more than two decimals. */
export function parseAed(value: string) {
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const fils = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return fils > 0 && fils <= 10_000_000 ? fils : null;
}

/** True when two time ranges share any moment. Touching ends do not count. */
export function overlaps(a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}
