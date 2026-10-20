import type { TimeSpec } from "./contract.js";
import type { CalendarResolver } from "./compiler.js";
import type { RequestIntent } from "./intent.js";

export type RequestClock = { receivedAtUtc: string; timezone: string | null };
export type AbsoluteTime = Extract<TimeSpec, { kind: "absolute" }>;
export type AbsoluteTimeResolution =
  | { kind: "resolved"; time: AbsoluteTime }
  | { kind: "clarification"; reason: "unknown_time" };

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const utcPattern = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?Z$/;
const weekdayIndex: Record<NonNullable<RequestIntent["weekday"]>, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0
};

function validZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone.trim() || zone.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; }
  catch { return false; }
}

function parseDate(raw: unknown): LocalParts | null {
  if (typeof raw !== "string") return null;
  const m = datePattern.exec(raw);
  if (!m) return null;
  const [year, month, day] = m.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, hour: 0, minute: 0 };
}

function dateString(p: LocalParts): string {
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function timeString(p: LocalParts): string {
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
function localString(p: LocalParts): string { return `${dateString(p)}T${timeString(p)}`; }
function partsAsUtcMs(p: LocalParts): number {
  const date = new Date(0);
  date.setUTCFullYear(p.year, p.month - 1, p.day);
  date.setUTCHours(p.hour, p.minute, 0, 0);
  return date.getTime();
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB-u-ca-gregory-nu-latn", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });
}
function localPartsAt(instant: Date, fmt: Intl.DateTimeFormat): LocalParts {
  const values = new Map(fmt.formatToParts(instant).map(x => [x.type, x.value]));
  return {
    year: Number(values.get("year")), month: Number(values.get("month")), day: Number(values.get("day")),
    hour: Number(values.get("hour")), minute: Number(values.get("minute"))
  };
}
function sameLocal(a: LocalParts, b: LocalParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;
}

/**
 * Find every UTC instant matching one local minute. Offset probes cover both sides
 * of a transition; exact matching chooses the earlier instant during a fold.
 */
function matchingInstants(local: LocalParts, fmt: Intl.DateTimeFormat): number[] {
  const naive = partsAsUtcMs(local);
  const offsets = new Set<number>();
  // A +/- 36 hour window covers every current IANA offset and either side of a
  // date-line transition. Six-hour probes keep this finite and small.
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = naive + hours * 60 * 60 * 1000;
    const seen = localPartsAt(new Date(probe), fmt);
    offsets.add(partsAsUtcMs(seen) - Math.floor(probe / 60_000) * 60_000);
  }
  const matches = new Set<number>();
  for (const offset of offsets) {
    const instant = naive - offset;
    if (sameLocal(localPartsAt(new Date(instant), fmt), local)) matches.add(instant);
  }
  return [...matches].sort((a, b) => a - b);
}

function resolveWallMinute(date: LocalParts, time: string, zone: string): { local: LocalParts; instantMs: number } | null {
  const [hour, minute] = time.split(":").map(Number);
  const target = { ...date, hour, minute };
  const fmt = formatter(zone);
  const direct = matchingInstants(target, fmt);
  if (direct.length) return { local: target, instantMs: direct[0] };

  // A spring gap advances to the first valid minute later on the same date.
  for (let minuteOfDay = hour * 60 + minute + 1; minuteOfDay < 24 * 60; minuteOfDay += 1) {
    const candidate = { ...date, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 };
    const matches = matchingInstants(candidate, fmt);
    if (matches.length) return { local: candidate, instantMs: matches[0] };
  }
  return null;
}

function validClock(clock: RequestClock, zone: string): Date | null {
  if (!clock || typeof clock.receivedAtUtc !== "string" || !validZone(zone)) return null;
  if (clock.timezone !== zone || !validZone(clock.timezone)) return null;
  return parseUtcInstant(clock.receivedAtUtc);
}
function parseUtcInstant(raw: string): Date | null {
  const match = utcPattern.exec(raw);
  const date = match && parseDate(match[1]);
  if (!match || !date) return null;
  const hour = Number(match[2]), minute = Number(match[3]), second = Number(match[4]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const millis = match[5] ? Number(match[5].padEnd(3, "0")) : 0;
  const instant = new Date(partsAsUtcMs({ ...date, hour, minute }) + second * 1000 + millis);
  const iso = instant.toISOString();
  const expected = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${String(millis).padStart(3, "0")}Z`;
  return iso === expected ? instant : null;
}

function dateOfInstant(instant: Date, zone: string): LocalParts {
  return localPartsAt(instant, formatter(zone));
}
function shiftCalendarDays(date: LocalParts, days: number): LocalParts {
  const d = new Date(0);
  d.setUTCFullYear(date.year, date.month - 1, date.day + days);
  d.setUTCHours(0, 0, 0, 0);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: 0, minute: 0 };
}
function mondayOfIsoWeek(date: LocalParts): LocalParts {
  const d = new Date(partsAsUtcMs(date));
  const weekday = d.getUTCDay();
  return shiftCalendarDays(date, -((weekday + 6) % 7));
}

function inheritedTime(previous: AbsoluteTime | undefined, zone: string): string | null {
  if (!previous || previous.kind !== "absolute" || previous.timezone !== zone || !validZone(zone)) return null;
  const m = /^(\d{4}-\d\d-\d\d)T((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(previous.local);
  const date = m && parseDate(m[1]);
  const at = typeof previous.at_utc === "string" ? parseUtcInstant(previous.at_utc) : null;
  if (!m || !date || !at || !sameLocal(localPartsAt(at, formatter(zone)), { ...date, ...parseClockTime(m[2])! })) return null;
  return m[2];
}
function parseClockTime(raw: string): Pick<LocalParts, "hour" | "minute"> | null {
  if (!timePattern.test(raw)) return null;
  const [hour, minute] = raw.split(":").map(Number);
  return { hour, minute };
}

/** Resolve an interpreted local date/weekday against the trusted request clock and creator zone. */
export function resolveAbsoluteTime(
  intent: Pick<RequestIntent, "time_kind" | "local_date" | "weekday" | "weekday_qualifier" | "local_time" | "timezone">,
  requestClock: RequestClock,
  frozenCreatorZone: string | null,
  previousConfirmedTime?: AbsoluteTime
): AbsoluteTimeResolution {
  if (!intent || (intent.time_kind !== "absolute_local" && intent.time_kind !== "weekday")) return { kind: "clarification", reason: "unknown_time" };
  const zone = frozenCreatorZone;
  if (!zone || !validZone(zone) || requestClock?.timezone !== zone || !validClock(requestClock, zone)) return { kind: "clarification", reason: "unknown_time" };
  if (intent.timezone !== null && intent.timezone !== zone) return { kind: "clarification", reason: "unknown_time" };

  const clockInstant = new Date(requestClock.receivedAtUtc);
  let requestedDate: LocalParts | null = null;
  let requestedTime: string | null = null;
  const inherited = intent.local_time === null ? inheritedTime(previousConfirmedTime, zone) : null;
  if (intent.time_kind === "absolute_local") {
    requestedDate = parseDate(intent.local_date);
    requestedTime = intent.local_time ?? inherited;
  } else {
    requestedTime = intent.local_time ?? inherited;
    if (!intent.weekday || (intent.weekday_qualifier !== null && intent.weekday_qualifier !== "this" && intent.weekday_qualifier !== "next")) return { kind: "clarification", reason: "unknown_time" };
    const today = dateOfInstant(clockInstant, zone);
    const targetWeekday = weekdayIndex[intent.weekday];
    const currentWeekMonday = mondayOfIsoWeek(today);
    if (intent.weekday_qualifier === "this") {
      requestedDate = shiftCalendarDays(currentWeekMonday, (targetWeekday + 6) % 7);
    } else if (intent.weekday_qualifier === "next") {
      requestedDate = shiftCalendarDays(currentWeekMonday, 7 + (targetWeekday + 6) % 7);
    } else {
      const todayWeekday = new Date(partsAsUtcMs(today)).getUTCDay();
      let days = (targetWeekday - todayWeekday + 7) % 7;
      if (days === 0) days = 0; // today is allowed only when its resolved instant is still future
      requestedDate = shiftCalendarDays(today, days);
    }
  }

  if (!requestedDate || !requestedTime || !timePattern.test(requestedTime)) return { kind: "clarification", reason: "unknown_time" };
  const resolved = resolveWallMinute(requestedDate, requestedTime, zone);
  if (!resolved) return { kind: "clarification", reason: "unknown_time" };
  if (intent.time_kind === "weekday" && intent.weekday_qualifier === null && resolved.instantMs <= clockInstant.getTime()) {
    requestedDate = shiftCalendarDays(requestedDate, 7);
    const next = resolveWallMinute(requestedDate, requestedTime, zone);
    if (!next) return { kind: "clarification", reason: "unknown_time" };
    return { kind: "resolved", time: { kind: "absolute", at_utc: new Date(next.instantMs).toISOString(), timezone: zone, local: localString(next.local) } };
  }
  if (intent.time_kind === "weekday" && intent.weekday_qualifier === "this" && resolved.instantMs <= clockInstant.getTime()) return { kind: "clarification", reason: "unknown_time" };
  return { kind: "resolved", time: { kind: "absolute", at_utc: new Date(resolved.instantMs).toISOString(), timezone: zone, local: localString(resolved.local) } };
}

/** Adapter for compiler.ts; timezone authority comes only from its server request clock. */
export function createCalendarResolver(): CalendarResolver {
  return {
    resolve({ request, requestClock, previousConfirmedTime }) {
      const result = resolveAbsoluteTime(request, requestClock, requestClock.timezone, previousConfirmedTime);
      return result.kind === "resolved" ? result.time : null;
    }
  };
}
