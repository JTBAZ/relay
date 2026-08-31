/**
 * Creator-TZ finite release plan (RC-P9-T01).
 * Weekly/interval slots over a frozen ID list. DST-safe via Goal Cycle zonedLocalDateTimeToUtc.
 * Lab 2 may pin due_ats in the ChangeSet payload; this compiler is the Lab 3 default.
 */
import { CommandContractError } from "./contracts.js";
import {
  parseScheduledLocal,
  zonedLocalDateTimeToUtc,
  type ParsedScheduledLocal
} from "../../goal-cycle/planner/schedule-local.js";

/** Lab 2 eval/seed pin only. Never the Lab 3 / production-shaped default. */
export const LAB2_FIXTURE_WEEKLY_START_UTC = "2026-08-27T19:00:00.000Z";

export const FINITE_PLAN_WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const;

export type FinitePlanWeekdayName = (typeof FINITE_PLAN_WEEKDAYS)[number];

/** Sunday = 0 … Saturday = 6 (JS `Date#getUTCDay`). */
export type FinitePlanSlot = {
  post_id: string;
  due_at: string;
};

export type CommandFinitePlanState = {
  version: number;
  time_zone: string;
  weekday: number;
  interval_days: number;
  start_local: string;
  exclude_post_ids: string[];
  skip_post_ids: string[];
  slot_overrides: Record<string, string>;
};

export type CompileFinitePlanInput = {
  frozen_post_ids: readonly string[];
  skip_post_ids?: readonly string[];
  exclude_post_ids?: readonly string[];
  time_zone: string;
  weekday: number | string;
  interval_days: number;
  start_local: string;
  slot_overrides?: Readonly<Record<string, string>>;
};

const WEEKDAY_INDEX: Record<string, number> = Object.fromEntries(
  FINITE_PLAN_WEEKDAYS.map((name, index) => [name, index])
);

function uniqueOrdered(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function assertIanaTimeZone(raw: string): string {
  const tz = raw.trim();
  if (!tz) {
    throw new CommandContractError("COMMAND_VALIDATION", "time_zone is required.", [
      { field: "time_zone", issue: "empty" }
    ]);
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    throw new CommandContractError("COMMAND_VALIDATION", "time_zone must be a valid IANA zone.", [
      { field: "time_zone", issue: tz }
    ]);
  }
  return tz;
}

export function parseFinitePlanWeekday(raw: number | string): number {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 6) {
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed in WEEKDAY_INDEX) return WEEKDAY_INDEX[trimmed]!;
    const asNum = Number(trimmed);
    if (Number.isInteger(asNum) && asNum >= 0 && asNum <= 6) return asNum;
  }
  throw new CommandContractError("COMMAND_VALIDATION", "weekday must be 0–6 or a weekday name.", [
    { field: "weekday", issue: String(raw) }
  ]);
}

export function parseFinitePlanIntervalDays(raw: number): number {
  if (!Number.isInteger(raw) || raw < 1 || raw > 366) {
    throw new CommandContractError("COMMAND_VALIDATION", "interval_days must be an integer from 1 to 366.", [
      { field: "interval_days", issue: String(raw) }
    ]);
  }
  return raw;
}

function addCalendarDays(parts: ParsedScheduledLocal, days: number): ParsedScheduledLocal {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0);
  const next = new Date(utc);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function weekdayOfYmd(parts: ParsedScheduledLocal): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)).getUTCDay();
}

export function weekdayFromStartLocal(startLocal: string): number {
  const parts = parseScheduledLocal(startLocal);
  if (!parts) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "start_local must be YYYY-MM-DDTHH:mm[:ss].",
      [{ field: "start_local", issue: startLocal.trim() || "empty" }]
    );
  }
  return weekdayOfYmd(parts);
}

function snapToWeekday(start: ParsedScheduledLocal, weekday: number): ParsedScheduledLocal {
  let current = start;
  for (let i = 0; i < 7; i += 1) {
    if (weekdayOfYmd(current) === weekday) return current;
    current = addCalendarDays(current, 1);
  }
  return start;
}

export function parseDueAtIso(raw: string, field = "due_at"): string {
  const trimmed = raw.trim();
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    throw new CommandContractError("COMMAND_VALIDATION", "due_at must be an ISO-8601 timestamp.", [
      { field, issue: trimmed || "empty" }
    ]);
  }
  return new Date(ms).toISOString();
}

export function lab2FixtureWeeklyDueDates(count: number): Date[] {
  const start = new Date(LAB2_FIXTURE_WEEKLY_START_UTC);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i * 7);
    return d;
  });
}

/**
 * Map frozen IDs (minus skip/exclude) onto cadence slots in creator-local time.
 * Slot overrides replace due_at for that post; they do not shift neighbors.
 */
export function compileFinitePlan(input: CompileFinitePlanInput): FinitePlanSlot[] {
  const timeZone = assertIanaTimeZone(input.time_zone);
  const weekday = parseFinitePlanWeekday(input.weekday);
  const intervalDays = parseFinitePlanIntervalDays(input.interval_days);
  const startParts = parseScheduledLocal(input.start_local);
  if (!startParts) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "start_local must be YYYY-MM-DDTHH:mm[:ss].",
      [{ field: "start_local", issue: input.start_local.trim() || "empty" }]
    );
  }

  const skip = new Set(uniqueOrdered(input.skip_post_ids ?? []));
  const excluded = new Set(uniqueOrdered(input.exclude_post_ids ?? []));
  const frozen = uniqueOrdered(input.frozen_post_ids);
  const ordered: string[] = [];
  for (const id of frozen) {
    if (skip.has(id) || excluded.has(id)) continue;
    ordered.push(id);
  }

  const firstLocal = snapToWeekday(startParts, weekday);
  const overrides = input.slot_overrides ?? {};
  return ordered.map((postId, index) => {
    const override = overrides[postId];
    if (typeof override === "string" && override.trim()) {
      return { post_id: postId, due_at: parseDueAtIso(override) };
    }
    const local = addCalendarDays(firstLocal, index * intervalDays);
    return {
      post_id: postId,
      due_at: zonedLocalDateTimeToUtc(local, timeZone).toISOString()
    };
  });
}
