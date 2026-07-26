import type { PrismaClient } from "@prisma/client";
import {
  MediaIngestOrigin,
  MediaProcessingStatus,
  PostPublishState,
  PostSource,
  PostUpstreamStatus
} from "@prisma/client";

export const DEFAULT_POSTING_GOAL_TIMEZONE = "UTC";
export const DEFAULT_MONTHLY_POST_TARGET = 1;
/** @deprecated Epoch sentinel retired by VS7-T01; counts use publishState=published. */
export const DRAFT_PUBLISHED_AT = new Date(0);

export type PostingGoalPaceStatus = "on_track" | "behind" | "complete" | "bonus_available";
export type PostingGoalNudgeType = "posting_goal" | "bonus_post";
export type PostingGoalNudgeStatus = "active" | "snoozed" | "skipped" | "resolved";

export type CreatorPostingGoalWire = {
  creator_id: string;
  monthly_post_target: number;
  bonus_nudges_enabled: boolean;
  timezone: string;
  enabled: boolean;
  remind_me_global: boolean;
  /** True when no durable row exists yet (defaults only). */
  is_default: boolean;
  updated_at: string | null;
};

export type CreatorPostingGoalPutInput = {
  monthly_post_target?: number;
  bonus_nudges_enabled?: boolean;
  timezone?: string | null;
  enabled?: boolean;
  remind_me_global?: boolean;
};

export type CreatorPostingGoalStatusWire = {
  goal: {
    monthly_post_target: number;
    bonus_nudges_enabled: boolean;
    timezone: string;
    enabled: boolean;
  };
  period: {
    key: string;
    start: string;
    end: string;
  };
  posts_this_month: number;
  remaining: number;
  staged_media_count: number;
  pace_status: PostingGoalPaceStatus;
  active_nudge: null | {
    nudge_id: string;
    nudge_type: PostingGoalNudgeType;
    status: PostingGoalNudgeStatus;
    snoozed_until: string | null;
  };
};

export type CreatorPostingNudgeWire = {
  nudge_id: string;
  creator_id: string;
  period_key: string;
  nudge_type: PostingGoalNudgeType;
  status: PostingGoalNudgeStatus;
  snoozed_until: string | null;
  updated_at: string;
};

export class PostingGoalValidationError extends Error {
  public override readonly name = "PostingGoalValidationError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

export class PostingGoalNotFoundError extends Error {
  public override readonly name = "PostingGoalNotFoundError";
  public constructor(message = "Posting goal nudge not found.") {
    super(message);
  }
}

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const STAGING_INGEST_ORIGINS: MediaIngestOrigin[] = [
  MediaIngestOrigin.DISCORD,
  MediaIngestOrigin.RELAY_UPLOAD
];

const NUDGE_TYPES: PostingGoalNudgeType[] = ["posting_goal", "bonus_post"];
const NUDGE_STATUSES: PostingGoalNudgeStatus[] = ["active", "snoozed", "skipped", "resolved"];

export function resolvePostingGoalTimezone(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_POSTING_GOAL_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_POSTING_GOAL_TIMEZONE;
  }
}

function localDateTimeParts(date: Date, timeZone: string): LocalDateParts {
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

function compareYmd(
  a: Pick<LocalDateParts, "year" | "month" | "day">,
  b: Pick<LocalDateParts, "year" | "month" | "day">
): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** UTC instant for local Y-M-D 00:00:00 in `timeZone`. */
export function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  if (timeZone === "UTC") {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  }

  const target = { year, month, day };
  let probe = Date.UTC(year, month - 1, day, 0, 0, 0) - 14 * 3600 * 1000;
  for (let i = 0; i < 96; i += 1) {
    const parts = localDateTimeParts(new Date(probe), timeZone);
    if (compareYmd(parts, target) === 0 && parts.hour === 0) {
      return new Date(probe - parts.minute * 60_000 - parts.second * 1000);
    }
    probe += 3600 * 1000;
  }

  throw new Error(`Unable to resolve local midnight for ${year}-${month}-${day} in ${timeZone}`);
}

