/**
 * Autopost schedule series — recurring posting routines with two-month calendar
 * visibility and just-in-time Autopost draft materialization.
 */

import type { PrismaClient } from "@prisma/client";
import { CreatorPlan } from "@prisma/client";
import { requireCreatorPlanAtLeast } from "../billing/creator-plan-entitlement-service.js";
import {
  createScheduledPostForRail,
  ScheduleRailValidationError
} from "../distribution/schedule-rail-service.js";
import {
  zonedLocalDateTimeToUtc,
  type ParsedScheduledLocal
} from "../goal-cycle/planner/schedule-local.js";
import {
  resolvePostingGoalTimezone,
  zonedMidnightUtc
} from "./posting-goal-service.js";
import { isPlannedPostFormat, type PlannedPostFormat } from "./autopost-draft-service.js";

export const SCHEDULE_SERIES_FEATURE_ENV = "RELAY_FEATURE_SCHEDULE_SERIES";
export const MATERIALIZE_LEAD_DAYS = 7;

/** Ordinary routines vs Automations trigger-only ticks (VS4 / B09). */
export const SCHEDULE_SERIES_MATERIALIZATION_KINDS = [
  "post_draft",
  "automation_trigger"
] as const;
export type ScheduleSeriesMaterializationKind =
  (typeof SCHEDULE_SERIES_MATERIALIZATION_KINDS)[number];

export function isScheduleSeriesFeatureEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = (env[SCHEDULE_SERIES_FEATURE_ENV] ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function isAutomationTriggerSeries(
  kind: string | null | undefined
): boolean {
  return kind === "automation_trigger";
}

function normalizeMaterializationKind(
  raw: string | null | undefined
): ScheduleSeriesMaterializationKind {
  if (raw == null || raw === "" || raw === "post_draft") return "post_draft";
  if (raw === "automation_trigger") return "automation_trigger";
  throw new ScheduleSeriesValidationError(
    "materialization_kind must be post_draft or automation_trigger."
  );
}

export class ScheduleSeriesValidationError extends Error {
  public override readonly name = "ScheduleSeriesValidationError";
  public readonly statusCode = 400;
  public constructor(message: string) {
    super(message);
  }
}

export class ScheduleSeriesNotFoundError extends Error {
  public override readonly name = "ScheduleSeriesNotFoundError";
  public readonly statusCode = 404;
  public constructor(message: string) {
    super(message);
  }
}

export class ScheduleSeriesPlanRequiredError extends Error {
  public override readonly name = "ScheduleSeriesPlanRequiredError";
  public readonly statusCode = 402;
  public readonly required_plan = "autopost";
  public constructor(message = "Autopost plan required for recurring routines.") {
    super(message);
  }
}

const DESTINATIONS = new Set(["patreon", "x", "deviantart", "bluesky"]);

export type ScheduleSeriesCadence = "weekly" | "monthly";

export type CreateScheduleSeriesInput = {
  cadence: ScheduleSeriesCadence;
  interval?: number;
  local_time: string;
  timezone?: string;
  weekdays?: number[];
  month_days?: number[];
  planned_format?: PlannedPostFormat | string;
  destinations: string[];
  remind_me?: boolean;
  title_hint?: string | null;
  starts_at?: string;
  ends_at?: string | null;
  source_post_id?: string | null;
  /** Default post_draft. automation_trigger = calendar ticks only (no blank-post JIT). */
  materialization_kind?: ScheduleSeriesMaterializationKind;
  /** When seeding from a just-created Post event, mark that slot materialized. */
  seed?: {
    due_at: string;
    post_id?: string | null;
    draft_id?: string | null;
    primary_task_id?: string | null;
  };
};

export type PatchScheduleSeriesInput = {
  status?: "active" | "paused" | "ended";
  cadence?: ScheduleSeriesCadence;
  interval?: number;
  local_time?: string;
  timezone?: string;
  weekdays?: number[];
  month_days?: number[];
  planned_format?: PlannedPostFormat | string;
  destinations?: string[];
  remind_me?: boolean;
  title_hint?: string | null;
  ends_at?: string | null;
  delete_future?: boolean;
};

export type ScheduleSeriesWire = {
  series_id: string;
  creator_id: string;
  status: string;
  cadence: string;
  interval: number;
  local_time: string;
  timezone: string;
  weekdays: number[];
  month_days: number[];
  planned_format: string;
  destinations: string[];
  remind_me: boolean;
  title_hint: string | null;
  starts_at: string;
  ends_at: string | null;
  source_post_id: string | null;
  materialization_kind: ScheduleSeriesMaterializationKind;
  last_error: string | null;
  next_occurrence_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleOccurrenceWire = {
  occurrence_id: string;
  series_id: string;
  occurrence_key: string;
  due_at: string;
  status: string;
  post_id: string | null;
  draft_id: string | null;
  primary_task_id: string | null;
  planned_format: string;
  destinations: string[];
  title: string;
  series_cadence: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseLocalTime(raw: string): { hour: number; minute: number } {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new ScheduleSeriesValidationError("local_time must be HH:mm.");
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) {
    throw new ScheduleSeriesValidationError("local_time must be HH:mm.");
  }
  return { hour, minute };
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

function weekdayOfYmd(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

function occurrenceKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Exclusive end: midnight of day 1, two months after the current local month. */
export function twoMonthHorizonEnd(now: Date, timeZone: string): Date {
  const tz = resolvePostingGoalTimezone(timeZone);
  const local = localPartsInZone(now, tz);
  let y = local.year;
  let m = local.month + 2;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return zonedMidnightUtc(y, m, 1, tz);
}

export function enumerateOccurrenceKeysWithTime(args: {
  cadence: ScheduleSeriesCadence;
  interval: number;
  weekdays: number[];
  monthDays: number[];
  timezone: string;
  startsAt: Date;
  endsAt: Date | null;
  horizonEnd: Date;
  hour: number;
  minute: number;
}): Array<{ key: string; dueAt: Date; local: ParsedScheduledLocal }> {
  const tz = resolvePostingGoalTimezone(args.timezone);
  const startLocal = localPartsInZone(args.startsAt, tz);
  const endBound =
    args.endsAt && args.endsAt.getTime() < args.horizonEnd.getTime()
      ? args.endsAt
      : args.horizonEnd;
  const endLocal = localPartsInZone(endBound, tz);
  const out: Array<{ key: string; dueAt: Date; local: ParsedScheduledLocal }> = [];
  const interval = Math.max(1, Math.floor(args.interval || 1));

  if (args.cadence === "weekly") {
    const days = [...new Set(args.weekdays.filter((d) => d >= 0 && d <= 6))].sort(
      (a, b) => a - b
    );
    if (days.length === 0) {
      throw new ScheduleSeriesValidationError("weekdays required for weekly cadence.");
    }
    let cursor = {
      year: startLocal.year,
      month: startLocal.month,
      day: startLocal.day
    };
    const startWeekKey = Math.floor(
      Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day) / (7 * 86400000)
    );
    while (
      cursor.year < endLocal.year ||
      (cursor.year === endLocal.year && cursor.month < endLocal.month) ||
      (cursor.year === endLocal.year &&
        cursor.month === endLocal.month &&
        cursor.day <= endLocal.day)
    ) {
      const dow = weekdayOfYmd(cursor.year, cursor.month, cursor.day);
      if (days.includes(dow)) {
        const weekKey = Math.floor(
          Date.UTC(cursor.year, cursor.month - 1, cursor.day) / (7 * 86400000)
        );
        if ((weekKey - startWeekKey) % interval === 0) {
          const local: ParsedScheduledLocal = {
            year: cursor.year,
            month: cursor.month,
            day: cursor.day,
            hour: args.hour,
            minute: args.minute,
            second: 0
          };
          const dueAt = zonedLocalDateTimeToUtc(local, tz);
          if (
            dueAt.getTime() >= args.startsAt.getTime() &&
            dueAt.getTime() < endBound.getTime()
          ) {
            out.push({
              key: occurrenceKey(cursor.year, cursor.month, cursor.day),
              dueAt,
              local
            });
          }
        }
      }
      const next = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day + 1, 12));
      cursor = {
        year: next.getUTCFullYear(),
        month: next.getUTCMonth() + 1,
        day: next.getUTCDate()
      };
    }
    return out;
  }

  const monthDaysRaw = [...new Set(args.monthDays.filter((d) => d >= 1 && d <= 31))].sort(
    (a, b) => a - b
  );
  if (monthDaysRaw.length === 0) {
    throw new ScheduleSeriesValidationError("month_days required for monthly cadence.");
  }
  let y = startLocal.year;
  let m = startLocal.month;
  let monthIndex = 0;
  const seen = new Set<string>();
  while (y < endLocal.year || (y === endLocal.year && m <= endLocal.month)) {
    if (monthIndex % interval === 0) {
      const dim = daysInMonth(y, m);
      for (const md of monthDaysRaw) {
        const day = Math.min(md, dim);
        const key = occurrenceKey(y, m, day);
        if (seen.has(key)) continue;
        const local: ParsedScheduledLocal = {
          year: y,
          month: m,
          day,
          hour: args.hour,
          minute: args.minute,
          second: 0
        };
        const dueAt = zonedLocalDateTimeToUtc(local, tz);
        if (
          dueAt.getTime() >= args.startsAt.getTime() &&
          dueAt.getTime() < endBound.getTime()
        ) {
          seen.add(key);
          out.push({ key, dueAt, local });
        }
      }
    }
    monthIndex += 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function normalizeDestinations(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of raw) {
    const v = String(d ?? "")
      .trim()
      .toLowerCase();
    if (!DESTINATIONS.has(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  if (out.length === 0) {
    throw new ScheduleSeriesValidationError(
      "destinations must include at least one of patreon, x, deviantart, bluesky."
    );
  }
  return out;
}

async function requireAutopost(prisma: PrismaClient, creatorId: string) {
  const gate = await requireCreatorPlanAtLeast(prisma, creatorId, CreatorPlan.autopost);
  if (!gate.ok) throw new ScheduleSeriesPlanRequiredError();
}

function mapSeries(
  row: {
    id: string;
    creatorId: string;
    status: string;
    cadence: string;
    interval: number;
    localTime: string;
    timezone: string;
    weekdays: number[];
    monthDays: number[];
    plannedFormat: string;
    destinations: string[];
    remindMe: boolean;
    titleHint: string | null;
    startsAt: Date;
    endsAt: Date | null;
    sourcePostId: string | null;
    materializationKind: string;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  nextOccurrenceAt: Date | null
): ScheduleSeriesWire {
  return {
    series_id: row.id,
    creator_id: row.creatorId,
    status: row.status,
    cadence: row.cadence,
    interval: row.interval,
    local_time: row.localTime,
    timezone: row.timezone,
    weekdays: row.weekdays,
    month_days: row.monthDays,
    planned_format: row.plannedFormat,
    destinations: row.destinations,
    remind_me: row.remindMe,
    title_hint: row.titleHint,
    starts_at: row.startsAt.toISOString(),
    ends_at: row.endsAt?.toISOString() ?? null,
    source_post_id: row.sourcePostId,
    materialization_kind: isAutomationTriggerSeries(row.materializationKind)
      ? "automation_trigger"
      : "post_draft",
    last_error: row.lastError,
    next_occurrence_at: nextOccurrenceAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

async function nextOccurrenceForSeries(
  prisma: PrismaClient,
  seriesId: string
): Promise<Date | null> {
  const row = await prisma.creatorScheduleOccurrence.findFirst({
    where: {
      seriesId,
      status: { in: ["planned", "materialized"] }
    },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true }
  });
  return row?.dueAt ?? null;
}

export async function ensureOccurrencesForSeries(
  prisma: PrismaClient,
  seriesId: string,
  now = new Date()
): Promise<number> {
  const series = await prisma.creatorScheduleSeries.findUnique({ where: { id: seriesId } });
  if (!series || series.status !== "active") return 0;
  const { hour, minute } = parseLocalTime(series.localTime);
  const horizon = twoMonthHorizonEnd(now, series.timezone);
  const keys = enumerateOccurrenceKeysWithTime({
    cadence: series.cadence as ScheduleSeriesCadence,
    interval: series.interval,
    weekdays: series.weekdays,
    monthDays: series.monthDays,
    timezone: series.timezone,
    startsAt: series.startsAt,
    endsAt: series.endsAt,
    horizonEnd: horizon,
    hour,
    minute
  });
  let created = 0;
  for (const row of keys) {
    try {
      await prisma.creatorScheduleOccurrence.create({
        data: {
          seriesId: series.id,
          creatorId: series.creatorId,
          occurrenceKey: row.key,
          dueAt: row.dueAt,
          status: "planned"
        }
      });
      created += 1;
    } catch {
      /* unique conflict — already exists */
    }
  }
  return created;
}

export async function createScheduleSeries(
  prisma: PrismaClient,
  creatorId: string,
  input: CreateScheduleSeriesInput
): Promise<ScheduleSeriesWire> {
  await requireAutopost(prisma, creatorId);
  if (!isScheduleSeriesFeatureEnabled()) {
    throw new ScheduleSeriesValidationError("Schedule series feature is disabled.");
  }
  if (input.cadence !== "weekly" && input.cadence !== "monthly") {
    throw new ScheduleSeriesValidationError("cadence must be weekly or monthly.");
  }
  const { hour, minute } = parseLocalTime(input.local_time);
  const destinations = normalizeDestinations(input.destinations);
  const plannedFormat: PlannedPostFormat = isPlannedPostFormat(input.planned_format)
    ? input.planned_format
    : "mixed";
  const timezone = resolvePostingGoalTimezone(input.timezone);
  const startsAt = input.starts_at ? new Date(input.starts_at) : new Date();
  if (Number.isNaN(startsAt.getTime())) {
    throw new ScheduleSeriesValidationError("starts_at must be a valid date-time.");
  }
  const endsAt = input.ends_at ? new Date(input.ends_at) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    throw new ScheduleSeriesValidationError("ends_at must be a valid date-time.");
  }
  const startLocal = localPartsInZone(startsAt, timezone);
  const weekdays =
    input.cadence === "weekly"
      ? [
          ...new Set(
            (input.weekdays?.length
              ? input.weekdays
              : [weekdayOfYmd(startLocal.year, startLocal.month, startLocal.day)]
            ).filter((d) => d >= 0 && d <= 6)
          )
        ]
      : [];
  if (input.cadence === "weekly" && weekdays.length === 0) {
    weekdays.push(weekdayOfYmd(startLocal.year, startLocal.month, startLocal.day));
  }
  const monthDays =
    input.cadence === "monthly"
      ? [
          ...new Set(
            (input.month_days?.length ? input.month_days : [startLocal.day]).filter(
              (d) => d >= 1 && d <= 31
            )
          )
        ]
      : [];

  const materializationKind = normalizeMaterializationKind(input.materialization_kind);
  if (materializationKind === "automation_trigger" && input.seed) {
    throw new ScheduleSeriesValidationError(
      "seed is not allowed for automation_trigger series."
    );
  }

  const series = await prisma.creatorScheduleSeries.create({
    data: {
      creatorId,
      status: "active",
      cadence: input.cadence,
      interval: Math.max(1, Math.floor(input.interval ?? 1)),
      localTime: `${pad(hour)}:${pad(minute)}`,
      timezone,
      weekdays,
      monthDays,
      plannedFormat,
      destinations,
      remindMe: input.remind_me !== false,
      titleHint: input.title_hint?.trim() || null,
      startsAt,
      endsAt,
      sourcePostId: input.source_post_id?.trim() || null,
      materializationKind
    }
  });

  await ensureOccurrencesForSeries(prisma, series.id, startsAt);

  if (input.seed?.due_at) {
    const seedDue = new Date(input.seed.due_at);
    if (!Number.isNaN(seedDue.getTime())) {
      const seedLocal = localPartsInZone(seedDue, timezone);
      const key = occurrenceKey(seedLocal.year, seedLocal.month, seedLocal.day);
      await prisma.creatorScheduleOccurrence.updateMany({
        where: { seriesId: series.id, occurrenceKey: key, status: "planned" },
        data: {
          status: "materialized",
          postId: input.seed.post_id?.trim() || null,
          draftId: input.seed.draft_id?.trim() || null,
          primaryTaskId: input.seed.primary_task_id?.trim() || null,
          materializedAt: new Date()
        }
      });
    }
  }

  // Trigger-only series keep planned ticks; Automations coordinator (VS4 B10+) owns due work.
  if (!isAutomationTriggerSeries(materializationKind)) {
    await reconcileSeriesMaterialization(prisma, series.id, new Date());
  }
  const next = await nextOccurrenceForSeries(prisma, series.id);
  return mapSeries(series, next);
}

export async function listScheduleSeries(
  prisma: PrismaClient,
  creatorId: string
): Promise<ScheduleSeriesWire[]> {
  await requireAutopost(prisma, creatorId);
  const rows = await prisma.creatorScheduleSeries.findMany({
    where: { creatorId },
    orderBy: { updatedAt: "desc" }
  });
  const out: ScheduleSeriesWire[] = [];
  for (const row of rows) {
    const next = await nextOccurrenceForSeries(prisma, row.id);
    out.push(mapSeries(row, next));
  }
  return out;
}

export async function patchScheduleSeries(
  prisma: PrismaClient,
  creatorId: string,
  seriesId: string,
  input: PatchScheduleSeriesInput
): Promise<ScheduleSeriesWire> {
  await requireAutopost(prisma, creatorId);
  const existing = await prisma.creatorScheduleSeries.findFirst({
    where: { id: seriesId, creatorId }
  });
  if (!existing) throw new ScheduleSeriesNotFoundError("Schedule series not found.");

  if (input.delete_future) {
    await prisma.creatorScheduleOccurrence.deleteMany({
      where: {
        seriesId,
        status: "planned",
        dueAt: { gt: new Date() }
      }
    });
  }

  const data: Record<string, unknown> = {};
  if (input.status) data.status = input.status;
  if (input.cadence) data.cadence = input.cadence;
  if (input.interval != null) data.interval = Math.max(1, Math.floor(input.interval));
  if (input.local_time) {
    const { hour, minute } = parseLocalTime(input.local_time);
    data.localTime = `${pad(hour)}:${pad(minute)}`;
  }
  if (input.timezone) data.timezone = resolvePostingGoalTimezone(input.timezone);
  if (input.weekdays) data.weekdays = input.weekdays.filter((d) => d >= 0 && d <= 6);
  if (input.month_days) data.monthDays = input.month_days.filter((d) => d >= 1 && d <= 31);
  if (input.planned_format && isPlannedPostFormat(input.planned_format)) {
    data.plannedFormat = input.planned_format;
  }
  if (input.destinations) data.destinations = normalizeDestinations(input.destinations);
  if (input.remind_me != null) data.remindMe = input.remind_me;
  if (input.title_hint !== undefined) data.titleHint = input.title_hint?.trim() || null;
  if (input.ends_at !== undefined) {
    data.endsAt = input.ends_at ? new Date(input.ends_at) : null;
  }

  const updated = await prisma.creatorScheduleSeries.update({
    where: { id: seriesId },
    data
  });

  if (updated.status === "active") {
    await ensureOccurrencesForSeries(prisma, seriesId);
    if (!isAutomationTriggerSeries(updated.materializationKind)) {
      await reconcileSeriesMaterialization(prisma, seriesId, new Date());
    }
  }

  const next = await nextOccurrenceForSeries(prisma, seriesId);
  return mapSeries(updated, next);
}

export async function deleteScheduleSeries(
  prisma: PrismaClient,
  creatorId: string,
  seriesId: string,
  options?: { delete_future_only?: boolean }
): Promise<{ deleted: boolean; ended: boolean }> {
  await requireAutopost(prisma, creatorId);
  const existing = await prisma.creatorScheduleSeries.findFirst({
    where: { id: seriesId, creatorId }
  });
  if (!existing) throw new ScheduleSeriesNotFoundError("Schedule series not found.");

  if (options?.delete_future_only) {
    await prisma.creatorScheduleOccurrence.deleteMany({
      where: { seriesId, status: "planned", dueAt: { gt: new Date() } }
    });
    await prisma.creatorScheduleSeries.update({
      where: { id: seriesId },
      data: { status: "ended", endsAt: new Date() }
    });
    return { deleted: false, ended: true };
  }

  await prisma.creatorScheduleSeries.delete({ where: { id: seriesId } });
  return { deleted: true, ended: false };
}

export async function materializeOccurrence(
  prisma: PrismaClient,
  occurrenceId: string
): Promise<ScheduleOccurrenceWire> {
  const occ = await prisma.creatorScheduleOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { series: true }
  });
  if (!occ) throw new ScheduleSeriesNotFoundError("Occurrence not found.");
  if (occ.status === "materialized" || occ.status === "completed") {
    return {
      occurrence_id: occ.id,
      series_id: occ.seriesId,
      occurrence_key: occ.occurrenceKey,
      due_at: occ.dueAt.toISOString(),
      status: occ.status,
      post_id: occ.postId,
      draft_id: occ.draftId,
      primary_task_id: occ.primaryTaskId,
      planned_format: occ.series.plannedFormat,
      destinations: occ.series.destinations,
      title: occ.series.titleHint || "Routine post",
      series_cadence: occ.series.cadence
    };
  }
  if (occ.series.status !== "active") {
    throw new ScheduleSeriesValidationError("Series is not active.");
  }

  // Trigger-only ticks stay planned until Automations reconcile claims them (B10+).
  if (isAutomationTriggerSeries(occ.series.materializationKind)) {
    throw new ScheduleSeriesValidationError(
      "automation_trigger occurrences are not materialized into blank posts."
    );
  }

  try {
    const event = await createScheduledPostForRail(prisma, occ.creatorId, {
      title: occ.series.titleHint || "Routine post",
      scheduled_for: occ.dueAt.toISOString(),
      destinations: occ.series.destinations,
      notify: occ.series.remindMe,
      planned_format: occ.series.plannedFormat
    });
    const primaryTaskId = event.task_id ?? event.destinations?.[0]?.task_id ?? event.id;
    const updated = await prisma.creatorScheduleOccurrence.update({
      where: { id: occ.id },
      data: {
        status: "materialized",
        postId: event.post_id ?? null,
        draftId: event.draft_id ?? null,
        primaryTaskId,
        materializedAt: new Date(),
        failureReason: null
      }
    });
    await prisma.creatorScheduleSeries.update({
      where: { id: occ.seriesId },
      data: { lastError: null }
    });
    return {
      occurrence_id: updated.id,
      series_id: updated.seriesId,
      occurrence_key: updated.occurrenceKey,
      due_at: updated.dueAt.toISOString(),
      status: updated.status,
      post_id: updated.postId,
      draft_id: updated.draftId,
      primary_task_id: updated.primaryTaskId,
      planned_format: occ.series.plannedFormat,
      destinations: occ.series.destinations,
      title: occ.series.titleHint || "Routine post",
      series_cadence: occ.series.cadence
    };
  } catch (err) {
    const message =
      err instanceof ScheduleRailValidationError || err instanceof Error
        ? err.message
        : "Materialization failed.";
    await prisma.creatorScheduleOccurrence.update({
      where: { id: occ.id },
      data: { status: "failed", failureReason: message }
    });
    await prisma.creatorScheduleSeries.update({
      where: { id: occ.seriesId },
      data: { lastError: message }
    });
    throw err;
  }
}

/**
 * Mark completed occurrences (all destination tasks done), then materialize the next
 * planned occurrence when prior is complete OR within the 7-day lead window.
 */
export async function reconcileSeriesMaterialization(
  prisma: PrismaClient,
  seriesId: string,
  now = new Date()
): Promise<{ completed: number; materialized: number }> {
  const series = await prisma.creatorScheduleSeries.findUnique({ where: { id: seriesId } });
  if (!series || series.status !== "active") return { completed: 0, materialized: 0 };

  // automation_trigger: occurrence generation only — never JIT blank posts/drafts/tasks.
  if (isAutomationTriggerSeries(series.materializationKind)) {
    return { completed: 0, materialized: 0 };
  }

  let completed = 0;
  const materializedRows = await prisma.creatorScheduleOccurrence.findMany({
    where: { seriesId, status: "materialized", primaryTaskId: { not: null } }
  });
  for (const occ of materializedRows) {
    if (!occ.postId) continue;
    const tasks = await prisma.postbotTask.findMany({
      where: { creatorId: occ.creatorId, postId: occ.postId, action: "post" },
      select: { status: true }
    });
    if (tasks.length > 0 && tasks.every((t) => t.status === "done")) {
      await prisma.creatorScheduleOccurrence.update({
        where: { id: occ.id },
        data: { status: "completed", completedAt: now }
      });
      completed += 1;
    }
  }

  let materialized = 0;
  const open = await prisma.creatorScheduleOccurrence.findMany({
    where: { seriesId, status: { in: ["planned", "materialized"] } },
    orderBy: { dueAt: "asc" }
  });
  const hasMaterialized = open.some((o) => o.status === "materialized");
  const nextPlanned = open.find((o) => o.status === "planned");
  if (!nextPlanned) return { completed, materialized };

  const leadMs = MATERIALIZE_LEAD_DAYS * 24 * 60 * 60 * 1000;
  const withinLead = nextPlanned.dueAt.getTime() - now.getTime() <= leadMs;
  // Only one Autopost draft at a time: materialize next planned when prior completed
  // or when the next slot enters the seven-day lead window (never pre-create the horizon).
  const shouldMaterialize = !hasMaterialized && (completed > 0 || withinLead);

  if (shouldMaterialize) {
    await materializeOccurrence(prisma, nextPlanned.id);
    materialized = 1;
  }

  return { completed, materialized };
}

export async function reconcileAllActiveSeries(
  prisma: PrismaClient,
  options?: { now?: Date; limit?: number; creatorId?: string }
): Promise<{ series: number; ensured: number; materialized: number; completed: number }> {
  if (!isScheduleSeriesFeatureEnabled()) {
    return { series: 0, ensured: 0, materialized: 0, completed: 0 };
  }
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 100;
  const rows = await prisma.creatorScheduleSeries.findMany({
    where: {
      status: "active",
      ...(options?.creatorId ? { creatorId: options.creatorId } : {})
    },
    orderBy: { updatedAt: "asc" },
    take: limit
  });
  let ensured = 0;
  let materialized = 0;
  let completed = 0;
  for (const row of rows) {
    try {
      ensured += await ensureOccurrencesForSeries(prisma, row.id, now);
      const r = await reconcileSeriesMaterialization(prisma, row.id, now);
      materialized += r.materialized;
      completed += r.completed;
    } catch (err) {
      const message = err instanceof Error ? err.message : "reconcile failed";
      await prisma.creatorScheduleSeries.update({
        where: { id: row.id },
        data: { lastError: message }
      });
    }
  }
  return { series: rows.length, ensured, materialized, completed };
}

export async function listPlannedOccurrencesForRail(
  prisma: PrismaClient,
  creatorId: string,
  monthStart: Date,
  monthEnd: Date
): Promise<ScheduleOccurrenceWire[]> {
  const rows = await prisma.creatorScheduleOccurrence.findMany({
    where: {
      creatorId,
      status: "planned",
      dueAt: { gte: monthStart, lt: monthEnd }
    },
    include: { series: true },
    orderBy: { dueAt: "asc" }
  });
  return rows.map((occ) => ({
    occurrence_id: occ.id,
    series_id: occ.seriesId,
    occurrence_key: occ.occurrenceKey,
    due_at: occ.dueAt.toISOString(),
    status: occ.status,
    post_id: occ.postId,
    draft_id: occ.draftId,
    primary_task_id: occ.primaryTaskId,
    planned_format: occ.series.plannedFormat,
    destinations: occ.series.destinations,
    title: occ.series.titleHint || "Routine post",
    series_cadence: occ.series.cadence
  }));
}
