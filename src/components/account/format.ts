import { displayDate, displayTime, dubaiParts } from "@/lib/booking/time";

export function aed(fils: number, locale: string) {
  const amount = Number.isInteger(fils / 100) ? String(fils / 100) : (fils / 100).toFixed(2);
  return locale === "ar" ? `${amount} درهمًا` : `AED ${amount}`;
}

/** A booking's start in Dubai time, for example "16 December 2026" and "10:00 AM". */
export function when(moment: Date, months: string[], locale: string) {
  const { date, minutes } = dubaiParts(moment);
  return { date: displayDate(date, months), time: displayTime(minutes, locale) };
}

/** Day and short month for a date badge. Arabic month names stay whole; they have no common short form. */
export function badgeDate(moment: Date, months: string[], locale: string) {
  const { date } = dubaiParts(moment);
  const [, month, day] = date.split("-").map(Number);
  const name = months[month - 1];
  return { day, month: locale === "ar" ? name : name.slice(0, 3) };
}

export function timeRange(start: Date, end: Date, locale: string, withEnd = true) {
  const from = displayTime(dubaiParts(start).minutes, locale);
  return withEnd ? `${from} – ${displayTime(dubaiParts(end).minutes, locale)}` : from;
}

/** Time of day in Dubai, for the greeting. */
export function greetingKey(now = new Date()) {
  const hour = dubaiParts(now).minutes / 60;
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

export function initials(name: string, email: string) {
  const words = (name || email).trim().split(/[\s@._-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export const statusTone: Record<string, { chip: string; dot: string }> = {
  pending: { chip: "bg-warning-soft text-warning", dot: "bg-warning" },
  confirmed: { chip: "bg-accent-soft text-accent", dot: "bg-accent" },
  assigned: { chip: "bg-accent-soft text-accent", dot: "bg-accent" },
  in_progress: { chip: "bg-accent-soft text-accent", dot: "bg-accent animate-pulse" },
  completed: { chip: "bg-surface text-muted ring-1 ring-border", dot: "bg-muted" },
  cancelled: { chip: "bg-danger-soft text-danger", dot: "bg-danger" },
};
