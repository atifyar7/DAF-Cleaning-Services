// Dubai has no daylight saving, so local time is always UTC+4. Working with this fixed offset
// keeps every date calculation the same on the server, in the browser and in tests.
const DUBAI_OFFSET_MINUTES = 4 * 60;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Today's date in Dubai as YYYY-MM-DD. */
export function dubaiDate(now: Date) {
  return new Date(now.getTime() + DUBAI_OFFSET_MINUTES * MINUTE).toISOString().slice(0, 10);
}

/** The instant a Dubai date plus minutes after midnight happens. */
export function dubaiInstant(date: string, minutes: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, minutes) - DUBAI_OFFSET_MINUTES * MINUTE);
}

export function addDays(date: string, days: number) {
  return new Date(dubaiInstant(date, 0).getTime() + days * DAY + DUBAI_OFFSET_MINUTES * MINUTE)
    .toISOString()
    .slice(0, 10);
}

export function isValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** "09:30" to 570. Returns null for anything that is not a real time of day. */
export function parseTime(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function formatTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 570 to "9:30 AM", or "9:30 ص" in Arabic. Digits stay Western so they match everywhere else on the site. */
export function displayTime(minutes: number, locale: string) {
  const hours = Math.floor(minutes / 60);
  const hour12 = hours % 12 || 12;
  const suffix = locale === "ar" ? (hours < 12 ? "ص" : "م") : hours < 12 ? "AM" : "PM";
  return `${hour12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

/** A moment as its Dubai date and minutes after midnight. */
export function dubaiParts(moment: Date) {
  const local = new Date(moment.getTime() + DUBAI_OFFSET_MINUTES * MINUTE);
  return { date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** "2026-11-10" to "10 November 2026" using the given month names. */
export function displayDate(date: string, months: string[]) {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${months[month - 1]} ${year}`;
}

/** Day of week for a Dubai date, Monday = 0. */
export function weekday(date: string) {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}
