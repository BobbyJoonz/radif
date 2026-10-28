/**
 * Time arithmetic in the tenant's timezone.
 *
 * Stored timestamps are UTC. SLA minutes and working hours are the *shop's*
 * minutes, evaluated in `Tenant.timezone` (Asia/Tehran by default) — never in the
 * server's timezone and never in the browser's. Tehran has had no DST since 2022,
 * but the two-pass offset lookup below does not assume that, so the same code
 * keeps working for another tenant in a DST-observing zone.
 */

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Calendar/clock fields of an instant, as seen in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // Some engines report midnight as "24" when hour12 is false.
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Offset in milliseconds: `wallClock(tz) - instant`. */
export function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

/**
 * The UTC instant at which the tenant's local day begins.
 *
 * Two passes: the first guess uses the offset at `reference`; if that guess lands
 * in a different offset (a DST boundary), the second pass uses the offset at the
 * result. Cheap, and correct for both fixed-offset and DST zones.
 */
export function startOfZonedDay(reference: Date, timeZone: string): Date {
  const local = zonedParts(reference, timeZone);
  return startOfZonedDate(local.year, local.month, local.day, timeZone);
}

export function startOfZonedDate(year: number, month: number, day: number, timeZone: string): Date {
  const naive = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const firstOffset = zoneOffsetMs(naive, timeZone);
  let result = new Date(naive.getTime() - firstOffset);
  const secondOffset = zoneOffsetMs(result, timeZone);
  if (secondOffset !== firstOffset) result = new Date(naive.getTime() - secondOffset);
  return result;
}

/** The local day after `dayStart` (handles month/year rollover via UTC arithmetic). */
export function nextZonedDay(dayStart: Date, timeZone: string): Date {
  const local = zonedParts(dayStart, timeZone);
  return startOfZonedDate(local.year, local.month, local.day + 1, timeZone);
}

/**
 * The inverse of `zonedParts`: a wall-clock time in `timeZone` → the UTC instant.
 * Used when an imported row says `2026-10-28 21:04` with no offset: the seller's
 * export is in the shop's local time, so that is how it is read. Guessing "UTC" or
 * "the server's zone" would shift every imported message by hours.
 */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = "UTC",
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const firstOffset = zoneOffsetMs(new Date(naive), timeZone);
  let result = new Date(naive - firstOffset);
  const secondOffset = zoneOffsetMs(result, timeZone);
  if (secondOffset !== firstOffset) result = new Date(naive - secondOffset);
  return result;
}

/** 0-23, in the tenant's timezone. */
export function zonedHour(date: Date, timeZone: string): number {
  return zonedParts(date, timeZone).hour;
}

/** `2026-10-28` in the tenant's timezone — used as a grouping key, not a display. */
export function zonedDayKey(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

/**
 * `overdue` · `today` · `soon` · `none` — the four words the UI prints next to a
 * deadline. "soon" is deliberately generous (48h): it is a nudge, not a promise.
 */
export function dueLabelOf(
  dueAt: Date | null,
  now: Date,
  timeZone: string,
): "overdue" | "today" | "soon" | "none" {
  if (!dueAt) return "none";
  if (dueAt.getTime() < now.getTime()) return "overdue";
  if (zonedDayKey(dueAt, timeZone) === zonedDayKey(now, timeZone)) return "today";
  if (dueAt.getTime() - now.getTime() <= 48 * 60 * 60 * 1000) return "soon";
  return "none";
}

/** Elapsed whole minutes from `from` to `to`, never negative. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

/** Midnight UTC of a timestamp's own UTC day — for stable test fixtures only. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