export function creatorLocalPeriodKey(at: Date, timeZone: string): string {
  const { year, month } = localDateTimeParts(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function creatorLocalMonthWindow(
  at: Date,
  timeZone: string
): { key: string; start: Date; end: Date } {
  const { year, month } = localDateTimeParts(at, timeZone);
  const key = creatorLocalPeriodKey(at, timeZone);
  const start = zonedMidnightUtc(year, month, 1, timeZone);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = zonedMidnightUtc(nextYear, nextMonth, 1, timeZone);
  return { key, start, end };
}

function localDaysInMonth(year: number, month: number, timeZone: string): number {
  const start = zonedMidnightUtc(year, month, 1, timeZone);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = zonedMidnightUtc(nextYear, nextMonth, 1, timeZone);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function validateMonthlyPostTarget(raw: unknown): number {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new PostingGoalValidationError("monthly_post_target must be an integer from 1 to 31.", [
      { field: "monthly_post_target", issue: "out_of_range" }
    ]);
  }
  return value;
}

function isNudgeType(value: string): value is PostingGoalNudgeType {
  return NUDGE_TYPES.includes(value as PostingGoalNudgeType);
}

function isNudgeStatus(value: string): value is PostingGoalNudgeStatus {
  return NUDGE_STATUSES.includes(value as PostingGoalNudgeStatus);
}

function mapGoalRow(row: {
  creatorId: string;
  monthlyPostTarget: number;
  bonusNudgesEnabled: boolean;
  timezone: string;
  enabled: boolean;
  remindMeGlobal: boolean;
  updatedAt: Date;
}): CreatorPostingGoalWire {
  return {
    creator_id: row.creatorId,
    monthly_post_target: row.monthlyPostTarget,
    bonus_nudges_enabled: row.bonusNudgesEnabled,
    timezone: row.timezone,
    enabled: row.enabled,
    remind_me_global: row.remindMeGlobal,
    is_default: false,
    updated_at: row.updatedAt.toISOString()
  };
}

function defaultGoalWire(creatorId: string): CreatorPostingGoalWire {
  return {
    creator_id: creatorId,
    monthly_post_target: DEFAULT_MONTHLY_POST_TARGET,
    bonus_nudges_enabled: false,
    timezone: DEFAULT_POSTING_GOAL_TIMEZONE,
    enabled: true,
    remind_me_global: true,
    is_default: true,
    updated_at: null
  };
}

function mapNudgeRow(row: {
  id: string;
  creatorId: string;
  periodKey: string;
  nudgeType: string;
  status: string;
  snoozedUntil: Date | null;
  updatedAt: Date;
}): CreatorPostingNudgeWire {
  return {
    nudge_id: row.id,
    creator_id: row.creatorId,
    period_key: row.periodKey,
    nudge_type: isNudgeType(row.nudgeType) ? row.nudgeType : "posting_goal",
    status: isNudgeStatus(row.status) ? row.status : "active",
    snoozed_until: row.snoozedUntil?.toISOString() ?? null,
    updated_at: row.updatedAt.toISOString()
  };
}

async function resolveGoalConfig(
  prisma: PrismaClient,
  creatorId: string
): Promise<CreatorPostingGoalWire> {
  const row = await prisma.creatorPostingGoal.findUnique({ where: { creatorId } });
  return row ? mapGoalRow(row) : defaultGoalWire(creatorId);
}

export async function countRelayNativePostsInWindow(
  prisma: PrismaClient,
  creatorId: string,
  window: { start: Date; end: Date }
): Promise<number> {
  return prisma.post.count({
    where: {
      creatorId,
      source: PostSource.RELAY,
      upstreamStatus: PostUpstreamStatus.active,
      publishState: PostPublishState.published,
      versions: {
        some: {
          publishedAt: {
            not: null,
            gte: window.start,
            lt: window.end
          }
        }
      }
    }
  });
}

export async function countRelayLibraryStagingMedia(
  prisma: PrismaClient,
  creatorId: string
): Promise<number> {
  return prisma.mediaAsset.count({
    where: {
      creatorId,
      ingestOrigin: { in: STAGING_INGEST_ORIGINS },
      primaryPostId: null,
      autopostDraftId: null,
      processingStatus: MediaProcessingStatus.READY
    }
  });
}

export function computePaceStatus(args: {
  postsThisMonth: number;
  monthlyPostTarget: number;
  bonusNudgesEnabled: boolean;
  stagedMediaCount: number;
  now: Date;
  timeZone: string;
}): PostingGoalPaceStatus {
  const { postsThisMonth, monthlyPostTarget, bonusNudgesEnabled, stagedMediaCount, now, timeZone } =
    args;
  if (postsThisMonth >= monthlyPostTarget) {
    if (bonusNudgesEnabled && stagedMediaCount > 0) return "bonus_available";
    return "complete";
  }

  const local = localDateTimeParts(now, timeZone);
  const daysInMonth = localDaysInMonth(local.year, local.month, timeZone);
  const expectedByNow = Math.max(1, Math.ceil((monthlyPostTarget * local.day) / daysInMonth));
  return postsThisMonth >= expectedByNow ? "on_track" : "behind";
}

function effectiveNudgeStatus(
  row: { status: string; snoozedUntil: Date | null },
  now: Date
): PostingGoalNudgeStatus {
  const status = isNudgeStatus(row.status) ? row.status : "active";
  if (status === "snoozed" && row.snoozedUntil && row.snoozedUntil.getTime() <= now.getTime()) {
    return "active";
  }
  return status;
}

export function hasBlockingCreatorPostingNudge(
  nudges: Array<{ nudgeType: string; status: string; snoozedUntil: Date | null }>,
  nudgeType: PostingGoalNudgeType,
  now: Date
): boolean {
  const row = nudges.find((n) => n.nudgeType === nudgeType);
  if (!row) return false;
  const status = effectiveNudgeStatus(row, now);
  return status === "active" || status === "snoozed" || status === "skipped";
}

export async function findCurrentPeriodNudges(
  prisma: PrismaClient,
  creatorId: string,
  periodKey: string
) {
  return prisma.creatorPostingNudge.findMany({
    where: { creatorId, periodKey },
    orderBy: { updatedAt: "desc" }
  });
}

export async function createActivePostingNudgeIfAbsent(
  prisma: PrismaClient,
  creatorId: string,
  periodKey: string,
  nudgeType: PostingGoalNudgeType,
  nudges: Awaited<ReturnType<typeof findCurrentPeriodNudges>>,
  now: Date
): Promise<boolean> {
  if (hasBlockingCreatorPostingNudge(nudges, nudgeType, now)) return false;
  try {
    await prisma.creatorPostingNudge.create({
      data: {
        creatorId: creatorId.trim(),
        periodKey,
        nudgeType,
        status: "active"
      }
    });
    return true;
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return false;
    }
    throw err;
  }
}

function mapActiveNudge(
  row: {
    id: string;
    nudgeType: string;
    status: string;
    snoozedUntil: Date | null;
  } | null,
  now: Date
): CreatorPostingGoalStatusWire["active_nudge"] {
  if (!row) return null;
  const status = effectiveNudgeStatus(row, now);
  return {
    nudge_id: row.id,
    nudge_type: isNudgeType(row.nudgeType) ? row.nudgeType : "posting_goal",
    status,
    snoozed_until: row.snoozedUntil?.toISOString() ?? null
  };
}

function pickActiveNudgeForStatus(
  nudges: Awaited<ReturnType<typeof findCurrentPeriodNudges>>,
  paceStatus: PostingGoalPaceStatus,
  now: Date
): CreatorPostingGoalStatusWire["active_nudge"] {
  const preferredType: PostingGoalNudgeType =
    paceStatus === "bonus_available" ? "bonus_post" : "posting_goal";
  const ordered = [
    ...nudges.filter((n) => n.nudgeType === preferredType),
    ...nudges.filter((n) => n.nudgeType !== preferredType)
  ];
  for (const row of ordered) {
    const status = effectiveNudgeStatus(row, now);
    if (status === "resolved") continue;
    return mapActiveNudge(row, now);
  }
  return null;
}

export async function getCreatorPostingGoal(
  prisma: PrismaClient,
  creatorId: string
): Promise<CreatorPostingGoalWire> {
  return resolveGoalConfig(prisma, creatorId.trim());
}

export async function putCreatorPostingGoal(
  prisma: PrismaClient,
  creatorId: string,
  input: CreatorPostingGoalPutInput
): Promise<CreatorPostingGoalWire> {
  const id = creatorId.trim();
  if (!id) {
    throw new PostingGoalValidationError("creator_id required.", [
      { field: "creator_id", issue: "required" }
    ]);
  }

  const existing = await prisma.creatorPostingGoal.findUnique({ where: { creatorId: id } });
  const monthlyPostTarget =
    input.monthly_post_target !== undefined
      ? validateMonthlyPostTarget(input.monthly_post_target)
      : (existing?.monthlyPostTarget ?? DEFAULT_MONTHLY_POST_TARGET);
  const bonusNudgesEnabled =
    input.bonus_nudges_enabled !== undefined
      ? Boolean(input.bonus_nudges_enabled)
      : (existing?.bonusNudgesEnabled ?? false);
  const timezone =
    input.timezone !== undefined
      ? resolvePostingGoalTimezone(input.timezone)
      : (existing?.timezone ?? DEFAULT_POSTING_GOAL_TIMEZONE);
  const enabled =
    input.enabled !== undefined ? Boolean(input.enabled) : (existing?.enabled ?? true);
  const remindMeGlobal =
    input.remind_me_global !== undefined
      ? Boolean(input.remind_me_global)
      : (existing?.remindMeGlobal ?? true);

  const row = await prisma.creatorPostingGoal.upsert({
    where: { creatorId: id },
    create: {
      creatorId: id,
      monthlyPostTarget,
      bonusNudgesEnabled,
      timezone,
      enabled,
      remindMeGlobal
    },
    update: {
      monthlyPostTarget,
      bonusNudgesEnabled,
      timezone,
      enabled,
      remindMeGlobal
    }
  });

  return mapGoalRow(row);
}

/**
 * Close open nudges when the monthly Relay goal is met.
 * - `posting_goal`: resolved once posts >= target (active/snoozed only; skip stays skip).
 * - `bonus_post`: resolved when pace is `complete` (goal met, bonus not applicable).
 * Idempotent.
 */
export async function reconcilePostingGoalNudgeResolution(
  prisma: PrismaClient,
  creatorId: string,
  args: {
    periodKey: string;
    postsThisMonth: number;
    monthlyPostTarget: number;
    paceStatus: PostingGoalPaceStatus;
  }
): Promise<number> {
  const id = creatorId.trim();
  if (!id || args.postsThisMonth < args.monthlyPostTarget) return 0;

  let resolved = 0;
  const postingGoal = await prisma.creatorPostingNudge.updateMany({
    where: {
      creatorId: id,
      periodKey: args.periodKey,
      nudgeType: "posting_goal",
      status: { in: ["active", "snoozed"] }
    },
    data: { status: "resolved", snoozedUntil: null }
  });
  resolved += postingGoal.count;

  if (args.paceStatus === "complete") {
    const bonus = await prisma.creatorPostingNudge.updateMany({
      where: {
        creatorId: id,
        periodKey: args.periodKey,
        nudgeType: "bonus_post",
        status: { in: ["active", "snoozed"] }
      },
      data: { status: "resolved", snoozedUntil: null }
    });
    resolved += bonus.count;
  }

  return resolved;
}

/** After a Relay-native publish, resolve met-goal nudges for the creator's current period. */
export async function reconcilePostingGoalNudgesAfterPublish(
  prisma: PrismaClient,
  creatorId: string,
  now = new Date()
): Promise<number> {
  const id = creatorId.trim();
  if (!id) return 0;
  const goal = await resolveGoalConfig(prisma, id);
  if (!goal.enabled) return 0;
  const timeZone = resolvePostingGoalTimezone(goal.timezone);
  const period = creatorLocalMonthWindow(now, timeZone);
  const [postsThisMonth, stagedMediaCount] = await Promise.all([
    countRelayNativePostsInWindow(prisma, id, period),
    countRelayLibraryStagingMedia(prisma, id)
  ]);
  const paceStatus = computePaceStatus({
    postsThisMonth,
    monthlyPostTarget: goal.monthly_post_target,
    bonusNudgesEnabled: goal.bonus_nudges_enabled,
    stagedMediaCount,
    now,
    timeZone
  });
  return reconcilePostingGoalNudgeResolution(prisma, id, {
    periodKey: period.key,
    postsThisMonth,
    monthlyPostTarget: goal.monthly_post_target,
    paceStatus
  });
}

export async function getCreatorPostingGoalStatus(
  prisma: PrismaClient,
  creatorId: string,
  now = new Date()
): Promise<CreatorPostingGoalStatusWire> {
  const id = creatorId.trim();
  const goal = await resolveGoalConfig(prisma, id);
  const timeZone = resolvePostingGoalTimezone(goal.timezone);
  const period = creatorLocalMonthWindow(now, timeZone);
  const [postsThisMonth, stagedMediaCount, initialNudges] = await Promise.all([
    countRelayNativePostsInWindow(prisma, id, period),
    countRelayLibraryStagingMedia(prisma, id),
    findCurrentPeriodNudges(prisma, id, period.key)
  ]);

  const paceStatus = computePaceStatus({
    postsThisMonth,
    monthlyPostTarget: goal.monthly_post_target,
    bonusNudgesEnabled: goal.bonus_nudges_enabled,
    stagedMediaCount,
    now,
    timeZone
  });

  const resolvedCount = await reconcilePostingGoalNudgeResolution(prisma, id, {
    periodKey: period.key,
    postsThisMonth,
    monthlyPostTarget: goal.monthly_post_target,
    paceStatus
  });
  const nudges =
    resolvedCount > 0
      ? await findCurrentPeriodNudges(prisma, id, period.key)
      : initialNudges;

  return {
    goal: {
      monthly_post_target: goal.monthly_post_target,
      bonus_nudges_enabled: goal.bonus_nudges_enabled,
      timezone: timeZone,
      enabled: goal.enabled
    },
    period: {
      key: period.key,
      start: period.start.toISOString(),
      end: period.end.toISOString()
    },
    posts_this_month: postsThisMonth,
    remaining: Math.max(0, goal.monthly_post_target - postsThisMonth),
    staged_media_count: stagedMediaCount,
    pace_status: paceStatus,
    active_nudge: pickActiveNudgeForStatus(nudges, paceStatus, now)
  };
}

function parseSnoozeUntil(raw: unknown, now: Date): Date {
  if (raw === null || raw === undefined || raw === "") {
    return new Date(now.getTime() + 7 * 86_400_000);
  }
  if (typeof raw !== "string") {
    throw new PostingGoalValidationError("snoozed_until must be an ISO timestamp string.", [
      { field: "snoozed_until", issue: "invalid_type" }
    ]);
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new PostingGoalValidationError("snoozed_until must be a valid ISO timestamp.", [
      { field: "snoozed_until", issue: "invalid_timestamp" }
    ]);
  }
  if (parsed.getTime() <= now.getTime()) {
    throw new PostingGoalValidationError("snoozed_until must be in the future.", [
      { field: "snoozed_until", issue: "must_be_future" }
    ]);
  }
  return parsed;
}

async function loadOwnedNudge(
  prisma: PrismaClient,
  creatorId: string,
  nudgeId: string
) {
  const row = await prisma.creatorPostingNudge.findFirst({
    where: { id: nudgeId, creatorId }
  });
  if (!row) {
    throw new PostingGoalNotFoundError();
  }
  return row;
}

export async function snoozeCreatorPostingNudge(
  prisma: PrismaClient,
  creatorId: string,
  nudgeId: string,
  snoozedUntilInput: unknown,
  now = new Date()
): Promise<CreatorPostingNudgeWire> {
  const existing = await loadOwnedNudge(prisma, creatorId.trim(), nudgeId.trim());
  const snoozedUntil = parseSnoozeUntil(snoozedUntilInput, now);
  const updated = await prisma.creatorPostingNudge.update({
    where: { id: existing.id },
    data: {
      status: "snoozed",
      snoozedUntil
    }
  });
  return mapNudgeRow(updated);
}

export async function skipCreatorPostingNudge(
  prisma: PrismaClient,
  creatorId: string,
  nudgeId: string
): Promise<CreatorPostingNudgeWire> {
  const existing = await loadOwnedNudge(prisma, creatorId.trim(), nudgeId.trim());
  if (existing.status === "skipped") {
    return mapNudgeRow(existing);
  }
  const updated = await prisma.creatorPostingNudge.update({
    where: { id: existing.id },
    data: {
      status: "skipped",
      snoozedUntil: null
    }
  });
  return mapNudgeRow(updated);
}

async function ensureCurrentPeriodNudge(
  prisma: PrismaClient,
  creatorId: string,
  periodKey: string,
  nudgeType: PostingGoalNudgeType
) {
  return prisma.creatorPostingNudge.upsert({
    where: {
      creatorId_periodKey_nudgeType: {
        creatorId: creatorId.trim(),
        periodKey,
        nudgeType
      }
    },
    create: {
      creatorId: creatorId.trim(),
      periodKey,
      nudgeType,
      status: "active"
    },
    update: {}
  });
}

async function resolveDismissNudgeId(
  prisma: PrismaClient,
  creatorId: string,
  now: Date
): Promise<string> {
  const status = await getCreatorPostingGoalStatus(prisma, creatorId, now);
  if (status.active_nudge?.nudge_id) {
    return status.active_nudge.nudge_id;
  }
  const nudgeType: PostingGoalNudgeType =
    status.pace_status === "bonus_available" ? "bonus_post" : "posting_goal";
  const row = await ensureCurrentPeriodNudge(
    prisma,
    creatorId,
    status.period.key,
    nudgeType
  );
  return row.id;
}

export async function snoozeCurrentCreatorPostingNudge(
  prisma: PrismaClient,
  creatorId: string,
  snoozedUntilInput: unknown,
  now = new Date()
): Promise<CreatorPostingNudgeWire> {
  const nudgeId = await resolveDismissNudgeId(prisma, creatorId, now);
  return snoozeCreatorPostingNudge(prisma, creatorId, nudgeId, snoozedUntilInput, now);
}

export async function skipCurrentCreatorPostingNudge(
  prisma: PrismaClient,
  creatorId: string,
  now = new Date()
): Promise<CreatorPostingNudgeWire> {
  const nudgeId = await resolveDismissNudgeId(prisma, creatorId, now);
  return skipCreatorPostingNudge(prisma, creatorId, nudgeId);
}
