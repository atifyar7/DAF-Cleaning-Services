import { describe, expect, it } from "vitest";
import { isInDubai, normalizeUaeMobile } from "@/lib/booking/input";
import {
  buildSlots,
  isSlotAllowed,
  peakCleaners,
  priceBooking,
  type BookingSettings,
  type CatalogService,
} from "@/lib/booking/rules";
import { addDays, displayTime, dubaiDate, dubaiInstant, isValidDate, parseTime, weekday } from "@/lib/booking/time";

const settings: BookingSettings = {
  capacity: 50,
  openMinutes: 9 * 60,
  closeMinutes: 19 * 60,
  slotMinutes: 30,
  minHours: 2,
  maxHours: 10,
  maxCleaners: 10,
  leadMinutes: 120,
  maxDaysAhead: 60,
};
const hourly: CatalogService = { slug: "general-cleaning", category: "housekeeping", pricingModel: "hourly", priceFils: 3500 };
const quote: CatalogService = { slug: "plumbing", category: "technical", pricingModel: "quote", priceFils: null };
// 06:00 Dubai time on 10 Nov 2026.
const now = new Date("2026-11-10T02:00:00Z");

describe("Dubai time", () => {
  it("uses UTC+4 for dates and times", () => {
    expect(dubaiDate(new Date("2026-11-10T19:59:00Z"))).toBe("2026-11-10");
    expect(dubaiDate(new Date("2026-11-10T20:00:00Z"))).toBe("2026-11-11");
    expect(dubaiInstant("2026-11-10", 9 * 60).toISOString()).toBe("2026-11-10T05:00:00.000Z");
  });

  it("handles month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-11-10", 60)).toBe("2027-01-09");
  });

  it("rejects impossible dates and times", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-11-10")).toBe(true);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("9:00")).toBeNull();
    expect(parseTime("18:30")).toBe(1110);
  });

  it("formats times in both languages", () => {
    expect(displayTime(9 * 60, "en")).toBe("9:00 AM");
    expect(displayTime(12 * 60 + 30, "en")).toBe("12:30 PM");
    expect(displayTime(17 * 60, "ar")).toBe("5:00 م");
    expect(weekday("2026-11-09")).toBe(0);
  });
});

describe("price", () => {
  it.each([
    [1, 2, 7000],
    [2, 3, 21000],
    [10, 10, 350000],
  ])("%i cleaners for %i hours costs %i fils", (cleaners, hours, fils) => {
    expect(priceBooking(hourly, cleaners, hours)).toEqual({ quoteRequired: false, serviceFils: fils, totalFils: fils });
  });

  it("matches the website example: 2 cleaners x 3 hours = AED 210", () => {
    expect(priceBooking(hourly, 2, 3).totalFils! / 100).toBe(210);
  });

  it("never prices a quote service", () => {
    expect(priceBooking(quote, 3, 5)).toEqual({ quoteRequired: true, serviceFils: null, totalFils: null });
  });
});

describe("time slots", () => {
  const slots = (date: string, duration: number, extra: Partial<Parameters<typeof buildSlots>[0]> = {}) =>
    buildSlots({ date, duration, cleaners: 1, usesCapacity: true, now, settings, bookings: [], ...extra });

  it("only offers times that finish by 7:00 PM", () => {
    const list = slots("2026-11-11", 120);
    expect(list[0].time).toBe("09:00");
    expect(list.at(-1)!.time).toBe("17:00");
    expect(list).toHaveLength(17);
  });

  it("offers a single slot for a 10-hour booking", () => {
    expect(slots("2026-11-11", 600).map((slot) => slot.time)).toEqual(["09:00"]);
  });

  it("respects the 2-hour lead time today", () => {
    // 1:10 PM in Dubai, so the first slot is 3:30 PM.
    const afternoon = new Date("2026-11-10T09:10:00Z");
    expect(slots("2026-11-10", 120, { now: afternoon }).map((slot) => slot.time)).toEqual(["15:30", "16:00", "16:30", "17:00"]);
  });

  it("offers nothing in the past or beyond 60 days", () => {
    expect(slots("2026-11-09", 120)).toEqual([]);
    expect(slots("2027-01-09", 120)).not.toEqual([]);
    expect(slots("2027-01-10", 120)).toEqual([]);
  });

  it("rejects times that are off-grid, too late or not real", () => {
    const base = { date: "2026-11-11", duration: 120, cleaners: 1, usesCapacity: false, now, settings };
    expect(isSlotAllowed({ ...base, time: "09:00" })).toBe(true);
    expect(isSlotAllowed({ ...base, time: "09:15" })).toBe(false);
    expect(isSlotAllowed({ ...base, time: "17:30" })).toBe(false);
    expect(isSlotAllowed({ ...base, time: "08:30" })).toBe(false);
    expect(isSlotAllowed({ ...base, time: "25:00" })).toBe(false);
  });
});

describe("capacity", () => {
  const at = (hour: number) => dubaiInstant("2026-11-11", hour * 60);
  const block = (from: number, to: number, cleaners: number) => ({ startAt: at(from), endAt: at(to), cleaners });

  it("counts the busiest moment, not every overlapping booking", () => {
    // 9-11 and 11-13 never overlap each other, so 10-12 sees at most 30 cleaners at once.
    const bookings = [block(9, 11, 30), block(11, 13, 30)];
    expect(peakCleaners(bookings, at(10), at(12))).toBe(30);
    expect(peakCleaners([...bookings, block(10.5, 11.5, 15)], at(10), at(12))).toBe(45);
  });

  it("treats back-to-back bookings as free", () => {
    expect(peakCleaners([block(9, 11, 50)], at(11), at(13))).toBe(0);
  });

  it("marks a time full when the extra cleaners would pass 50", () => {
    const bookings = [block(9, 13, 45)];
    const list = buildSlots({ date: "2026-11-11", duration: 120, cleaners: 6, usesCapacity: true, now, settings, bookings });
    expect(list.find((slot) => slot.time === "11:00")!.available).toBe(false);
    expect(list.find((slot) => slot.time === "13:00")!.available).toBe(true);
    const five = buildSlots({ date: "2026-11-11", duration: 120, cleaners: 5, usesCapacity: true, now, settings, bookings });
    expect(five.find((slot) => slot.time === "11:00")!.available).toBe(true);
  });
});

describe("contact details", () => {
  it.each([
    ["050 123 4567", "+971501234567"],
    ["+971 52 929 1256", "+971529291256"],
    ["00971507643834", "+971507643834"],
    ["(055) 123-4567", "+971551234567"],
  ])("accepts %s", (input, normalized) => {
    expect(normalizeUaeMobile(input)).toBe(normalized);
  });

  it.each(["04 123 4567", "+44 7700 900123", "050 123 456", "abc"])("rejects %s", (input) => {
    expect(normalizeUaeMobile(input)).toBeNull();
  });

  it("only accepts map pins inside Dubai", () => {
    expect(isInDubai(25.2048, 55.2708)).toBe(true);
    expect(isInDubai(24.4539, 54.3773)).toBe(false);
    expect(isInDubai(25.3463, 55.4209)).toBe(true);
  });
});
