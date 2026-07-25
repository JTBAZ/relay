/**
 * Extension sticky schedule reminders (Phase 5).
 *
 * effective_notify =
 *   CreatorPostingGoal.remindMeGlobal === true
 *   AND (PostbotTask.remindMe ?? PostDistributionVariant.remindMe) === true
 *
 * Extension channel uses PostbotTask.reminderSentAt / snoozedUntil.
 * In-app distribution-schedule-reminder-worker keeps using variant.reminderSentAt (uncoupled).
 *
 * CTA matrix: action + media readiness → primary/secondary CTAs (hub vs platform).
 *
 * @see docs/studio/PLAN_PHASE_5_EXTENSION_STICKY_REMINDERS.md
 */

import type { PostbotTaskAction, PrismaClient } from "@prisma/client";
import {
  buildGoalCycleDuePacketFields,
  parseGoalCycleIdFromCampaignKey,
  sanitizeLooseReminderUrl,
  sanitizeReminderDeepLink,
  type GoalCycleDuePacketFields
} from "../goal-cycle/execution/goal-cycle-due-packet.js";
import { resolveGoalCycleTaskKindFromSlot } from "../goal-cycle/execution/goal-cycle-execution-service.js";
import {
  extensionTransportActionForEventType,
  isCreatorScheduleEventType,
  parseManualEventReminderId,
  reminderIdForManualEvent,
  type CreatorScheduleEventTypeWire
} from "./creator-schedule-event-contract.js";

export const REMINDER_ID_PREFIX = "schedule_reminder:task:" as const;
export const DEFAULT_SNOOZE_MINUTES = 60;

/** Same predicate as schedule-rail-service.isPostMediaEmpty (kept local to avoid cycles). */
function isPostMediaEmpty(mediaIds: string[] | null | undefined): boolean {
  if (!mediaIds || mediaIds.length === 0) return true;
  return mediaIds.every((id) => !id.trim());
}

/** Same due resolution as Phase 4 schedule rail. */
function resolveTaskDueAt(args: {
  suggestedTime: Date | null;
  scheduledFor: Date | null;
}): Date | null {
  return args.scheduledFor ?? args.suggestedTime ?? null;
}

export type ScheduleReminderDestination = "patreon" | "x" | "deviantart" | "bluesky";

export type ScheduleReminderCtaKind = "external_post" | "relay_autopost" | "relay_studio";

export type ScheduleReminderCta = {
  kind: ScheduleReminderCtaKind;
  url: string | null;
  label: string;
};

export type ScheduleReminderPacket = {
  reminder_id: string;
  task_id: string;
  variant_id: string | null;
  post_id: string;
  /** Null for destination-free custom manual events (old clients should tolerate unknown). */
  destination: ScheduleReminderDestination | null;
  action: "post" | "schedule" | "pin_comment" | "repost";
  title: string;
  /** External platform URL when known (also used as secondary for hub actions). */
  open_url: string | null;
  due_at: string;
  plan_label: string | null;
  plan_index?: number;
  plan_total?: number;
  media_ready: boolean;
  primary_cta: ScheduleReminderCta;
  secondary_cta: ScheduleReminderCta | null;
  /** Exact manual event type when source is CreatorScheduleEvent. */
  event_type?: CreatorScheduleEventTypeWire | null;
  /** Manual event id when reminder_id uses the manual prefix. */
  manual_event_id?: string | null;
  /** VS8 Goal Cycle overlay — optional; Phase 5 clients ignore unknown keys. */
  goal_cycle_id?: string | null;
  goal_cycle_slot_id?: string | null;
  campaign_key?: string | null;
  relay_post_id?: string | null;
  distribution_plan_id?: string | null;
  rail_event_id?: string | null;
  task_kind?: "publish" | "social_upkeep" | "active_rest" | null;
  due_local?: string | null;
  time_zone?: string | null;
  media_requirements?: string[];
  instructions?: string | null;
};

