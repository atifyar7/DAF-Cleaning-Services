import { addDays, dubaiDate, dubaiInstant, formatTime, isValidDate, parseTime } from "./time";

export type BookingSettings = {
  capacity: number;
  openMinutes: number;
  closeMinutes: number;
  slotMinutes: number;
  minHours: number;
  maxHours: number;
  maxCleaners: number;
  leadMinutes: number;
  maxDaysAhead: number;
};

export type CatalogService = {
  slug: string;
  category: string;
  pricingModel: "hourly" | "fixed" | "quote";
  priceFils: number | null;
};

/** Quote visits hold a one-hour arrival window and do not use cleaner capacity. */
export const QUOTE_VISIT_MINUTES = 60;

export function isQuote(service: CatalogService) {
  return service.pricingModel !== "hourly" || service.priceFils === null;
}

/** Only housekeeping bookings can include ironing or laundry. */
export function allowsAddOns(service: CatalogService) {
  return service.category === "housekeeping";
}

export function durationMinutes(service: CatalogService, hours: number) {
  return isQuote(service) ? QUOTE_VISIT_MINUTES : hours * 60;
}

export type Price = {
  quoteRequired: boolean;
  serviceFils: number | null;
  totalFils: number | null;
};

/** The only place a booking price is calculated. Add-ons have no price yet, so they never change the total. */
export function priceBooking(service: CatalogService, cleaners: number, hours: number): Price {
  if (isQuote(service)) return { quoteRequired: true, serviceFils: null, totalFils: null };
  const serviceFils = service.priceFils! * cleaners * hours;
  return { quoteRequired: false, serviceFils, totalFils: serviceFils };
}

export type ExistingBooking = { startAt: Date; endAt: Date; cleaners: number };

/** The most cleaners already booked at any single moment between start and end. */
export function peakCleaners(bookings: ExistingBooking[], start: Date, end: Date) {
  const points = [start, ...bookings.map((b) => b.startAt).filter((t) => t > start && t < end)];
  let peak = 0;
  for (const point of points) {
    const used = bookings
      .filter((b) => b.startAt <= point && b.endAt > point)
      .reduce((sum, b) => sum + b.cleaners, 0);
    peak = Math.max(peak, used);
  }
  return peak;
}

export type Slot = { time: string; available: boolean };

type SlotRequest = {
  date: string;
  duration: number;
  cleaners: number;
  usesCapacity: boolean;
  now: Date;
  settings: BookingSettings;
  bookings: ExistingBooking[];
};

export function isDateBookable(date: string, now: Date, settings: BookingSettings) {
  if (!isValidDate(date)) return false;
  const today = dubaiDate(now);
  return date >= today && date <= addDays(today, settings.maxDaysAhead);
}

/** Start times on a day that end by closing time and are far enough ahead. Full times are marked unavailable. */
export function buildSlots({ date, duration, cleaners, usesCapacity, now, settings, bookings }: SlotRequest): Slot[] {
  if (!isDateBookable(date, now, settings)) return [];
  const earliest = now.getTime() + settings.leadMinutes * 60_000;
  const slots: Slot[] = [];
  for (let minutes = settings.openMinutes; minutes + duration <= settings.closeMinutes; minutes += settings.slotMinutes) {
    const start = dubaiInstant(date, minutes);
    if (start.getTime() < earliest) continue;
    const end = new Date(start.getTime() + duration * 60_000);
    const available = !usesCapacity || peakCleaners(bookings, start, end) + cleaners <= settings.capacity;
    slots.push({ time: formatTime(minutes), available });
  }
  return slots;
}

/** Checks a requested start time against the same rules used to list slots. */
export function isSlotAllowed(request: Omit<SlotRequest, "bookings"> & { time: string }) {
  const minutes = parseTime(request.time);
  if (minutes === null) return false;
  return buildSlots({ ...request, usesCapacity: false, bookings: [] }).some((slot) => slot.time === request.time);
}
