/**
 * Studio Schedule rail — creator-scoped month aggregation (Phase 4)
 * + scheduled-post create / event media attach (Phase 8).
 * @see docs/studio/PLAN_PHASE_4_SCHEDULE_RAIL_DATA.md
 * @see docs/studio/PLAN_PHASE_8_EVENT_MEDIA_ATTACH.md
 */

import { randomUUID } from "node:crypto";
import type { PostbotTaskAction, PostbotTaskStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  AutopostDraftValidationError,
  isPlannedPostFormat,
  saveAutopostDraft,
  type PlannedPostFormat
} from "../autopost/autopost-draft-service.js";
import {
  creatorLocalMonthWindow,
  getCreatorPostingGoal,
  getCreatorPostingGoalStatus,
  resolvePostingGoalTimezone,
  zonedMidnightUtc
} from "../autopost/posting-goal-service.js";
import { getCreatorStudioBrief } from "../creator/studio-brief-service.js";
import {
  createRelayPostTransaction,
  isMediaEligibleForRelayNativePost,
  RelayCreatePostError
} from "../relay/create-relay-post.js";
import {
  publishExistingRelayPost
} from "../relay/publish-existing-relay-post.js";
import {
  buildMediaReadinessErrors,
  buildPublishConfirmationPath,
  deriveMediaStateFromIds,
  syncGoalCycleMediaProjections
} from "../goal-cycle/execution/goal-cycle-execution-service.js";
import { effectivePerEventNotify } from "./schedule-reminder-extension-api.js";
import {
  getPostDistributionPlan,
  getPostDistributionSummary,
  type DistributionPlanWire,
  type DistributionVariantWire
} from "./post-distribution-service.js";
import {
  isDistributionDestination,
  type DistributionDestination
} from "./platform-destinations.js";

const STUDIO_GOAL_LABELS: Record<string, string> = {
  engagement_optimization: "Engagement",
  new_audience_testing: "New Audience",
  format_optimization: "Format",
  language_outreach: "Language",
  trend_riding: "Trending"
};

/** Onboarding Library Review growth goals (same ids as web `CREATOR_GROWTH_GOALS`). */
const GROWTH_GOAL_COPY: Record<string, { label: string; detail: string }> = {
  discovery: {
    label: "Audience discovery",
    detail: "Get new eyes on your best work in Relay and beyond."
  },
  conversion: {
    label: "Convert fans to patrons",
    detail: "Turn interest into paid support with promo-ready pieces."
  },
  consistency: {
    label: "Posting consistency",
    detail: "Build a reliable release rhythm your patrons can count on."
  }
};

function parseGrowthGoalFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).growth_goal;
  if (typeof raw !== "string" || !(raw in GROWTH_GOAL_COPY)) return null;
  return raw;
}

const PRODUCT_DESTINATIONS = ["patreon", "x", "deviantart", "bluesky"] as const;

export type ScheduleRailDestination = "patreon" | "x" | "deviantart" | "bluesky" | null;

export type ScheduleRailAction = "post" | "schedule" | "pin_comment" | "repost" | "custom";

export type ScheduleRailEventStatus = "pending" | "done" | "overdue";

export type ScheduleRailEventSource = "postbot_task" | "manual_event" | "recurrence_occurrence";

export type ScheduleRailExactEventType =
  | "make_post"
  | "schedule_post"
  | "engage_comments"
  | "pin_comment"
  | "repost"
  | "custom";

/** Per-destination child under a visually grouped rail event. */
export type ScheduleRailDestinationChild = {
  destination: ScheduleRailDestination;
  task_id: string;
  variant_id: string;
  status: ScheduleRailEventStatus;
  publish_confirm_path?: string | null;
};

export type ScheduleRailReadyItem = {
  id: string;
  task_id?: string;
  variant_id?: string;
  post_id?: string;
  /** Discriminator — defaults to postbot_task for legacy callers. */
  source?: ScheduleRailEventSource;
  /** Exact manual/Coach event type when known. */
  event_type?: ScheduleRailExactEventType | null;
  action: ScheduleRailAction;
  title: string;
  rationale: string | null;
  destination: ScheduleRailDestination;
  link: string | null;
  notify: boolean;
  plan_label: string | null;
  plan_index?: number;
  plan_total?: number;
  status: ScheduleRailEventStatus;
  /** Phase 8 — pending post with empty/unattached media. */
  needs_media: boolean;
  media_count: number;
  /** VS8 — live media ids on latest post version (no private URLs). */
  media_ids?: string[];
  /** VS8 — missing | partial | ready | not_required */
  media_state?: string;
  /** VS8 — machine-readable readiness errors (e.g. attach_media). */
  readiness_errors?: string[];
  /** VS8 Goal Cycle overlay — optional. */
  task_kind?: "publish" | "social_upkeep" | "active_rest" | null;
  instructions?: string | null;
  publish_confirm_path?: string | null;
  /**
   * Linked Autopost draft (plan.sourceDraftId) when this event was queued
   * from the schedule rail / Create Event bridge.
   */
  draft_id?: string | null;
  /** Recurring routine series id when source is recurrence_occurrence. */
  series_id?: string | null;
  /** Cadence label for planned routine placeholders (weekly / monthly). */
  series_cadence?: string | null;
  /**
   * Visual grouping: one calendar slice, separate operational children.
   * Always present after projection (length 1 for lone tasks).
   */
  destinations?: ScheduleRailDestinationChild[];
  /** Follow-up playbook run when this row was materialized from a template. */
  playbook_run_id?: string | null;
  playbook_action_key?: string | null;
  /** Schedule Rail Automations enrichment (additive; ordinary rows omit). */
  automation_id?: string | null;
  automation_title?: string | null;
  preset_kind?: string | null;
  automation_state?: "planned" | "awaiting_review" | string | null;
  automation_run_id?: string | null;
  expires_at?: string | null;
  /**
   * Artist-authored post details on the linked draft.
   * `none` when media may be attached but Title / Description / Tags were never saved.
   */
  post_details_state?: "none" | "authored" | null;
  /** Canonical authored description (plain text) when available. */
  post_description?: string | null;
  /** Relay organization tags (not hashtags). */
  post_tags?: string[];
};

export class ScheduleRailValidationError extends Error {
  public override readonly name = "ScheduleRailValidationError";
  public readonly statusCode = 400;
  public constructor(message: string) {
    super(message);
  }
}

export class ScheduleRailNotFoundError extends Error {
  public override readonly name = "ScheduleRailNotFoundError";
  public readonly statusCode = 404;
  public constructor(message: string) {
    super(message);
  }
}

export type ScheduleRailEventItem = ScheduleRailReadyItem & {
  at: string;
};

export type ScheduleRailCue = {
  post_id: string;
  plan_id: string | null;
  task_id: string;
  present_destinations: string[];
  missing_destinations: string[];
};

export type ScheduleRailMonthlyGoal = {
  /** Short excerpt of the creator's stated studio brief / monthly target. Null → empty UI. */
  excerpt: string | null;
};

export type ScheduleRailResponse = {
  month: string;
  timezone: string;
  today_day: number;
  days_in_month: number;
  remind_me_global: boolean;
  /** Stated monthly goal excerpt (growth goal → studio brief → posting target). */
  monthly_goal: ScheduleRailMonthlyGoal;
  cadence: { posted: number; target: number };
  postbot: { done: number; total: number };
  armed: boolean;
  cue: ScheduleRailCue | null;
  ready: ScheduleRailReadyItem[];
  events: ScheduleRailEventItem[];
};

function buildMonthlyGoalExcerpt(args: {
  growthGoalId: string | null;
  userNotes: string | null;
  goals: string[];
  monthlyPostTarget: number;
  isDefaultPostingGoal: boolean;
  postingGoalEnabled: boolean;
}): string | null {
  if (args.growthGoalId) {
    const copy = GROWTH_GOAL_COPY[args.growthGoalId];
    if (copy) {
      const line = `${copy.label} — ${copy.detail}`;
      return line.length > 160 ? `${line.slice(0, 157).trimEnd()}…` : line;
    }
  }

  const notes = args.userNotes?.trim();
  if (notes) return notes.length > 160 ? `${notes.slice(0, 157).trimEnd()}…` : notes;

  if (args.goals.length > 0) {
    const labels = args.goals.map((g) => STUDIO_GOAL_LABELS[g] ?? g.replace(/_/g, " "));
    return labels.join(" · ");
  }

  if (args.postingGoalEnabled && !args.isDefaultPostingGoal && args.monthlyPostTarget > 0) {
    return `${args.monthlyPostTarget} Relay posts this month`;
  }

  return null;
}

function localParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

function daysInMonth(year: number, month: number, timeZone: string): number {
  const start = zonedMidnightUtc(year, month, 1, timeZone);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = zonedMidnightUtc(nextYear, nextMonth, 1, timeZone);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function resolveMonthWindow(
  monthParam: string | undefined,
  timeZone: string,
  now: Date
): { key: string; start: Date; end: Date; year: number; monthNum: number } {
  const trimmed = monthParam?.trim() ?? "";
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [year, monthNum] = trimmed.split("-").map(Number) as [number, number];
    const start = zonedMidnightUtc(year, monthNum, 1, timeZone);
    const nextYear = monthNum === 12 ? year + 1 : year;
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const end = zonedMidnightUtc(nextYear, nextMonth, 1, timeZone);
    return { key: trimmed, start, end, year, monthNum };
  }
  const window = creatorLocalMonthWindow(now, timeZone);
  const parts = localParts(now, timeZone);
  return {
    key: window.key,
    start: window.start,
    end: window.end,
    year: parts.year,
    monthNum: parts.month
  };
}

function mapAction(action: PostbotTaskAction): ScheduleRailAction {
  if (
    action === "post" ||
    action === "schedule" ||
    action === "pin_comment" ||
    action === "repost"
  ) {
    return action;
  }
  return "custom";
}

function mapActionFromExactType(eventType: ScheduleRailExactEventType): ScheduleRailAction {
  switch (eventType) {
    case "make_post":
      return "post";
    case "schedule_post":
      return "schedule";
    case "engage_comments":
    case "pin_comment":
      return "pin_comment";
    case "repost":
      return "repost";
    case "custom":
      return "custom";
    default:
      return "custom";
  }
}

function mapDestination(raw: string | null | undefined): ScheduleRailDestination {
  if (raw === "patreon" || raw === "x" || raw === "deviantart" || raw === "bluesky") {
    return raw;
  }
  return null;
}

function actionTitle(action: ScheduleRailAction, destination: ScheduleRailDestination): string {
  const dest = destination ? ` · ${destination}` : "";
  if (action === "post") return `Post${dest}`;
  if (action === "schedule") return `Schedule${dest}`;
  if (action === "pin_comment") return `Pin comment${dest}`;
  if (action === "repost") return `Repost${dest}`;
  return `Task${dest}`;
}

function planLabelFromId(planId: string | null): string | null {
  if (!planId) return null;
  return "Strategy plan";
}

/** Truncate ISO timestamp to minute for grouping (same post + same minute). */
export function scheduleRailAtMinuteKey(at: string | undefined | null): string {
  if (!at?.trim()) return "undated";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at.trim().slice(0, 16);
  return d.toISOString().slice(0, 16);
}

function scheduleRailGroupKey(
  item: Pick<ScheduleRailReadyItem, "post_id" | "action" | "source"> & { at?: string }
): string | null {
  // Manual events stay individual unless deliberately linked later.
  if (item.source === "manual_event") return null;
  const postId = item.post_id?.trim();
  if (!postId) return null;
  return `${postId}|${scheduleRailAtMinuteKey(item.at ?? null)}|${item.action}`;
}

function deriveGroupedRailStatus(
  statuses: ScheduleRailEventStatus[]
): ScheduleRailEventStatus {
  if (statuses.length === 0) return "pending";
  if (statuses.every((s) => s === "done")) return "done";
  if (statuses.some((s) => s === "overdue")) return "overdue";
  return "pending";
}

function pickPrimaryRailChild<T extends ScheduleRailReadyItem>(children: T[]): T {
  const pending = children.find((c) => c.status !== "done");
  return pending ?? children[0]!;
}

/**
 * Collapse same-post / same-minute / same-action tasks into one visual event.
 * Operational children stay in `destinations[]`. Lone items keep their task id.
 */
export function groupScheduleRailItems<T extends ScheduleRailReadyItem>(
  items: T[]
): T[] {
  const clusters = new Map<string, T[]>();
  const singles: T[] = [];

  for (const item of items) {
    const key = scheduleRailGroupKey(item);
    if (!key) {
      singles.push({
        ...item,
        destinations: [
          {
            destination: item.destination,
            task_id: item.task_id ?? item.id,
            variant_id: item.variant_id ?? item.id,
            status: item.status,
            publish_confirm_path: item.publish_confirm_path ?? null
          }
        ]
      });
      continue;
    }
    const list = clusters.get(key) ?? [];
    list.push(item);
    clusters.set(key, list);
  }

  const grouped: T[] = [];
  for (const [key, children] of clusters) {
    if (children.length === 1) {
      const only = children[0]!;
      grouped.push({
        ...only,
        destinations: [
          {
            destination: only.destination,
            task_id: only.task_id ?? only.id,
            variant_id: only.variant_id ?? only.id,
            status: only.status,
            publish_confirm_path: only.publish_confirm_path ?? null
          }
        ]
      });
      continue;
    }

    children.sort((a, b) => {
      const da = a.destination ?? "";
      const db = b.destination ?? "";
      return da.localeCompare(db);
    });
    const primary = pickPrimaryRailChild(children);
    const destChildren: ScheduleRailDestinationChild[] = children.map((c) => ({
      destination: c.destination,
      task_id: c.task_id ?? c.id,
      variant_id: c.variant_id ?? c.id,
      status: c.status,
      publish_confirm_path: c.publish_confirm_path ?? null
    }));
    const [postId, atMinute, action] = key.split("|") as [string, string, string];
    const groupId =
      children.length > 1 ? `grp_${postId}_${atMinute}_${action}` : primary.id;

    grouped.push({
      ...primary,
      id: groupId,
      task_id: primary.task_id,
      variant_id: primary.variant_id,
      destination: primary.destination,
      status: deriveGroupedRailStatus(children.map((c) => c.status)),
      notify: children.some((c) => c.notify),
      needs_media: children.some((c) => c.needs_media),
      plan_index: undefined,
      plan_total: undefined,
      destinations: destChildren
    });
  }

  return [...singles, ...grouped];
}

/** Exported for unit tests. */
export function resolveTaskDueAt(args: {
  suggestedTime: Date | null;
  scheduledFor: Date | null;
}): Date | null {
  return args.scheduledFor ?? args.suggestedTime ?? null;
}

/** Exported for unit tests. */
export function classifyRailStatus(
  status: PostbotTaskStatus,
  dueAt: Date | null,
  now: Date
): ScheduleRailEventStatus | "dismissed" {
  if (status === "dismissed") return "dismissed";
  if (status === "done") return "done";
  if (dueAt && dueAt.getTime() < now.getTime()) return "overdue";
  return "pending";
}

/** Exported for unit tests — pending post + empty media version. */
export function isPostMediaEmpty(mediaIds: string[] | null | undefined): boolean {
  if (!mediaIds || mediaIds.length === 0) return true;
  return mediaIds.every((id) => !id.trim());
}

/** Exported for unit tests. */
export function countMediaIds(mediaIds: string[] | null | undefined): number {
  if (!mediaIds || mediaIds.length === 0) return 0;
  return mediaIds.filter((id) => id.trim().length > 0).length;
}

/** Exported for unit tests — Phase 8 drop-bin gate. */
export function computeNeedsMedia(args: {
  action: PostbotTaskAction | ScheduleRailAction;
  taskStatus: PostbotTaskStatus;
  mediaIds: string[] | null | undefined;
  /** Text posts from Create Event dialogue never require media. */
  plannedFormat?: PlannedPostFormat | string | null;
}): boolean {
  if (args.action !== "post") return false;
  if (args.taskStatus !== "pending") return false;
  if (args.plannedFormat === "text") return false;
  return isPostMediaEmpty(args.mediaIds);
}