export class ScheduleReminderNotFoundError extends Error {
  public override readonly name = "ScheduleReminderNotFoundError";
}

export class ScheduleReminderValidationError extends Error {
  public override readonly name = "ScheduleReminderValidationError";
}

const DEST_SHORT: Record<ScheduleReminderDestination, string> = {
  patreon: "Patreon",
  x: "X",
  deviantart: "DeviantArt",
  bluesky: "Bluesky"
};

/** Exported for unit tests. */
export function reminderIdForTask(taskId: string): string {
  return `${REMINDER_ID_PREFIX}${taskId.trim()}`;
}

/** Exported for unit tests. */
export function parseReminderTaskId(reminderId: string): string | null {
  const raw = reminderId.trim();
  if (!raw.startsWith(REMINDER_ID_PREFIX)) return null;
  const taskId = raw.slice(REMINDER_ID_PREFIX.length).trim();
  return taskId || null;
}

/** Exported for unit tests. */
export function effectivePerEventNotify(args: {
  taskRemindMe: boolean | null | undefined;
  variantRemindMe: boolean;
}): boolean {
  if (args.taskRemindMe !== null && args.taskRemindMe !== undefined) {
    return args.taskRemindMe === true;
  }
  return args.variantRemindMe === true;
}

/** Exported for unit tests. */
export function isDueReminderEligible(args: {
  status: string;
  dueAt: Date | null;
  now: Date;
  remindMeGlobal: boolean;
  taskRemindMe: boolean | null | undefined;
  variantRemindMe: boolean;
  reminderSentAt: Date | null;
  snoozedUntil: Date | null;
}): boolean {
  if (args.status !== "pending") return false;
  if (!args.dueAt || args.dueAt.getTime() > args.now.getTime()) return false;
  if (!args.remindMeGlobal) return false;
  if (
    !effectivePerEventNotify({
      taskRemindMe: args.taskRemindMe,
      variantRemindMe: args.variantRemindMe
    })
  ) {
    return false;
  }
  if (args.snoozedUntil && args.snoozedUntil.getTime() > args.now.getTime()) return false;
  if (args.reminderSentAt) return false;
  return true;
}

/** Exported for unit tests / extension. */
export function resolveRelayWebBase(env: NodeJS.ProcessEnv = process.env): string {
  const raw =
    env.RELAY_PUBLIC_WEB_BASE_URL?.trim() ||
    env.RELAY_PATRON_WEB_BASE_URL?.trim() ||
    "";
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:3000";
}

function mapDestination(raw: string | null | undefined): ScheduleReminderDestination | null {
  if (raw === "patreon" || raw === "x" || raw === "deviantart" || raw === "bluesky") {
    return raw;
  }
  return null;
}

function mapAction(
  action: PostbotTaskAction
): ScheduleReminderPacket["action"] | null {
  if (
    action === "post" ||
    action === "schedule" ||
    action === "pin_comment" ||
    action === "repost"
  ) {
    return action;
  }
  return null;
}

async function resolveOpenUrl(
  prisma: PrismaClient,
  args: { link: string | null; postId: string; destination: string; creatorId: string }
): Promise<string | null> {
  const link = args.link?.trim();
  if (link) return link;

  const attempt = await prisma.postDistributionAttempt.findFirst({
    where: {
      postId: args.postId,
      destination: args.destination,
      creatorId: args.creatorId,
      externalUrl: { not: null }
    },
    orderBy: { startedAt: "desc" },
    select: { externalUrl: true }
  });
  const attemptUrl = attempt?.externalUrl?.trim();
  if (attemptUrl) return attemptUrl;

  const instance = await prisma.platformInstance.findFirst({
    where: {
      postId: args.postId,
      destination: args.destination,
      creatorId: args.creatorId,
      externalUrl: { not: null }
    },
    select: { externalUrl: true }
  });
  return instance?.externalUrl?.trim() || null;
}

