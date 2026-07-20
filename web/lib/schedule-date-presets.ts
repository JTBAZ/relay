/**
 * Conversational schedule date presets for Create Event (Post dialogue).
 * Resolves to absolute local `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`.
 * Keep in sync with creator timezone from the Schedule Rail.
 */

import {
  formatScheduledLocal,
  parseScheduledLocal,
  type ParsedScheduledLocal,
  zonedLocalDateTimeToUtc
} from "@/lib/goal-cycle-schedule-local";

export type ScheduleDatePresetId = "tomorrow" | "this_weekend" | "end_of_month" | "choose_date";

export type ScheduleDatePreset = {
  id: ScheduleDatePresetId;
  label: string;
};

export const SCHEDULE_DATE_PRESETS: ScheduleDatePreset[] = [
  { id: "tomorrow", label: "Tomorrow" },
  { id: "this_weekend", label: "This weekend" },
  { id: "end_of_month", label: "End of month" },
  { id: "choose_date", label: "Choose a date" }
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
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

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addLocalDays(parts: ParsedScheduledLocal, days: number): ParsedScheduledLocal {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0);
  const d = new Date(utc);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

/** JS weekday: 0=Sun … 6=Sat for a Y-M-D calendar date (UTC noon trick). */
function weekdayOfLocalDate(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

function withTime(
  dateParts: Pick<ParsedScheduledLocal, "year" | "month" | "day">,
  timeParts: Pick<ParsedScheduledLocal, "hour" | "minute" | "second">
): ParsedScheduledLocal {
  return {
    year: dateParts.year,
    month: dateParts.month,
    day: dateParts.day,
    hour: timeParts.hour,
    minute: timeParts.minute,
    second: timeParts.second
  };
}

function toDatetimeLocalValue(parts: ParsedScheduledLocal): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Resolve a preset to a datetime-local string in the creator timezone.
 * Uses the hour/minute from `currentDatetimeLocal` (or defaults to next whole hour).
 */
export function resolveScheduleDatePreset(args: {
  preset: ScheduleDatePresetId;
  timeZone: string;
  now?: Date;
  /** Current datetime-local value — time-of-day is preserved across presets. */
  currentDatetimeLocal?: string;
}): string | null {
  if (args.preset === "choose_date") return null;

  const tz = (args.timeZone || "UTC").trim() || "UTC";
  const now = args.now ?? new Date();
  const nowLocal = localPartsInZone(now, tz);

  const parsedCurrent = args.currentDatetimeLocal
    ? parseScheduledLocal(args.currentDatetimeLocal)
    : null;
  const time: Pick<ParsedScheduledLocal, "hour" | "minute" | "second"> = parsedCurrent
    ? { hour: parsedCurrent.hour, minute: parsedCurrent.minute, second: 0 }
    : {
        hour: (nowLocal.hour + 1) % 24,
        minute: 0,
        second: 0
      };

  let candidate: ParsedScheduledLocal;

  if (args.preset === "tomorrow") {
    candidate = withTime(addLocalDays(nowLocal, 1), time);
  } else if (args.preset === "this_weekend") {
    // Prefer Saturday, else Sunday; if both slots have passed this weekend, roll to next Saturday.
    const dow = weekdayOfLocalDate(nowLocal.year, nowLocal.month, nowLocal.day);
    const daysToSaturday = (6 - dow + 7) % 7;
    const daysToSunday = (7 - dow) % 7;

    const trySlot = (daysAhead: number): ParsedScheduledLocal | null => {
      const date = withTime(addLocalDays(nowLocal, daysAhead), time);
      const utc = zonedLocalDateTimeToUtc(date, tz);
      return utc.getTime() > now.getTime() ? date : null;
    };

    candidate =
      trySlot(daysToSaturday) ??
      trySlot(daysToSunday) ??
      withTime(addLocalDays(nowLocal, daysToSaturday === 0 ? 7 : daysToSaturday || 7), time);
  } else {
    // end_of_month
    const lastDay = daysInMonth(nowLocal.year, nowLocal.month);
    let end = withTime(
      { year: nowLocal.year, month: nowLocal.month, day: lastDay },
      time
    );
    const endUtc = zonedLocalDateTimeToUtc(end, tz);
    if (endUtc.getTime() <= now.getTime()) {
      const nextMonth = nowLocal.month === 12 ? 1 : nowLocal.month + 1;
      const nextYear = nowLocal.month === 12 ? nowLocal.year + 1 : nowLocal.year;
      const nextLast = daysInMonth(nextYear, nextMonth);
      end = withTime({ year: nextYear, month: nextMonth, day: nextLast }, time);
    }
    candidate = end;
  }

  // If resolved slot is still in the past (e.g. tomorrow with a time already passed somehow), push +1 day.
  let utc = zonedLocalDateTimeToUtc(candidate, tz);
  if (utc.getTime() <= now.getTime()) {
    candidate = withTime(addLocalDays(candidate, 1), time);
    utc = zonedLocalDateTimeToUtc(candidate, tz);
  }

  return toDatetimeLocalValue(candidate);
}

/** Human-readable confirmation for the resolved local datetime. */
export function formatResolvedScheduleLabel(
  datetimeLocal: string,
  timeZone: string,
  now?: Date
): string {
  const parsed = parseScheduledLocal(datetimeLocal);
  if (!parsed) return datetimeLocal;
  const tz = (timeZone || "UTC").trim() || "UTC";
  const utc = zonedLocalDateTimeToUtc({ ...parsed, second: 0 }, tz);
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(utc);
  } catch {
    return formatScheduledLocal({ ...parsed, second: 0 });
  }
}

export function defaultScheduleDatetimeLocal(timeZone: string, now?: Date): string {
  const tz = (timeZone || "UTC").trim() || "UTC";
  const n = now ?? new Date();
  const local = localPartsInZone(n, tz);
  const nextHour = (local.hour + 1) % 24;
  const bumped =
    nextHour === 0
      ? withTime(addLocalDays(local, 1), { hour: 0, minute: 0, second: 0 })
      : withTime(local, { hour: nextHour, minute: 0, second: 0 });
  return toDatetimeLocalValue(bumped);
}
