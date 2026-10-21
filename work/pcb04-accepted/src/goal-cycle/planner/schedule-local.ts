/**
 * Creator-local wall clock ↔ UTC for Goal Cycle Plan slots.
 * Logistics edits `scheduled_local`; materialization / Schedule Rail use `scheduled_utc`.
 */

export type ParsedScheduledLocal = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Parse `YYYY-MM-DDTHH:mm[:ss]` (or space separator). */
export function parseScheduledLocal(raw: string): ParsedScheduledLocal | null {
  const m = raw
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? "0");
  if (
    ![year, month, day, hour, minute, second].every((n) => Number.isFinite(n)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  return { year, month, day, hour, minute, second };
}

export function formatScheduledLocal(parts: ParsedScheduledLocal): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/** Value for `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`). */
export function toDatetimeLocalInputValue(scheduledLocal: string): string {
  const parsed = parseScheduledLocal(scheduledLocal);
  if (!parsed) {
    const slice = scheduledLocal.trim().slice(0, 16);
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slice) ? slice : "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}T${pad(parsed.hour)}:${pad(parsed.minute)}`;
}

export function fromDatetimeLocalInputValue(value: string): string {
  const parsed = parseScheduledLocal(value);
  if (!parsed) return value.trim();
  return formatScheduledLocal({ ...parsed, second: 0 });
}

function localPartsInZone(
  date: Date,
  timeZone: string
): ParsedScheduledLocal {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });
  const parts = fmt.formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second")
  };
}

/**
 * Resolve UTC instant for a wall-clock time in `timeZone`.
 * Iterative offset correction (no date-fns-tz dependency).
 */
export function zonedLocalDateTimeToUtc(
  parts: ParsedScheduledLocal,
  timeZone: string
): Date {
  const tz = timeZone.trim() || "UTC";
  if (tz === "UTC") {
    return new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    );
  }

  let utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  for (let i = 0; i < 4; i += 1) {
    const seen = localPartsInZone(new Date(utcMs), tz);
    const asUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second
    );
    const desired = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const delta = desired - asUtc;
    if (delta === 0) break;
    utcMs += delta;
  }
  return new Date(utcMs);
}

/** Sync `scheduled_utc` from `scheduled_local` + slot/plan time zone. */
export function syncSlotScheduledUtc<
  T extends { scheduled_local: string; scheduled_utc: string; time_zone: string }
>(slot: T, fallbackTimeZone?: string): T {
  const parsed = parseScheduledLocal(slot.scheduled_local);
  if (!parsed) return slot;
  const tz = (slot.time_zone || fallbackTimeZone || "UTC").trim() || "UTC";
  const utc = zonedLocalDateTimeToUtc(parsed, tz);
  return {
    ...slot,
    scheduled_local: formatScheduledLocal(parsed),
    scheduled_utc: utc.toISOString(),
    time_zone: tz
  };
}