async function resolveAutopostDraftId(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<string | null> {
  const byPublished = await prisma.autopostDraft.findFirst({
    where: {
      creatorId,
      publishedPostId: postId,
      status: { not: "discarded" }
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });
  if (byPublished?.id) return byPublished.id;

  const plan = await prisma.postDistributionPlan.findFirst({
    where: { creatorId, postId, sourceDraftId: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { sourceDraftId: true }
  });
  return plan?.sourceDraftId?.trim() || null;
}

/** Text-format schedule drafts are media-ready without assets. */
async function resolvePostMediaReady(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<boolean> {
  const plan = await prisma.postDistributionPlan.findFirst({
    where: { creatorId, postId },
    orderBy: { updatedAt: "desc" },
    select: { sourceDraftId: true, assistantPlan: true }
  });
  const planJson =
    plan?.assistantPlan && typeof plan.assistantPlan === "object" && !Array.isArray(plan.assistantPlan)
      ? (plan.assistantPlan as Record<string, unknown>)
      : {};
  if (planJson.planned_format === "text") return true;

  if (plan?.sourceDraftId) {
    const draft = await prisma.autopostDraft.findFirst({
      where: { id: plan.sourceDraftId, creatorId },
      select: { workspace: true }
    });
    const ws =
      draft?.workspace && typeof draft.workspace === "object" && !Array.isArray(draft.workspace)
        ? (draft.workspace as Record<string, unknown>)
        : {};
    if (ws.planned_format === "text") return true;
  }

  const version = await prisma.postVersion.findFirst({
    where: { postId, post: { creatorId } },
    orderBy: { versionSeq: "desc" },
    select: { mediaIds: true }
  });
  return !isPostMediaEmpty(version?.mediaIds);
}

/**
 * Action + media readiness → primary/secondary CTAs.
 * Exact event_type (when present) refines CTA selection for manual events.
 * Exported for unit tests.
 */
export function resolveReminderCtas(args: {
  action: ScheduleReminderPacket["action"];
  destination: ScheduleReminderDestination | null;
  mediaReady: boolean;
  openUrl: string | null;
  relayWebBase: string;
  draftId: string | null;
  /** Schedule rail event id (postbot task id) for post-task review deep links. */
  eventId?: string | null;
  eventType?: CreatorScheduleEventTypeWire | null;
}): { primary_cta: ScheduleReminderCta; secondary_cta: ScheduleReminderCta | null } {
  const base = args.relayWebBase.replace(/\/$/, "");
  const studioUrl = `${base}/studio`;
  const reviewUrl = args.eventId
    ? `${base}/studio/distribution?event_id=${encodeURIComponent(args.eventId)}`
    : null;
  const autopostUrl = args.draftId
    ? `${base}/studio/autopost?draft_id=${encodeURIComponent(args.draftId)}`
    : `${base}/studio/autopost`;
  const eventType = args.eventType ?? null;
  const destLabel = args.destination ? DEST_SHORT[args.destination] : null;
  const externalLabel = destLabel ? `Open on ${destLabel}` : "Open link";

  const externalFamily =
    args.action === "repost" ||
    args.action === "pin_comment" ||
    eventType === "engage_comments" ||
    eventType === "pin_comment" ||
    eventType === "repost" ||
    (eventType === "custom" && Boolean(args.openUrl));

  if (externalFamily) {
    const primary: ScheduleReminderCta = {
      kind: "external_post",
      url: args.openUrl,
      label: args.openUrl ? externalLabel : "Open post"
    };
    const secondary: ScheduleReminderCta | null = args.openUrl
      ? null
      : { kind: "relay_studio", url: studioUrl, label: "Open in Relay" };
    return { primary_cta: primary, secondary_cta: secondary };
  }

  if (eventType === "custom" && !args.openUrl) {
    return {
      primary_cta: { kind: "relay_studio", url: studioUrl, label: "Open in Relay" },
      secondary_cta: null
    };
  }

  if (args.action === "post" || eventType === "make_post") {
    if (!args.mediaReady) {
      return {
        primary_cta: {
          kind: "relay_studio",
          url: studioUrl,
          label: "Finish media in Studio"
        },
        secondary_cta: null
      };
    }
    if (reviewUrl) {
      return {
        primary_cta: {
          kind: "relay_autopost",
          url: reviewUrl,
          label: "Review and send"
        },
        secondary_cta: args.openUrl
          ? { kind: "external_post", url: args.openUrl, label: externalLabel }
          : null
      };
    }
    return {
      primary_cta: {
        kind: "relay_autopost",
        url: autopostUrl,
        label: "Open in Autopost"
      },
      secondary_cta: args.openUrl
        ? { kind: "external_post", url: args.openUrl, label: externalLabel }
        : null
    };
  }

  // schedule / schedule_post
  return {
    primary_cta: {
      kind: "relay_studio",
      url: studioUrl,
      label: "Review in Relay"
    },
    secondary_cta: args.openUrl
      ? { kind: "external_post", url: args.openUrl, label: externalLabel }
      : null
  };
}

export async function listDueScheduleReminders(
  prisma: PrismaClient,
  creatorId: string,
  options?: { now?: Date; limit?: number; relayWebBase?: string }
): Promise<ScheduleReminderPacket[]> {
  const id = creatorId.trim();
  const now = options?.now ?? new Date();
  const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
  const relayWebBase = options?.relayWebBase ?? resolveRelayWebBase();

  const goal = await prisma.creatorPostingGoal.findUnique({
    where: { creatorId: id },
    select: { remindMeGlobal: true }
  });
  const remindMeGlobal = goal?.remindMeGlobal ?? true;
  if (!remindMeGlobal) return [];

  const rows = await prisma.postbotTask.findMany({
    where: {
      creatorId: id,
      status: "pending",
      reminderSentAt: null,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }]
    },
    include: {
      variant: {
        select: {
          id: true,
          title: true,
          remindMe: true,
          scheduledFor: true
        }
      }
    },
    orderBy: { createdAt: "asc" },
    take: 200
  });

  const out: ScheduleReminderPacket[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    const destination = mapDestination(row.destination);
    const action = mapAction(row.action);
    if (!destination || !action) continue;

    const dueAt = resolveTaskDueAt({
      suggestedTime: row.suggestedTime,
      scheduledFor: row.variant.scheduledFor
    });
    if (
      !isDueReminderEligible({
        status: row.status,
        dueAt,
        now,
        remindMeGlobal,
        taskRemindMe: row.remindMe,
        variantRemindMe: row.variant.remindMe,
        reminderSentAt: row.reminderSentAt,
        snoozedUntil: row.snoozedUntil
      })
    ) {
      continue;
    }

    const openUrlRaw = await resolveOpenUrl(prisma, {
      link: row.link,
      postId: row.postId,
      destination: row.destination,
      creatorId: id
    });
    const openUrl = sanitizeReminderDeepLink(openUrlRaw, destination, relayWebBase);

    let mediaReady = true;
    if (action === "post") {
      mediaReady = await resolvePostMediaReady(prisma, id, row.postId);
    }

    const draftId = action === "post" ? await resolveAutopostDraftId(prisma, id, row.postId) : null;

    const ctas = resolveReminderCtas({
      action,
      destination,
      mediaReady,
      openUrl,
      relayWebBase,
      draftId,
      eventId: action === "post" ? row.id : null
    });
    ctas.primary_cta = {
      ...ctas.primary_cta,
      url: sanitizeReminderDeepLink(ctas.primary_cta.url, destination, relayWebBase)
    };
    if (ctas.secondary_cta) {
      ctas.secondary_cta = {
        ...ctas.secondary_cta,
        url: sanitizeReminderDeepLink(ctas.secondary_cta.url, destination, relayWebBase)
      };
    }

    const goalCycleFields = await resolveGoalCycleDuePacketFields(prisma, {
      creatorId: id,
      taskId: row.id,
      postId: row.postId,
      planId: row.planId,
      campaignKey: row.goalCycleCampaignKey,
      dueAt: dueAt!,
      mediaReady,
      destination,
      action
    });

    out.push({
      reminder_id: reminderIdForTask(row.id),
      task_id: row.id,
      variant_id: row.variantId,
      post_id: row.postId,
      destination,
      action,
      title: row.variant.title?.trim() || action,
      open_url: openUrl,
      due_at: dueAt!.toISOString(),
      plan_label: row.planId ? "Strategy plan" : null,
      media_ready: mediaReady,
      primary_cta: ctas.primary_cta,
      secondary_cta: ctas.secondary_cta,
      event_type: null,
      manual_event_id: null,
      ...goalCycleFields
    });
  }

  if (out.length < limit) {
    const manualRows = await prisma.creatorScheduleEvent.findMany({
      where: {
        creatorId: id,
        status: "pending",
        remindMe: true,
        reminderSentAt: null,
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
        dueAt: { lte: now }
      },
      orderBy: { dueAt: "asc" },
      take: 100
    });

    for (const row of manualRows) {
      if (out.length >= limit) break;
      if (!isCreatorScheduleEventType(row.eventType)) continue;
      const eventType = row.eventType as CreatorScheduleEventTypeWire;
      const action = extensionTransportActionForEventType(eventType);
      const destination = mapDestination(row.destination);

      // Custom events are destination-free; social types still need a mapped destination.
      if (eventType !== "custom" && !destination) continue;

      const openUrlRaw = row.externalUrl?.trim() || null;
      const openUrl =
        eventType === "custom"
          ? sanitizeLooseReminderUrl(openUrlRaw)
          : sanitizeReminderDeepLink(openUrlRaw, destination!, relayWebBase);
      const mediaReady = true;
      const ctas = resolveReminderCtas({
        action,
        destination,
        mediaReady,
        openUrl,
        relayWebBase,
        draftId: null,
        eventType
      });
      const sanitizeCtaUrl = (url: string | null) =>
        eventType === "custom"
          ? sanitizeLooseReminderUrl(url)
          : sanitizeReminderDeepLink(url, destination!, relayWebBase);
      ctas.primary_cta = {
        ...ctas.primary_cta,
        url: sanitizeCtaUrl(ctas.primary_cta.url)
      };
      if (ctas.secondary_cta) {
        ctas.secondary_cta = {
          ...ctas.secondary_cta,
          url: sanitizeCtaUrl(ctas.secondary_cta.url)
        };
      }

      out.push({
        reminder_id: reminderIdForManualEvent(row.id),
        task_id: row.id,
        variant_id: null,
        post_id: row.postId ?? "",
        destination,
        action,
        title: row.title,
        open_url: openUrl,
        due_at: row.dueAt.toISOString(),
        plan_label: null,
        media_ready: mediaReady,
        primary_cta: ctas.primary_cta,
        secondary_cta: ctas.secondary_cta,
        event_type: eventType,
        manual_event_id: row.id,
        rail_event_id: row.id,
        task_kind:
          eventType === "make_post"
            ? "publish"
            : eventType === "schedule_post"
              ? "active_rest"
              : "social_upkeep",
        instructions: row.note,
        relay_post_id: row.postId
      });
    }
  }

  out.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  return out.slice(0, limit);
}

/**
 * Earliest future remindable due time (manual events + Postbot tasks).
 * Used by the extension to schedule a one-shot alarm near the exact due instant.
 */
export async function getNextUpcomingScheduleReminderDueAt(
  prisma: PrismaClient,
  creatorId: string,
  options?: { now?: Date }
): Promise<Date | null> {
  const id = creatorId.trim();
  const now = options?.now ?? new Date();

  const goal = await prisma.creatorPostingGoal.findUnique({
    where: { creatorId: id },
    select: { remindMeGlobal: true }
  });
  const remindMeGlobal = goal?.remindMeGlobal ?? true;
  if (!remindMeGlobal) return null;

  const nextManual = await prisma.creatorScheduleEvent.findFirst({
    where: {
      creatorId: id,
      status: "pending",
      remindMe: true,
      reminderSentAt: null,
      dueAt: { gt: now },
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }]
    },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true }
  });

  const taskRows = await prisma.postbotTask.findMany({
    where: {
      creatorId: id,
      status: "pending",
      reminderSentAt: null,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }]
    },
    include: {
      variant: {
        select: {
          remindMe: true,
          scheduledFor: true
        }
      }
    },
    take: 200
  });

  let nextTaskDue: Date | null = null;
  for (const row of taskRows) {
    const destination = mapDestination(row.destination);
    const action = mapAction(row.action);
    if (!destination || !action) continue;
    const dueAt = resolveTaskDueAt({
      suggestedTime: row.suggestedTime,
      scheduledFor: row.variant.scheduledFor
    });
    if (!dueAt || dueAt.getTime() <= now.getTime()) continue;
    if (
      !effectivePerEventNotify({
        taskRemindMe: row.remindMe,
        variantRemindMe: row.variant.remindMe
      })
    ) {
      continue;
    }
    if (row.snoozedUntil && row.snoozedUntil.getTime() > now.getTime()) continue;
    if (!nextTaskDue || dueAt.getTime() < nextTaskDue.getTime()) {
      nextTaskDue = dueAt;
    }
  }

  const candidates = [nextManual?.dueAt ?? null, nextTaskDue].filter(
    (d): d is Date => d instanceof Date && Number.isFinite(d.getTime())
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

async function resolveGoalCycleDuePacketFields(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    taskId: string;
    postId: string;
    planId: string | null;
    campaignKey: string | null;
    dueAt: Date;
    mediaReady: boolean;
    destination: ScheduleReminderDestination;
    action: ScheduleReminderPacket["action"];
  }
): Promise<GoalCycleDuePacketFields | Record<string, never>> {
  const campaignKey = args.campaignKey?.trim() || null;
  if (!campaignKey) return {};

  const cycleId = parseGoalCycleIdFromCampaignKey(campaignKey);
  if (!cycleId) return {};

  const cycle = await prisma.creatorGoalCycle.findFirst({
    where: { id: cycleId, creatorId: args.creatorId },
    select: { id: true, timeZone: true, breakMode: true }
  });
  if (!cycle) return {};

  const candidates = await prisma.creatorGoalCycleSlot.findMany({
    where: {
      cycleId: cycle.id,
      OR: [{ downstreamPostId: args.postId }, { goalCycleCampaignKey: campaignKey }]
    },
    orderBy: { rank: "asc" },
    select: {
      slotKey: true,
      downstreamPlanId: true,
      downstreamTaskIds: true,
      format: true,
      intent: true,
      mediaState: true
    },
    take: 8
  });

  const slot =
    candidates.find((s) => {
      const ids = Array.isArray(s.downstreamTaskIds)
        ? (s.downstreamTaskIds as unknown[]).map(String)
        : [];
      return ids.includes(args.taskId);
    }) ??
    candidates.find((s) => s.downstreamPlanId && s.downstreamPlanId === args.planId) ??
    candidates[0] ??
    null;

  const taskKind = resolveGoalCycleTaskKindFromSlot({
    breakMode: cycle.breakMode,
    format: slot?.format,
    intent: slot?.intent
  });

  const mediaReady =
    taskKind !== "publish"
      ? true
      : args.mediaReady || slot?.mediaState === "ready" || slot?.mediaState === "not_required";

  return buildGoalCycleDuePacketFields({
    cycleId: cycle.id,
    slotId: slot?.slotKey ?? "unknown",
    campaignKey,
    postId: args.postId,
    planId: slot?.downstreamPlanId ?? args.planId,
    taskId: args.taskId,
    taskKind,
    dueAt: args.dueAt,
    timeZone: cycle.timeZone || "UTC",
    mediaReady,
    destinationLabel: DEST_SHORT[args.destination]
  });
}

