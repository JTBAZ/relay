/**
 * Creator-local wall clock ↔ UTC for Goal Cycle logistics edits (client).
 * Keep in sync with `src/goal-cycle/planner/schedule-local.ts`.
 */

export type ParsedScheduledLocal = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

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

function localPartsInZone(date: Date, timeZone: string): ParsedScheduledLocal {
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

/**
 * Calendar day / wall-clock display timezone for the Schedule Rail.
 * Posting goals default to UTC; until a creator sets a real zone, prefer the
 * browser zone so evening local events don't land on the next UTC day row.
 */
export function resolveScheduleDisplayTimeZone(
  apiTimezone: string | null | undefined
): string {
  const tz = (apiTimezone ?? "UTC").trim() || "UTC";
  if (tz !== "UTC") return tz;
  if (typeof Intl !== "undefined") {
    try {
      const browser = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
      if (browser) return browser;
    } catch {
      /* ignore */
    }
  }
  return "UTC";
}

/** Convert `<input type="datetime-local">` value to UTC ISO in a creator zone. */
export function isoFromDatetimeLocal(datetimeLocal: string, timeZone: string): string {
  const parsed = parseScheduledLocal(datetimeLocal);
  if (!parsed) {
    const fallback = new Date(datetimeLocal);
    if (Number.isNaN(fallback.getTime())) {
      throw new Error("Invalid datetime-local value.");
    }
    return fallback.toISOString();
  }
  return zonedLocalDateTimeToUtc({ ...parsed, second: 0 }, timeZone).toISOString();
}

/** Format a UTC instant as `YYYY-MM-DDTHH:mm` for datetime-local in a zone. */
export function datetimeLocalFromIso(iso: string, timeZone: string): string {
  const parts = localPartsInZone(new Date(iso), timeZone.trim() || "UTC");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatInstantInTimeZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone.trim() || "UTC",
      ...options,
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", options).format(new Date(iso));
  }
}

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