function mergeMediaIds(existing: string[], incoming: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...existing, ...incoming]) {
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function presentMissingFromSummary(
  destinations: Array<{
    destination: string;
    attempt_status: string | null;
    external_url: string | null;
  }>
): { present: string[]; missing: string[] } {
  const present = new Set<string>();
  for (const row of destinations) {
    const url = row.external_url?.trim();
    if (row.attempt_status === "posted" || url) {
      if ((PRODUCT_DESTINATIONS as readonly string[]).includes(row.destination)) {
        present.add(row.destination);
      }
    }
  }
  const presentList = PRODUCT_DESTINATIONS.filter((d) => present.has(d));
  const missing = PRODUCT_DESTINATIONS.filter((d) => !present.has(d));
  return { present: [...presentList], missing: [...missing] };
}

export async function getCreatorScheduleRail(
  prisma: PrismaClient,
  creatorId: string,
  options?: { month?: string; now?: Date }
): Promise<ScheduleRailResponse> {
  const id = creatorId.trim();
  const now = options?.now ?? new Date();
  const goalStatus = await getCreatorPostingGoalStatus(prisma, id, now);
  const goal = await getCreatorPostingGoal(prisma, id);
  const [studioBrief, onboardingRow] = await Promise.all([
    getCreatorStudioBrief(prisma, id),
    prisma.creatorOnboardingState.findUnique({
      where: { creatorId: id },
      select: { metadata: true }
    })
  ]);
  const growthGoalId = parseGrowthGoalFromMetadata(onboardingRow?.metadata ?? null);
  const timeZone = resolvePostingGoalTimezone(goalStatus.goal.timezone);
  const window = resolveMonthWindow(options?.month, timeZone, now);
  const todayParts = localParts(now, timeZone);
  const todayDay =
    todayParts.year === window.year && todayParts.month === window.monthNum
      ? todayParts.day
      : 0;
  const days = daysInMonth(window.year, window.monthNum, timeZone);

  const tasks = await prisma.postbotTask.findMany({
    where: {
      creatorId: id,
      status: { in: ["pending", "done"] }
    },
    include: {
      variant: {
        select: {
          id: true,
          title: true,
          scheduledFor: true,
          remindMe: true,
          destination: true
        }
      }
    },
    orderBy: [{ createdAt: "asc" }]
  });

  type Row = (typeof tasks)[number] & { dueAt: Date | null; railStatus: ScheduleRailEventStatus };
  const classified: Row[] = [];
  for (const task of tasks) {
    const dueAt = resolveTaskDueAt({
      suggestedTime: task.suggestedTime,
      scheduledFor: task.variant.scheduledFor
    });
    const railStatus = classifyRailStatus(task.status, dueAt, now);
    if (railStatus === "dismissed") continue;
    classified.push({ ...task, dueAt, railStatus });
  }

  // Plan index/total among non-dismissed siblings
  const byPlan = new Map<string, Row[]>();
  for (const row of classified) {
    if (!row.planId) continue;
    const list = byPlan.get(row.planId) ?? [];
    list.push(row);
    byPlan.set(row.planId, list);
  }
  for (const list of byPlan.values()) {
    list.sort((a, b) => {
      const aT = a.dueAt?.getTime() ?? a.createdAt.getTime();
      const bT = b.dueAt?.getTime() ?? b.createdAt.getTime();
      return aT - bT;
    });
  }
  const planMeta = new Map<string, { index: number; total: number }>();
  for (const [planId, list] of byPlan) {
    list.forEach((row, i) => {
      planMeta.set(`${planId}:${row.id}`, { index: i + 1, total: list.length });
    });
  }

  const postIds = [...new Set(classified.map((row) => row.postId))];
  const mediaByPostId = new Map<string, string[]>();
  const versionMetaByPostId = new Map<
    string,
    { title: string; description: string | null; tagIds: string[] }
  >();
  if (postIds.length > 0) {
    const versions = await prisma.postVersion.findMany({
      where: { postId: { in: postIds }, post: { creatorId: id } },
      orderBy: [{ postId: "asc" }, { versionSeq: "desc" }],
      select: { postId: true, mediaIds: true, title: true, description: true, tagIds: true }
    });
    for (const v of versions) {
      if (!mediaByPostId.has(v.postId)) {
        mediaByPostId.set(v.postId, v.mediaIds);
        versionMetaByPostId.set(v.postId, {
          title: v.title,
          description: v.description,
          tagIds: v.tagIds ?? []
        });
      }
    }
  }

  const planIds = [...new Set(classified.map((row) => row.planId).filter(Boolean))] as string[];
  const draftByPlanId = new Map<string, string>();
  const plannedFormatByPlanId = new Map<string, PlannedPostFormat>();
  const postDetailsStateByPlanId = new Map<string, "authored">();
  const draftTagsByPlanId = new Map<string, string[]>();
  if (planIds.length > 0) {
    const plans = await prisma.postDistributionPlan.findMany({
      where: { id: { in: planIds }, creatorId: id },
      select: { id: true, sourceDraftId: true, assistantPlan: true }
    });
    const draftIds = [
      ...new Set(
        plans
          .map((p) => p.sourceDraftId?.trim())
          .filter((x): x is string => Boolean(x))
      )
    ];
    const formatByDraftId = new Map<string, PlannedPostFormat>();
    const detailsStateByDraftId = new Map<string, "authored">();
    const tagsByDraftId = new Map<string, string[]>();
    if (draftIds.length > 0) {
      const drafts = await prisma.autopostDraft.findMany({
        where: { id: { in: draftIds }, creatorId: id },
        select: { id: true, workspace: true }
      });
      for (const draft of drafts) {
        const ws =
          draft.workspace && typeof draft.workspace === "object" && !Array.isArray(draft.workspace)
            ? (draft.workspace as Record<string, unknown>)
            : {};
        if (isPlannedPostFormat(ws.planned_format)) {
          formatByDraftId.set(draft.id, ws.planned_format);
        }
        const detailsState = ws.post_details_state;
        // Legacy `adapted` maps to authored — platform prep now happens at review time.
        if (detailsState === "authored" || detailsState === "adapted") {
          detailsStateByDraftId.set(draft.id, "authored");
        }
        if (Array.isArray(ws.tags)) {
          tagsByDraftId.set(
            draft.id,
            ws.tags.map((t) => String(t).trim()).filter(Boolean)
          );
        }
      }
    }
    for (const plan of plans) {
      const draftId = plan.sourceDraftId?.trim();
      if (draftId) draftByPlanId.set(plan.id, draftId);
      const fromDraft = draftId ? formatByDraftId.get(draftId) : undefined;
      if (fromDraft) {
        plannedFormatByPlanId.set(plan.id, fromDraft);
      } else {
        const planJson =
          plan.assistantPlan && typeof plan.assistantPlan === "object" && !Array.isArray(plan.assistantPlan)
            ? (plan.assistantPlan as Record<string, unknown>)
            : {};
        if (isPlannedPostFormat(planJson.planned_format)) {
          plannedFormatByPlanId.set(plan.id, planJson.planned_format);
        }
      }
      if (draftId) {
        const detailsState = detailsStateByDraftId.get(draftId);
        if (detailsState) postDetailsStateByPlanId.set(plan.id, detailsState);
        const tags = tagsByDraftId.get(draftId);
        if (tags) draftTagsByPlanId.set(plan.id, tags);
      }
    }
  }

  const ready: ScheduleRailReadyItem[] = [];
  const events: ScheduleRailEventItem[] = [];

  for (const row of classified) {
    const action = mapAction(row.action);
    const destination = mapDestination(row.destination);
    const meta = row.planId ? planMeta.get(`${row.planId}:${row.id}`) : undefined;
    const mediaIds = mediaByPostId.get(row.postId) ?? [];
    const versionMeta = versionMetaByPostId.get(row.postId);
    const plannedFormat = row.planId ? (plannedFormatByPlanId.get(row.planId) ?? null) : null;
    const detailsState = row.planId
      ? (postDetailsStateByPlanId.get(row.planId) ?? null)
      : null;
    const needsMedia = computeNeedsMedia({
      action: row.action,
      taskStatus: row.status,
      mediaIds,
      plannedFormat
    });
    const mediaState =
      row.action === "post"
        ? plannedFormat === "text"
          ? ("not_required" as const)
          : deriveMediaStateFromIds(mediaIds)
        : ("not_required" as const);
    const readinessErrors = needsMedia ? buildMediaReadinessErrors(mediaState) : [];
    const postTags =
      (row.planId ? draftTagsByPlanId.get(row.planId) : undefined) ??
      versionMeta?.tagIds ??
      [];
    const authoredTitle =
      (detailsState ? versionMeta?.title?.trim() : null) ||
      row.variant.title?.trim() ||
      actionTitle(action, destination);
    const base: ScheduleRailReadyItem = {
      id: row.id,
      task_id: row.id,
      variant_id: row.variantId,
      post_id: row.postId,
      source: "postbot_task",
      event_type: null,
      action,
      title: authoredTitle,
      rationale: row.rationale,
      destination,
      link: row.link,
      notify: effectivePerEventNotify({
        taskRemindMe: row.remindMe,
        variantRemindMe: row.variant.remindMe
      }),
      plan_label: planLabelFromId(row.planId),
      plan_index: meta?.index,
      plan_total: meta?.total,
      status: row.railStatus,
      needs_media: needsMedia,
      media_count: countMediaIds(mediaIds),
      media_ids: mediaIds.filter((m) => m.trim()),
      media_state: mediaState,
      readiness_errors: readinessErrors,
      draft_id: row.planId ? (draftByPlanId.get(row.planId) ?? null) : null,
      task_kind: row.action === "post" ? "publish" : row.action === "schedule" ? "active_rest" : "social_upkeep",
      instructions: null,
      publish_confirm_path:
        row.action === "post" && !needsMedia && row.railStatus !== "done"
          ? buildPublishConfirmationPath({ variantId: row.variantId, eventId: row.id })
          : null,
      post_details_state: detailsState ?? "none",
      post_description: versionMeta?.description ?? null,
      post_tags: postTags
    };

    const inWindow =
      row.dueAt !== null &&
      row.dueAt.getTime() >= window.start.getTime() &&
      row.dueAt.getTime() < window.end.getTime();

    if (row.dueAt && inWindow) {
      events.push({ ...base, at: row.dueAt.toISOString() });
    } else if (!row.dueAt && row.railStatus !== "done") {
      ready.push(base);
    } else if (
      !row.dueAt &&
      row.railStatus === "done" &&
      row.updatedAt.getTime() >= window.start.getTime() &&
      row.updatedAt.getTime() < window.end.getTime()
    ) {
      // Keep undated done tasks out of ready strip
    }
  }

  const manualRows = await prisma.creatorScheduleEvent.findMany({
    where: {
      creatorId: id,
      status: { in: ["pending", "done"] },
      dueAt: { gte: window.start, lt: window.end }
    },
    orderBy: { dueAt: "asc" }
  });

  for (const m of manualRows) {
    const eventType = m.eventType as ScheduleRailExactEventType;
    const action = mapActionFromExactType(eventType);
    const destination = mapDestination(m.destination);
    const railStatus =
      m.status === "done"
        ? ("done" as const)
        : m.dueAt.getTime() < now.getTime()
          ? ("overdue" as const)
          : ("pending" as const);
    events.push({
      id: m.id,
      source: "manual_event",
      event_type: eventType,
      action,
      title: m.title,
      rationale: m.note,
      destination,
      link: m.externalUrl,
      notify: m.remindMe,
      plan_label: null,
      post_id: m.postId ?? undefined,
      status: railStatus,
      needs_media: false,
      media_count: 0,
      media_ids: [],
      media_state: "not_required",
      readiness_errors: [],
      task_kind:
        eventType === "make_post"
          ? "publish"
          : eventType === "schedule_post"
            ? "active_rest"
            : "social_upkeep",
      instructions: m.note,
      publish_confirm_path: null,
      at: m.dueAt.toISOString(),
      destinations: [
        {
          destination,
          task_id: m.id,
          variant_id: m.id,
          status: railStatus,
          publish_confirm_path: null
        }
      ]
    });
  }

  try {
      const {
        isScheduleSeriesFeatureEnabled,
        listPlannedOccurrencesForRail
      } = await import("../autopost/schedule-series-service.js");
      if (isScheduleSeriesFeatureEnabled()) {
        const planned = await listPlannedOccurrencesForRail(
          prisma,
          id,
          window.start,
          window.end
        );
        let seriesAutomationMeta = new Map<
          string,
          import("../autopost/automation-attention-service.js").AutomationRailMeta
        >();
        try {
          const { loadAutomationRailMetaForSeriesIds } = await import(
            "../autopost/automation-attention-service.js"
          );
          seriesAutomationMeta = await loadAutomationRailMetaForSeriesIds(
            prisma,
            id,
            planned.map((o) => o.series_id)
          );
        } catch {
          /* automations tables may be absent mid-migrate */
        }
        for (const occ of planned) {
          const primaryDest = mapDestination(occ.destinations[0] ?? null);
          const dueMs = new Date(occ.due_at).getTime();
          const railStatus =
            dueMs < now.getTime() ? ("overdue" as const) : ("pending" as const);
          const autoMeta = seriesAutomationMeta.get(occ.series_id);
          events.push({
            id: occ.occurrence_id,
            source: "recurrence_occurrence",
            event_type: "make_post",
            action: "post",
            title: autoMeta
              ? autoMeta.automation_title
              : occ.title,
            rationale: autoMeta
              ? `Automation · ${autoMeta.preset_kind}`
              : `Routine · ${occ.series_cadence}`,
            destination: primaryDest,
            link: null,
            notify: false,
            plan_label: autoMeta ? autoMeta.automation_title : null,
            status: railStatus,
            needs_media: false,
            media_count: 0,
            media_ids: [],
            media_state: "not_required",
            readiness_errors: [],
            task_kind: "publish",
            instructions: autoMeta ? "Trigger upcoming" : "Prepare now",
            publish_confirm_path: null,
            draft_id: null,
            series_id: occ.series_id,
            series_cadence: occ.series_cadence,
            automation_id: autoMeta?.automation_id ?? null,
            automation_title: autoMeta?.automation_title ?? null,
            preset_kind: autoMeta?.preset_kind ?? null,
            automation_state: autoMeta?.automation_state ?? null,
            automation_run_id: autoMeta?.automation_run_id ?? null,
            expires_at: autoMeta?.expires_at ?? null,
            at: occ.due_at,
            destinations: occ.destinations.map((d, i) => ({
              destination: mapDestination(d),
              task_id: `${occ.occurrence_id}:${i}`,
              variant_id: `${occ.occurrence_id}:${i}`,
              status: railStatus,
              publish_confirm_path: null
            }))
          });
        }
      }
    } catch {
      /* feature table may be absent mid-migrate — skip projection */
    }

  // Enrich playbook-materialized rows with label / action_key / plan indices.
  try {
    const { loadPlaybookRailMetaByMaterializedIds } = await import(
      "../autopost/social-playbook-service.js"
    );
    const eventIds = events
      .filter((e) => e.source === "manual_event")
      .map((e) => e.id);
    const taskIds = events
      .filter((e) => e.source === "postbot_task" || !e.source)
      .map((e) => e.task_id || e.id);
    const metaMap = await loadPlaybookRailMetaByMaterializedIds(prisma, id, {
      eventIds,
      taskIds
    });
    for (const ev of events) {
      const meta = metaMap.get(ev.task_id || ev.id) ?? metaMap.get(ev.id);
      if (!meta) continue;
      ev.plan_label = meta.plan_label;
      ev.plan_index = meta.plan_index;
      ev.plan_total = meta.plan_total;
      ev.playbook_run_id = meta.playbook_run_id;
      ev.playbook_action_key = meta.playbook_action_key;
    }
    for (const item of ready) {
      const meta = metaMap.get(item.task_id || item.id) ?? metaMap.get(item.id);
      if (!meta) continue;
      item.plan_label = meta.plan_label;
      item.plan_index = meta.plan_index;
      item.plan_total = meta.plan_total;
      item.playbook_run_id = meta.playbook_run_id;
      item.playbook_action_key = meta.playbook_action_key;
    }
  } catch {
    /* playbook tables may be absent mid-migrate */
  }

  // Enrich automation-prepared manual_event rows (playbook-style batch meta).
  try {
    const { loadAutomationRailMetaForEventIds } = await import(
      "../autopost/automation-attention-service.js"
    );
    const manualIds = events
      .filter((e) => e.source === "manual_event")
      .map((e) => e.id);
    const autoEventMeta = await loadAutomationRailMetaForEventIds(prisma, id, manualIds);
    for (const ev of events) {
      if (ev.source !== "manual_event") continue;
      const meta = autoEventMeta.get(ev.id);
      if (!meta) continue;
      ev.automation_id = meta.automation_id;
      ev.automation_title = meta.automation_title;
      ev.preset_kind = meta.preset_kind;
      ev.automation_state = meta.automation_state;
      ev.automation_run_id = meta.automation_run_id ?? null;
      ev.draft_id = meta.draft_id ?? ev.draft_id ?? null;
      ev.expires_at = meta.expires_at ?? null;
      if (!ev.plan_label) ev.plan_label = meta.automation_title;
    }
    for (const item of ready) {
      if (item.source !== "manual_event") continue;
      const meta = autoEventMeta.get(item.id);
      if (!meta) continue;
      item.automation_id = meta.automation_id;
      item.automation_title = meta.automation_title;
      item.preset_kind = meta.preset_kind;
      item.automation_state = meta.automation_state;
      item.automation_run_id = meta.automation_run_id ?? null;
      item.draft_id = meta.draft_id ?? item.draft_id ?? null;
      item.expires_at = meta.expires_at ?? null;
      if (!item.plan_label) item.plan_label = meta.automation_title;
    }
  } catch {
    /* automations tables may be absent mid-migrate */
  }

  // PostBot tracker: pending+done in window (dated) or undated pending/done created in window
  let postbotDone = 0;
  let postbotTotal = 0;
  for (const row of classified) {
    const inWindowDated =
      row.dueAt !== null &&
      row.dueAt.getTime() >= window.start.getTime() &&
      row.dueAt.getTime() < window.end.getTime();
    const inWindowUndated =
      row.dueAt === null &&
      row.createdAt.getTime() >= window.start.getTime() &&
      row.createdAt.getTime() < window.end.getTime();
    if (!inWindowDated && !inWindowUndated) continue;
    postbotTotal += 1;
    if (row.railStatus === "done") postbotDone += 1;
  }
  for (const m of manualRows) {
    postbotTotal += 1;
    if (m.status === "done") postbotDone += 1;
  }

  // Armed cue: earliest needs_media post (rail-level Drop Assets)
  const needsMediaRows = classified
    .filter((row) =>
      computeNeedsMedia({
        action: row.action,
        taskStatus: row.status,
        mediaIds: mediaByPostId.get(row.postId),
        plannedFormat: row.planId ? (plannedFormatByPlanId.get(row.planId) ?? null) : null
      })
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let armed = needsMediaRows.length > 0;
  let cue: ScheduleRailCue | null = null;
  const cueRow = needsMediaRows[0];
  if (cueRow) {
    let present: string[] = [];
    let missing: string[] = [...PRODUCT_DESTINATIONS];
    try {
      const summary = await getPostDistributionSummary(prisma, id, cueRow.postId);
      const pm = presentMissingFromSummary(summary.destinations);
      present = pm.present;
      missing = pm.missing;
    } catch {
      /* keep all-missing */
    }
    cue = {
      post_id: cueRow.postId,
      plan_id: cueRow.planId,
      task_id: cueRow.id,
      present_destinations: present,
      missing_destinations: missing
    };
  }

  const monthlyGoalExcerpt = buildMonthlyGoalExcerpt({
    growthGoalId,
    userNotes: studioBrief.user_notes,
    goals: studioBrief.goals,
    monthlyPostTarget: goal.monthly_post_target,
    isDefaultPostingGoal: goal.is_default,
    postingGoalEnabled: goal.enabled
  });

  return {
    month: window.key,
    timezone: timeZone,
    today_day: todayDay,
    days_in_month: days,
    remind_me_global: goal.remind_me_global,
    monthly_goal: { excerpt: monthlyGoalExcerpt },
    cadence: {
      posted: goalStatus.posts_this_month,
      target: goalStatus.goal.monthly_post_target
    },
    postbot: { done: postbotDone, total: postbotTotal },
    armed,
    cue,
    ready: groupScheduleRailItems(ready),
    events: groupScheduleRailItems(
      events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    )
  };
}

export type CreateScheduledPostInput = {
  title?: string;
  scheduled_for: string;
  /** Legacy single destination; used when `destinations` omitted. Defaults to patreon. */
  destination?: string;
  /** Preferred: one or more destinations (creates N variants/tasks). */
  destinations?: string[];
  notify?: boolean;
  note?: string;
  /** From Create Event dialogue — text posts skip media gate. */
  planned_format?: PlannedPostFormat | string;
};

function resolveCreateDestinations(input: CreateScheduledPostInput): NonNullable<ScheduleRailDestination>[] {
  const rawList =
    Array.isArray(input.destinations) && input.destinations.length > 0
      ? input.destinations
      : [input.destination ?? "patreon"];
  const seen = new Set<string>();
  const out: NonNullable<ScheduleRailDestination>[] = [];
  for (const raw of rawList) {
    const mapped = mapDestination(String(raw ?? "").trim().toLowerCase());
    if (!mapped) {
      throw new ScheduleRailValidationError(
        "destination must be patreon, x, deviantart, or bluesky."
      );
    }
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
  }
  if (out.length === 0) {
    throw new ScheduleRailValidationError("At least one destination is required.");
  }
  return out;
}

/**
 * Phase 8 — manual `+` Add scheduled post: empty-media Relay draft
 * + plan + N variants/tasks. Autopost draft still carries selected_destinations
 * for reminders / extension handoff; the rail event popover stays calendar-native.
 */
export async function createScheduledPostForRail(
  prisma: PrismaClient,
  creatorId: string,
  input: CreateScheduledPostInput
): Promise<ScheduleRailEventItem> {
  const id = creatorId.trim();
  const scheduledFor = new Date(input.scheduled_for);
  if (Number.isNaN(scheduledFor.getTime())) {
    throw new ScheduleRailValidationError("scheduled_for must be a valid date-time.");
  }
  const destinations = resolveCreateDestinations(input);
  const plannedFormat: PlannedPostFormat = isPlannedPostFormat(input.planned_format)
    ? input.planned_format
    : "mixed";
  const isText = plannedFormat === "text";
  const title = (input.title?.trim() || "Scheduled post").slice(0, 200);
  const note = input.note?.trim() || null;
  const notify = input.notify !== false;
  const rationale =
    note || "Scheduled from the Studio calendar.";

  const postId = `relay_p_${randomUUID()}`;
  let createdPostId: string;
  try {
    const out = await createRelayPostTransaction(prisma, postId, {
      creatorId: id,
      campaignId: null,
      title,
      description: note,
      isPublic: true,
      requiredTierId: null,
      tierIds: [],
      tagIds: [],
      mediaIds: [],
      publish: false,
      publishedAtInput: null
    });
    createdPostId = out.post.id;
  } catch (err) {
    if (err instanceof RelayCreatePostError) {
      throw new ScheduleRailValidationError(err.message);
    }
    throw err;
  }

  let draftId: string;
  try {
    const draft = await saveAutopostDraft(prisma, id, {
      media_ids: [],
      title,
      body_text: note,
      generate: false,
      status: "nudged",
      composer_step: isText ? "draft-post" : "pick-media",
      intent: "Scheduled from Studio calendar",
      workspace: {
        selected_destinations: [...destinations],
        planned_format: plannedFormat
      }
    });
    draftId = draft.draft_id;
  } catch (err) {
    if (err instanceof AutopostDraftValidationError) {
      throw new ScheduleRailValidationError(err.message);
    }
    throw err;
  }

  type CreatedTask = {
    id: string;
    variantId: string;
    postId: string;
    destination: string;
    rationale: string | null;
    link: string | null;
  };

  const tasks = await prisma.$transaction(async (tx) => {
    const plan = await tx.postDistributionPlan.create({
      data: {
        creatorId: id,
        postId: createdPostId,
        sourceDraftId: draftId,
        status: "active",
        assistantMode: "none",
        assistantContext: {},
        assistantPlan: {
          source: "schedule_rail_manual",
          planned_format: plannedFormat
        }
      }
    });
    const created: CreatedTask[] = [];
    for (const destination of destinations) {
      const variant = await tx.postDistributionVariant.create({
        data: {
          planId: plan.id,
          postId: createdPostId,
          creatorId: id,
          destination,
          status: "draft",
          assistantEnabled: false,
          title,
          bodyText: note,
          postText: note,
          scheduledFor,
          remindMe: notify,
          advice: {}
        }
      });
      const task = await tx.postbotTask.create({
        data: {
          creatorId: id,
          postId: createdPostId,
          planId: plan.id,
          variantId: variant.id,
          destination,
          action: "post",
          rationale,
          suggestedTime: scheduledFor,
          remindMe: notify,
          status: "pending"
        }
      });
      created.push({
        id: task.id,
        variantId: task.variantId,
        postId: task.postId,
        destination,
        rationale: task.rationale,
        link: task.link
      });
    }
    return created;
  });

  const needsMedia = computeNeedsMedia({
    action: "post",
    taskStatus: "pending",
    mediaIds: [],
    plannedFormat
  });

  const at = scheduledFor.toISOString();
  const items: ScheduleRailEventItem[] = tasks.map((task) => ({
    id: task.id,
    task_id: task.id,
    variant_id: task.variantId,
    post_id: task.postId,
    action: "post" as const,
    title,
    rationale: task.rationale,
    destination: mapDestination(task.destination),
    at,
    link: task.link,
    notify,
    plan_label: null,
    status: "pending" as const,
    needs_media: needsMedia,
    media_count: 0,
    draft_id: draftId
  }));

  const grouped = groupScheduleRailItems(items);
  return grouped[0]!;
}

export type AttachScheduleRailMediaMode = "append" | "replace" | "remove";

export type AttachScheduleRailMediaResult = {
  task_id: string;
  post_id: string;
  needs_media: boolean;
  media_count: number;
  media_ids: string[];
  media_state: string;
  readiness_errors: string[];
  mode: AttachScheduleRailMediaMode;
};

type ResolvedAttachTarget = {
  /** Id returned to the client (postbot task id, or schedule event id for manual posts). */
  result_task_id: string;
  post_id: string;
  plan_id: string | null;
  goal_cycle_campaign_key: string | null;
};

/**
 * Resolve a rail event id to an attachable post target.
 * Accepts postbot task ids, planned routine occurrence ids (JIT materialize),
 * and manual make_post events that link a Library post.
 */
async function resolveScheduleRailAttachTarget(
  prisma: PrismaClient,
  creatorId: string,
  railEventId: string
): Promise<ResolvedAttachTarget> {
  const id = creatorId.trim();
  const tid = railEventId.trim();

  let task = await prisma.postbotTask.findFirst({
    where: { id: tid, creatorId: id }
  });

  if (!task) {
    const occ = await prisma.creatorScheduleOccurrence.findFirst({
      where: { id: tid, creatorId: id },
      select: { id: true }
    });
    if (occ) {
      const series = await import("../autopost/schedule-series-service.js");
      let wire: { primary_task_id?: string | null };
      try {
        wire = await series.materializeOccurrence(prisma, occ.id);
      } catch (err) {
        if (err instanceof series.ScheduleSeriesValidationError) {
          throw new ScheduleRailValidationError(err.message);
        }
        if (err instanceof series.ScheduleSeriesNotFoundError) {
          throw new ScheduleRailNotFoundError(err.message);
        }
        throw err;
      }
      const primaryTaskId = wire.primary_task_id?.trim();
      if (!primaryTaskId) {
        throw new ScheduleRailNotFoundError(
          `Could not prepare schedule slot for media: ${tid}`
        );
      }
      task = await prisma.postbotTask.findFirst({
        where: { id: primaryTaskId, creatorId: id }
      });
      if (!task) {
        throw new ScheduleRailNotFoundError(
          `Postbot task not found after preparing schedule slot: ${primaryTaskId}`
        );
      }
    }
  }

  if (task) {
    if (task.action !== "post") {
      throw new ScheduleRailValidationError("Only post events accept media attach.");
    }
    if (task.status !== "pending") {
      throw new ScheduleRailValidationError("Only pending post events accept media attach.");
    }
    return {
      result_task_id: task.id,
      post_id: task.postId,
      plan_id: task.planId ?? null,
      goal_cycle_campaign_key: task.goalCycleCampaignKey ?? null
    };
  }

  const manual = await prisma.creatorScheduleEvent.findFirst({
    where: { id: tid, creatorId: id },
    select: { id: true, postId: true, status: true, eventType: true }
  });
  if (!manual) {
    throw new ScheduleRailNotFoundError(`Postbot task not found: ${tid}`);
  }
  if (manual.status === "done") {
    throw new ScheduleRailValidationError("Only pending schedule events accept media attach.");
  }
  if (manual.eventType !== "make_post") {
    throw new ScheduleRailValidationError("Only post events accept media attach.");
  }
  const postId = manual.postId?.trim();
  if (!postId) {
    throw new ScheduleRailValidationError(
      "This schedule reminder has no linked post to attach media to."
    );
  }
  return {
    result_task_id: manual.id,
    post_id: postId,
    plan_id: null,
    goal_cycle_campaign_key: null
  };
}

/**
 * Phase 8 / VS8 — attach, replace, or remove Import Bay media on a pending post task’s latest version.
 * Draft posts stay unpublished. Goal Cycle slot/variant projections sync when campaign-linked.
 * Also accepts planned routine occurrence ids (materializes first) and manual make_post events with a linked post.
 */
export async function attachMediaToScheduleRailEvent(
  prisma: PrismaClient,
  creatorId: string,
  taskId: string,
  mediaIdsInput: string[],
  options?: { mode?: AttachScheduleRailMediaMode }
): Promise<AttachScheduleRailMediaResult> {
  const id = creatorId.trim();
  const tid = taskId.trim();
  const mode: AttachScheduleRailMediaMode = options?.mode ?? "append";
  if (!tid) throw new ScheduleRailValidationError("task_id is required.");

  const incoming = [...new Set(mediaIdsInput.map((m) => m.trim()).filter(Boolean))];
  if (mode !== "remove" && incoming.length === 0) {
    throw new ScheduleRailValidationError("media_ids must be a non-empty array of strings.");
  }

  const target = await resolveScheduleRailAttachTarget(prisma, id, tid);
  const postId = target.post_id;

  const version = await prisma.postVersion.findFirst({
    where: { postId, post: { creatorId: id } },
    orderBy: { versionSeq: "desc" }
  });
  if (!version) {
    throw new ScheduleRailNotFoundError(`Post version not found for post: ${postId}`);
  }

  if (mode !== "remove") {
    for (const mid of incoming) {
      const m = await prisma.mediaAsset.findFirst({
        where: { id: mid, creatorId: id }
      });
      if (!m) {
        throw new ScheduleRailValidationError(`media_id not found for this creator: ${mid}`);
      }
      if (!isMediaEligibleForRelayNativePost(m)) {
        throw new ScheduleRailValidationError(
          `media_id is not a committed Relay upload or Discord capture in storage: ${mid}`
        );
      }
    }
  }

  const previousIds = (version.mediaIds ?? []).map((m) => m.trim()).filter(Boolean);
  let nextIds: string[];
  if (mode === "remove") {
    nextIds = [];
  } else if (mode === "replace") {
    nextIds = incoming;
  } else {
    nextIds = isPostMediaEmpty(version.mediaIds)
      ? incoming
      : mergeMediaIds(version.mediaIds, incoming);
  }

  const removedIds = previousIds.filter((mid) => !nextIds.includes(mid));

  await prisma.$transaction(async (tx) => {
    await tx.postVersion.update({
      where: { id: version.id },
      data: { mediaIds: nextIds }
    });
    for (const mid of nextIds) {
      const m = await tx.mediaAsset.findUniqueOrThrow({ where: { id: mid } });
      const nextPostIds = m.postIds.includes(postId) ? m.postIds : [...m.postIds, postId];
      const setPrimary = m.primaryPostId == null;
      await tx.mediaAsset.update({
        where: { id: mid },
        data: {
          postIds: nextPostIds,
          ...(setPrimary ? { primaryPostId: postId } : {}),
          autopostDraftId: null
        }
      });
    }
    for (const mid of removedIds) {
      const m = await tx.mediaAsset.findFirst({
        where: { id: mid, creatorId: id }
      });
      if (!m) continue;
      const nextPostIds = m.postIds.filter((pid) => pid !== postId);
      await tx.mediaAsset.update({
        where: { id: mid },
        data: {
          postIds: nextPostIds,
          ...(m.primaryPostId === postId || nextPostIds.length === 0
            ? { primaryPostId: null }
            : {})
        }
      });
    }

    // Keep the bridged Autopost draft in sync so resume opens with the same media.
    if (target.plan_id) {
      const plan = await tx.postDistributionPlan.findFirst({
        where: { id: target.plan_id, creatorId: id },
        select: { sourceDraftId: true }
      });
      const sourceDraftId = plan?.sourceDraftId?.trim();
      if (sourceDraftId) {
        await tx.autopostDraft.updateMany({
          where: {
            id: sourceDraftId,
            creatorId: id,
            status: { in: ["nudged", "drafting", "previewing"] }
          },
          data: {
            mediaIds: nextIds,
            status: nextIds.length === 0 ? "nudged" : "drafting",
            composerStep: nextIds.length === 0 ? "pick-media" : "draft-post"
          }
        });
      }
    }
  });

  const synced = await syncGoalCycleMediaProjections(prisma, {
    creatorId: id,
    postId,
    campaignKey: target.goal_cycle_campaign_key,
    mediaIds: nextIds
  });

  const needsMedia = nextIds.length === 0;
  return {
    task_id: target.result_task_id,
    post_id: postId,
    needs_media: needsMedia,
    media_count: countMediaIds(nextIds),
    media_ids: nextIds,
    media_state: synced.media_state,
    readiness_errors: buildMediaReadinessErrors(synced.media_state),
    mode
  };
}

export type ScheduleRailPostDetailsVariantWire = {
  destination: string;
  title: string | null;
  body_text: string | null;
  post_text: string | null;
  tags: string[];
};

export type UpdateScheduleRailPostDetailsInput = {
  title?: string | null;
  description?: string | null;
  tags?: string[];
};

export type ScheduleRailPostDetailsResult = {
  task_id: string;
  post_id: string;
  title: string;
  description: string | null;
  tags: string[];
  post_details_state: "authored";
  variants: ScheduleRailPostDetailsVariantWire[];
};

function normalizePostDetailTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const t = String(item ?? "")
      .trim()
      .replace(/^#/, "")
      .slice(0, 64);
    if (!t) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 20);
}

function seedVariantAsWritten(
  destination: DistributionDestination,
  title: string,
  description: string | null,
  tags: string[]
): ScheduleRailPostDetailsVariantWire {
  const body = description?.trim() || null;
  const titled = title.trim() || null;
  if (destination === "x") {
    const postText = (body || titled || "").trim() || null;
    return {
      destination,
      title: null,
      body_text: body,
      post_text: postText,
      tags: tags.map((t) => (t.startsWith("#") ? t : `#${t}`))
    };
  }
  if (destination === "bluesky") {
    const postText = (body || titled || "").trim() || null;
    return {
      destination,
      title: null,
      body_text: null,
      post_text: postText,
      tags: []
    };
  }
  if (destination === "deviantart") {
    return {
      destination,
      title: titled,
      body_text: body,
      post_text: null,
      tags
    };
  }
  return {
    destination,
    title: titled,
    body_text: body,
    post_text: null,
    tags: []
  };
}

const IMMUTABLE_VARIANT_STATUSES = new Set([
  "approved",
  "handed_off",
  "posted",
  "failed",
  "abandoned"
]);

/**
 * Persist artist-authored Title / Description / Tags on a scheduled rail event's
 * draft post and Autopost draft. Seeds only untouched draft destination variants
 * with exact authored text (no platform fitting).
 */
export async function updateScheduleRailEventPostDetails(
  prisma: PrismaClient,
  creatorId: string,
  railEventId: string,
  input: UpdateScheduleRailPostDetailsInput
): Promise<ScheduleRailPostDetailsResult> {
  const id = creatorId.trim();
  const tid = railEventId.trim();
  if (!tid) throw new ScheduleRailValidationError("event id is required.");

  const target = await resolveScheduleRailAttachTarget(prisma, id, tid);
  const postId = target.post_id;

  const post = await prisma.post.findFirst({
    where: { id: postId, creatorId: id },
    select: { id: true, publishState: true }
  });
  if (!post) {
    throw new ScheduleRailNotFoundError(`Post not found: ${postId}`);
  }
  if (post.publishState !== "draft") {
    throw new ScheduleRailValidationError(
      "Only draft Relay posts accept post details from the schedule rail."
    );
  }

  const version = await prisma.postVersion.findFirst({
    where: { postId, post: { creatorId: id } },
    orderBy: { versionSeq: "desc" }
  });
  if (!version) {
    throw new ScheduleRailNotFoundError(`Post version not found for post: ${postId}`);
  }

  const title =
    input.title !== undefined
      ? (input.title?.trim() || "Scheduled post").slice(0, 200)
      : version.title.slice(0, 200);
  const description =
    input.description !== undefined
      ? input.description?.trim() || null
      : version.description?.trim() || null;
  const tags =
    input.tags !== undefined
      ? normalizePostDetailTags(input.tags)
      : normalizePostDetailTags(version.tagIds);

  let planId = target.plan_id;
  if (!planId) {
    const plan = await prisma.postDistributionPlan.findFirst({
      where: { postId, creatorId: id, status: "active" },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    planId = plan?.id ?? null;
  }

  const variantsRows = planId
    ? await prisma.postDistributionVariant.findMany({
        where: { planId, creatorId: id },
        select: {
          id: true,
          destination: true,
          status: true,
          platformFields: true
        }
      })
    : await prisma.postDistributionVariant.findMany({
        where: { postId, creatorId: id },
        select: {
          id: true,
          destination: true,
          status: true,
          platformFields: true
        }
      });

  const seedableRows = variantsRows.filter((row) => {
    if (IMMUTABLE_VARIANT_STATUSES.has(row.status)) return false;
    if (row.status !== "draft") return false;
    const fields =
      row.platformFields &&
      typeof row.platformFields === "object" &&
      !Array.isArray(row.platformFields)
        ? (row.platformFields as Record<string, unknown>)
        : {};
    // Skip variants already prepared at scheduled-post review.
    return fields.rail_prepared !== true;
  });

  const variantWires = seedableRows
    .map((row) => row.destination)
    .filter(isDistributionDestination)
    .map((destination) => seedVariantAsWritten(destination, title, description, tags));

  let sourceDraftId: string | null = null;
  if (planId) {
    const plan = await prisma.postDistributionPlan.findFirst({
      where: { id: planId, creatorId: id },
      select: { sourceDraftId: true }
    });
    sourceDraftId = plan?.sourceDraftId?.trim() || null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.postVersion.update({
      where: { id: version.id },
      data: {
        title,
        description,
        tagIds: tags
      }
    });

    if (sourceDraftId) {
      const draft = await tx.autopostDraft.findFirst({
        where: {
          id: sourceDraftId,
          creatorId: id,
          status: { in: ["nudged", "drafting", "previewing"] }
        },
        select: { id: true, workspace: true, mediaIds: true }
      });
      if (draft) {
        const ws: Record<string, unknown> =
          draft.workspace && typeof draft.workspace === "object" && !Array.isArray(draft.workspace)
            ? { ...(draft.workspace as Record<string, unknown>) }
            : {};
        ws.tags = tags;
        ws.post_details_state = "authored";
        await tx.autopostDraft.update({
          where: { id: draft.id },
          data: {
            title,
            bodyText: description,
            workspace: ws as Prisma.InputJsonValue,
            status: "drafting",
            composerStep: "draft-post"
          }
        });
      }
    }

    for (const row of seedableRows) {
      if (!isDistributionDestination(row.destination)) continue;
      const wire = variantWires.find((v) => v.destination === row.destination);
      if (!wire) continue;
      await tx.postDistributionVariant.update({
        where: { id: row.id },
        data: {
          title: wire.title,
          bodyText: wire.body_text,
          postText: wire.post_text,
          tags: wire.tags
        }
      });
    }
  });

  return {
    task_id: target.result_task_id,
    post_id: postId,
    title,
    description,
    tags,
    post_details_state: "authored",
    variants: variantWires
  };
}

export type ScheduleRailReviewContext = {
  event_id: string;
  task_id: string;
  post_id: string;
  draft_id: string | null;
  plan_id: string | null;
  plan: DistributionPlanWire | null;
  variants: DistributionVariantWire[];
  destinations: DistributionDestination[];
  title: string;
  description: string | null;
  tags: string[];
  post_details_state: "none" | "authored";
  media_ids: string[];
  media_ready: boolean;
  media_state: string;
  readiness_errors: string[];
  composer_step: string | null;
  publish_state: string;
  scheduled_for: string | null;
  /** Prefill from Autopost draft workspace when present; otherwise default Public. */
  is_public: boolean;
  tier_ids: string[];
};

/**
 * Creator-scoped review context for a Schedule Rail event (task / occurrence).
 * Resolves by event_id, or legacy draft_id / variant_id / post_id.
 */
export async function getScheduleRailReviewContext(
  prisma: PrismaClient,
  creatorId: string,
  query: {
    event_id?: string | null;
    draft_id?: string | null;
    variant_id?: string | null;
    post_id?: string | null;
  }
): Promise<ScheduleRailReviewContext> {
  const id = creatorId.trim();
  let eventId = query.event_id?.trim() || "";

  if (!eventId && query.variant_id?.trim()) {
    const variant = await prisma.postDistributionVariant.findFirst({
      where: { id: query.variant_id.trim(), creatorId: id },
      select: { id: true, postId: true, planId: true }
    });
    if (!variant) {
      throw new ScheduleRailNotFoundError(`Variant not found: ${query.variant_id}`);
    }
    const task = await prisma.postbotTask.findFirst({
      where: {
        creatorId: id,
        postId: variant.postId,
        OR: [{ variantId: variant.id }, { planId: variant.planId }]
      },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    eventId = task?.id ?? "";
    if (!eventId) {
      // Fall through with post-only resolution below.
      query = { ...query, post_id: variant.postId };
    }
  }

  if (!eventId && query.draft_id?.trim()) {
    const plan = await prisma.postDistributionPlan.findFirst({
      where: {
        creatorId: id,
        sourceDraftId: query.draft_id.trim(),
        status: "active"
      },
      orderBy: { updatedAt: "desc" },
      select: { postId: true }
    });
    if (!plan) {
      throw new ScheduleRailNotFoundError(
        `No scheduled post linked to draft: ${query.draft_id}`
      );
    }
    const task = await prisma.postbotTask.findFirst({
      where: { creatorId: id, postId: plan.postId, action: "post", status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    eventId = task?.id ?? "";
    if (!eventId) {
      query = { ...query, post_id: plan.postId };
    }
  }

  if (!eventId && query.post_id?.trim()) {
    const task = await prisma.postbotTask.findFirst({
      where: {
        creatorId: id,
        postId: query.post_id.trim(),
        action: "post"
      },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    eventId = task?.id ?? "";
    if (!eventId) {
      throw new ScheduleRailNotFoundError(
        `No schedule rail event for post: ${query.post_id}`
      );
    }
  }

  if (!eventId) {
    throw new ScheduleRailValidationError(
      "event_id, draft_id, variant_id, or post_id is required."
    );
  }

  const target = await resolveScheduleRailAttachTarget(prisma, id, eventId);
  const postId = target.post_id;

  const post = await prisma.post.findFirst({
    where: { id: postId, creatorId: id },
    select: { id: true, publishState: true }
  });
  if (!post) {
    throw new ScheduleRailNotFoundError(`Post not found: ${postId}`);
  }

  const version = await prisma.postVersion.findFirst({
    where: { postId, post: { creatorId: id } },
    orderBy: { versionSeq: "desc" },
    select: {
      title: true,
      description: true,
      tagIds: true,
      mediaIds: true
    }
  });
  if (!version) {
    throw new ScheduleRailNotFoundError(`Post version not found for post: ${postId}`);
  }

  let planId = target.plan_id;
  let sourceDraftId: string | null = null;
  if (planId) {
    const planRow = await prisma.postDistributionPlan.findFirst({
      where: { id: planId, creatorId: id },
      select: { sourceDraftId: true }
    });
    sourceDraftId = planRow?.sourceDraftId?.trim() || null;
  } else {
    const planRow = await prisma.postDistributionPlan.findFirst({
      where: { postId, creatorId: id, status: "active" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, sourceDraftId: true }
    });
    planId = planRow?.id ?? null;
    sourceDraftId = planRow?.sourceDraftId?.trim() || null;
  }

  const plan = await getPostDistributionPlan(prisma, id, postId);

  let postDetailsState: "none" | "authored" = "none";
  let composerStep: string | null = null;
  let draftTags: string[] | null = null;
  let audienceIsPublic = true;
  let audienceTierIds: string[] = [];
  if (sourceDraftId) {
    const draft = await prisma.autopostDraft.findFirst({
      where: { id: sourceDraftId, creatorId: id },
      select: { workspace: true, composerStep: true }
    });
    if (draft) {
      composerStep = draft.composerStep?.trim() || null;
      const ws =
        draft.workspace && typeof draft.workspace === "object" && !Array.isArray(draft.workspace)
          ? (draft.workspace as Record<string, unknown>)
          : {};
      if (ws.post_details_state === "authored" || ws.post_details_state === "adapted") {
        postDetailsState = "authored";
      }
      if (Array.isArray(ws.tags)) {
        draftTags = ws.tags.map((t) => String(t).trim()).filter(Boolean);
      }
      if (typeof ws.is_public === "boolean") {
        audienceIsPublic = ws.is_public;
      }
      if (Array.isArray(ws.tier_ids)) {
        audienceTierIds = ws.tier_ids
          .map((t) => String(t ?? "").trim())
          .filter(Boolean);
      }
      if (!audienceIsPublic && audienceTierIds.length === 0) {
        // Invalid/missing gated audience — force reselection via Public default.
        audienceIsPublic = true;
      }
    }
  }

  // Authored details may live only on PostVersion (no draft workspace marker).
  if (postDetailsState === "none") {
    const hasAuthoredCopy =
      (version.title.trim() && version.title.trim() !== "Scheduled post") ||
      Boolean(version.description?.trim()) ||
      (version.tagIds?.length ?? 0) > 0;
    if (hasAuthoredCopy) postDetailsState = "authored";
  }

  const mediaIds = (version.mediaIds ?? []).map((m) => m.trim()).filter(Boolean);
  const mediaState = deriveMediaStateFromIds(mediaIds);
  const mediaReady = mediaState === "ready" || mediaState === "not_required";

  const task = await prisma.postbotTask.findFirst({
    where: { id: target.result_task_id, creatorId: id },
    select: {
      suggestedTime: true,
      variant: { select: { scheduledFor: true } }
    }
  });
  const scheduledFor =
    task?.variant?.scheduledFor?.toISOString() ??
    task?.suggestedTime?.toISOString() ??
    null;

  const destinations = (plan?.variants ?? [])
    .map((v) => v.destination)
    .filter(isDistributionDestination);

  return {
    event_id: target.result_task_id,
    task_id: target.result_task_id,
    post_id: postId,
    draft_id: sourceDraftId,
    plan_id: planId,
    plan,
    variants: plan?.variants ?? [],
    destinations,
    title: version.title,
    description: version.description?.trim() || null,
    tags: draftTags ?? normalizePostDetailTags(version.tagIds),
    post_details_state: postDetailsState,
    media_ids: mediaIds,
    media_ready: mediaReady,
    media_state: mediaState,
    readiness_errors: buildMediaReadinessErrors(mediaState),
    composer_step: composerStep,
    publish_state: post.publishState,
    scheduled_for: scheduledFor,
    is_public: audienceIsPublic,
    tier_ids: audienceIsPublic ? [] : audienceTierIds
  };
}

/**
 * Persist review-step progress on the linked Autopost draft without publishing.
 */
export async function updateScheduleRailReviewStep(
  prisma: PrismaClient,
  creatorId: string,
  eventId: string,
  composerStep: string
): Promise<ScheduleRailReviewContext> {
  const allowed = new Set([
    "draft-post",
    "variation-planning",
    "variant-review",
    "cross-post",
    "complete"
  ]);
  const step = composerStep.trim();
  if (!allowed.has(step)) {
    throw new ScheduleRailValidationError(
      "composer_step must be a valid review stage."
    );
  }

  const ctx = await getScheduleRailReviewContext(prisma, creatorId, { event_id: eventId });
  if (ctx.draft_id) {
    const draft = await prisma.autopostDraft.findFirst({
      where: {
        id: ctx.draft_id,
        creatorId: creatorId.trim(),
        status: { in: ["nudged", "drafting", "previewing"] }
      },
      select: { id: true }
    });
    if (draft) {
      await prisma.autopostDraft.update({
        where: { id: draft.id },
        data: {
          composerStep: step,
          status: "drafting"
        }
      });
    }
  }

  return getScheduleRailReviewContext(prisma, creatorId, { event_id: eventId });
}

export type PublishScheduleRailReviewInput = {
  is_public: boolean;
  tier_ids?: string[];
  title?: string | null;
  description?: string | null;
  tags?: string[];
};

/**
 * Publish the existing linked draft Relay post for a Schedule Rail review event.
 * Never mints a second Post. Advances Autopost draft composer_step toward prepare.
 */
export async function publishScheduleRailReviewPost(
  prisma: PrismaClient,
  creatorId: string,
  eventId: string,
  input: PublishScheduleRailReviewInput
): Promise<ScheduleRailReviewContext> {
  const ctx = await getScheduleRailReviewContext(prisma, creatorId, {
    event_id: eventId
  });

  await publishExistingRelayPost(prisma, {
    creatorId,
    postId: ctx.post_id,
    isPublic: input.is_public === true,
    tierIds: input.tier_ids ?? [],
    title: input.title,
    description: input.description,
    tags: input.tags
  });

  // Persist audience on draft workspace for resume; always enter prepare next.
  // Rail-seeded variants may carry rail_prepared without an explicit prepare pass —
  // requireExplicitPrepare still needs variation-planning before handoff.
  if (ctx.draft_id) {
    const draft = await prisma.autopostDraft.findFirst({
      where: {
        id: ctx.draft_id,
        creatorId: creatorId.trim(),
        status: { in: ["nudged", "drafting", "previewing"] }
      },
      select: { id: true, workspace: true, composerStep: true }
    });
    if (draft) {
      const ws =
        draft.workspace && typeof draft.workspace === "object" && !Array.isArray(draft.workspace)
          ? { ...(draft.workspace as Record<string, unknown>) }
          : {};
      ws.is_public = input.is_public === true;
      ws.tier_ids = input.is_public === true ? [] : (input.tier_ids ?? []);
      await prisma.autopostDraft.update({
        where: { id: draft.id },
        data: {
          workspace: ws as Prisma.InputJsonValue,
          composerStep: "variation-planning",
          status: "drafting",
          publishedPostId: ctx.post_id
        }
      });
    }
  }

  return getScheduleRailReviewContext(prisma, creatorId, { event_id: eventId });
}