async function loadOwnedTask(
  prisma: PrismaClient,
  creatorId: string,
  reminderId: string
) {
  const taskId = parseReminderTaskId(reminderId);
  if (!taskId) {
    throw new ScheduleReminderValidationError("Invalid reminder_id.");
  }
  const row = await prisma.postbotTask.findFirst({
    where: { id: taskId, creatorId: creatorId.trim() }
  });
  if (!row) throw new ScheduleReminderNotFoundError(`Reminder not found: ${reminderId}`);
  return row;
}

async function loadOwnedManualEvent(
  prisma: PrismaClient,
  creatorId: string,
  reminderId: string
) {
  const eventId = parseManualEventReminderId(reminderId);
  if (!eventId) {
    throw new ScheduleReminderValidationError("Invalid reminder_id.");
  }
  const row = await prisma.creatorScheduleEvent.findFirst({
    where: { id: eventId, creatorId: creatorId.trim() }
  });
  if (!row) throw new ScheduleReminderNotFoundError(`Reminder not found: ${reminderId}`);
  return row;
}

function isManualReminderId(reminderId: string): boolean {
  return parseManualEventReminderId(reminderId) !== null;
}

/** Mark reminder consumed (show marker or user dismiss). */
export async function markScheduleReminderPresented(
  prisma: PrismaClient,
  creatorId: string,
  reminderId: string,
  now = new Date()
): Promise<{ reminder_id: string; reminder_sent_at: string }> {
  if (isManualReminderId(reminderId)) {
    const row = await loadOwnedManualEvent(prisma, creatorId, reminderId);
    const updated = await prisma.creatorScheduleEvent.update({
      where: { id: row.id },
      data: { reminderSentAt: now }
    });
    return {
      reminder_id: reminderIdForManualEvent(updated.id),
      reminder_sent_at: updated.reminderSentAt!.toISOString()
    };
  }
  const row = await loadOwnedTask(prisma, creatorId, reminderId);
  const updated = await prisma.postbotTask.update({
    where: { id: row.id },
    data: { reminderSentAt: now }
  });
  return {
    reminder_id: reminderIdForTask(updated.id),
    reminder_sent_at: updated.reminderSentAt!.toISOString()
  };
}

export async function dismissScheduleReminder(
  prisma: PrismaClient,
  creatorId: string,
  reminderId: string,
  now = new Date()
): Promise<{ reminder_id: string; reminder_sent_at: string }> {
  return markScheduleReminderPresented(prisma, creatorId, reminderId, now);
}

export async function snoozeScheduleReminder(
  prisma: PrismaClient,
  creatorId: string,
  reminderId: string,
  snoozeMinutes: number = DEFAULT_SNOOZE_MINUTES,
  now = new Date()
): Promise<{ reminder_id: string; snoozed_until: string }> {
  const minutes = Number.isFinite(snoozeMinutes)
    ? Math.min(24 * 60, Math.max(1, Math.floor(snoozeMinutes)))
    : DEFAULT_SNOOZE_MINUTES;
  const snoozedUntil = new Date(now.getTime() + minutes * 60_000);

  if (isManualReminderId(reminderId)) {
    const row = await loadOwnedManualEvent(prisma, creatorId, reminderId);
    const updated = await prisma.creatorScheduleEvent.update({
      where: { id: row.id },
      data: {
        snoozedUntil,
        reminderSentAt: null
      }
    });
    return {
      reminder_id: reminderIdForManualEvent(updated.id),
      snoozed_until: updated.snoozedUntil!.toISOString()
    };
  }

  const row = await loadOwnedTask(prisma, creatorId, reminderId);
  const updated = await prisma.postbotTask.update({
    where: { id: row.id },
    data: {
      snoozedUntil,
      reminderSentAt: null
    }
  });
  return {
    reminder_id: reminderIdForTask(updated.id),
    snoozed_until: updated.snoozedUntil!.toISOString()
  };
}
