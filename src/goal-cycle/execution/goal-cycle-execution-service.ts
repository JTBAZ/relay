/**
 * Goal Cycle execution helpers (VS8-T02 / T03).
 * Media projection sync + bounded task-kind routing (no autonomous publish).
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  GOAL_CYCLE_ACTIVE_REST_FORMATS,
  GOAL_CYCLE_SOCIAL_UPKEEP_FORMATS
} from "../planner/plan-schema.js";
import {
  mapGoalCycleTaskKind,
  parseGoalCycleIdFromCampaignKey,
  type GoalCycleTaskKind
} from "./goal-cycle-due-packet.js";
import { GoalCycleContractError } from "../contracts.js";

const UPKEEP_FORMAT_SET = new Set<string>(GOAL_CYCLE_SOCIAL_UPKEEP_FORMATS);
const ACTIVE_REST_FORMAT_SET = new Set<string>(GOAL_CYCLE_ACTIVE_REST_FORMATS);

export type GoalCycleMediaState = "missing" | "partial" | "ready" | "not_required";

export type GoalCycleMaterializationMode = "new_post" | "upkeep_task";

export function isSocialUpkeepSlotFormat(format: string | null | undefined): boolean {
  return UPKEEP_FORMAT_SET.has(String(format ?? "").trim());
}

export function isActiveRestSlotFormat(format: string | null | undefined): boolean {
  return ACTIVE_REST_FORMAT_SET.has(String(format ?? "").trim());
}

export function classifyGoalCycleMaterializationMode(args: {
  format?: string | null;
  intent?: string | null;
  breakMode?: string | null;
}): GoalCycleMaterializationMode {
  if (args.breakMode === "social_upkeep" || isSocialUpkeepSlotFormat(args.format)) {
    return "upkeep_task";
  }
  if (args.intent === "social_upkeep") return "upkeep_task";
  return "new_post";
}

export function resolveGoalCycleTaskKindFromSlot(args: {
  breakMode?: string | null;
  format?: string | null;
  intent?: string | null;
}): GoalCycleTaskKind {
  const mode =
    classifyGoalCycleMaterializationMode(args) === "upkeep_task" ? "upkeep_task" : null;
  if (mode === "upkeep_task") {
    return mapGoalCycleTaskKind({ breakMode: args.breakMode, slotMode: "upkeep_task" });
  }
  if (
    args.breakMode === "active_rest" ||
    args.intent === "active_rest" ||
    isActiveRestSlotFormat(args.format)
  ) {
    return "active_rest";
  }
  return mapGoalCycleTaskKind({ breakMode: args.breakMode });
}

export function deriveMediaStateFromIds(
  mediaIds: string[] | null | undefined,
  opts?: { notRequired?: boolean }
): GoalCycleMediaState {
  if (opts?.notRequired) return "not_required";
  const ids = (mediaIds ?? []).map((m) => m.trim()).filter(Boolean);
  if (ids.length === 0) return "missing";
  if (ids.length === 1) return "ready";
  return "ready";
}

export function buildMediaReadinessErrors(mediaState: GoalCycleMediaState): string[] {
  if (mediaState === "missing" || mediaState === "partial") return ["attach_media"];
  return [];
}

/** Autopost / distribution handoff path — creator must confirm; never auto-publish. */
export function buildPublishConfirmationPath(args: {
  variantId: string | null | undefined;
  draftId?: string | null;
  relayWebBase?: string | null;
}): string {
  const base = (args.relayWebBase?.trim() || "http://localhost:3000").replace(/\/$/, "");
  if (args.draftId?.trim()) {
    return `${base}/studio/autopost?draft_id=${encodeURIComponent(args.draftId.trim())}`;
  }
  if (args.variantId?.trim()) {
    return `${base}/studio/distribution?variant_id=${encodeURIComponent(args.variantId.trim())}`;
  }
  return `${base}/studio/autopost`;
}

/**
 * After attach/replace/remove: sync Goal Cycle slot mediaState + variant advice.
 * No-op when the task is not Goal Cycle–linked.
 */
export async function syncGoalCycleMediaProjections(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    postId: string;
    campaignKey: string | null | undefined;
    mediaIds: string[];
    notRequired?: boolean;
  }
): Promise<{ media_state: GoalCycleMediaState; synced: boolean }> {
  const mediaState = deriveMediaStateFromIds(args.mediaIds, {
    notRequired: args.notRequired === true
  });
  const campaignKey = args.campaignKey?.trim() || null;
  if (!campaignKey) {
    return { media_state: mediaState, synced: false };
  }

  const cycleId = parseGoalCycleIdFromCampaignKey(campaignKey);
  if (!cycleId) {
    return { media_state: mediaState, synced: false };
  }

  const cycle = await prisma.creatorGoalCycle.findFirst({
    where: { id: cycleId, creatorId: args.creatorId },
    select: { id: true }
  });
  if (!cycle) {
    return { media_state: mediaState, synced: false };
  }

  await prisma.$transaction(async (tx) => {
    await tx.creatorGoalCycleSlot.updateMany({
      where: {
        cycleId: cycle.id,
        OR: [{ downstreamPostId: args.postId }, { goalCycleCampaignKey: campaignKey }]
      },
      data: {
        mediaState,
        status: mediaState === "ready" || mediaState === "not_required" ? "media_ready" : "materialized"
      }
    });

    const variants = await tx.postDistributionVariant.findMany({
      where: {
        creatorId: args.creatorId,
        postId: args.postId,
        goalCycleCampaignKey: campaignKey
      },
      select: { id: true, advice: true }
    });
    for (const v of variants) {
      const advice =
        v.advice && typeof v.advice === "object" && !Array.isArray(v.advice)
          ? { ...(v.advice as Record<string, unknown>) }
          : {};
      advice.media_state = mediaState;
      await tx.postDistributionVariant.update({
        where: { id: v.id },
        data: { advice: advice as Prisma.InputJsonValue }
      });
    }
  });

  return { media_state: mediaState, synced: true };
}

/**
 * Complete a bounded non-publish task (upkeep / active rest).
 * Marks PostBot task done; never calls distribution handoff or publishes.
 * Multi-destination: slot becomes published only when all sibling tasks are done.
 */
export async function completeBoundedGoalCycleTask(
  prisma: PrismaClient,
  args: { creatorId: string; taskId: string }
): Promise<{
  task_id: string;
  task_kind: GoalCycleTaskKind;
  status: "done";
  slot_status: string | null;
}> {
  const creatorId = args.creatorId.trim();
  const taskId = args.taskId.trim();
  const task = await prisma.postbotTask.findFirst({
    where: { id: taskId, creatorId }
  });
  if (!task) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_NOT_FOUND",
      `Postbot task not found: ${taskId}`,
      [{ field: "task_id", issue: "not_found" }]
    );
  }

  const kind = await resolveTaskKindForTask(prisma, task);
  if (kind === "publish") {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Publish tasks require creator-confirmed distribution handoff — use Done only for upkeep/active rest.",
      [{ field: "task_kind", issue: "publish_requires_handoff" }]
    );
  }

  if (task.status === "done") {
    const slotStatus = await recomputeGoalCycleSlotFromTasks(prisma, {
      creatorId,
      postId: task.postId,
      campaignKey: task.goalCycleCampaignKey,
      planId: task.planId
    });
    return { task_id: task.id, task_kind: kind, status: "done", slot_status: slotStatus };
  }
  if (task.status !== "pending") {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Only pending tasks can be completed.",
      [{ field: "task_id", issue: "not_pending" }]
    );
  }

  await prisma.postbotTask.update({
    where: { id: task.id },
    data: { status: "done", reminderSentAt: new Date() }
  });

  const slotStatus = await recomputeGoalCycleSlotFromTasks(prisma, {
    creatorId,
    postId: task.postId,
    campaignKey: task.goalCycleCampaignKey,
    planId: task.planId
  });

  return { task_id: task.id, task_kind: kind, status: "done", slot_status: slotStatus };
}

export type DestinationCompletionStatus = "posted" | "failed" | "abandoned";

export type SyncDestinationCompletionResult = {
  synced: boolean;
  idempotent: boolean;
  task_id: string | null;
  slot_status: string | null;
  plan_status: string | null;
};

/**
 * After distribution attempt complete: sync PostBot task + Goal Cycle slot/plan.
 * Partial success: only this destination's task completes; siblings stay pending.
 * Does not flip Post.publishState (VS7 unpublished boundary remains until product gate).
 */
export async function syncGoalCycleDestinationCompletion(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    attemptId: string;
    finalStatus: DestinationCompletionStatus;
  }
): Promise<SyncDestinationCompletionResult> {
  const creatorId = args.creatorId.trim();
  const attempt = await prisma.postDistributionAttempt.findFirst({
    where: { id: args.attemptId.trim(), creatorId },
    select: {
      id: true,
      status: true,
      variantId: true,
      postId: true,
      destination: true,
      completedAt: true
    }
  });
  if (!attempt) {
    return { synced: false, idempotent: false, task_id: null, slot_status: null, plan_status: null };
  }

  const variant = await prisma.postDistributionVariant.findFirst({
    where: { id: attempt.variantId, creatorId },
    select: {
      id: true,
      status: true,
      planId: true,
      postId: true,
      goalCycleCampaignKey: true
    }
  });
  if (!variant) {
    return { synced: false, idempotent: false, task_id: null, slot_status: null, plan_status: null };
  }

  const task = await prisma.postbotTask.findFirst({
    where: { variantId: variant.id, creatorId },
    select: {
      id: true,
      status: true,
      planId: true,
      postId: true,
      goalCycleCampaignKey: true
    }
  });

  const campaignKey =
    variant.goalCycleCampaignKey?.trim() || task?.goalCycleCampaignKey?.trim() || null;

  // Idempotent happy path: already posted + task done.
  if (
    args.finalStatus === "posted" &&
    attempt.status === "posted" &&
    variant.status === "posted" &&
    task?.status === "done"
  ) {
    const slotStatus = campaignKey
      ? await recomputeGoalCycleSlotFromVariants(prisma, {
          creatorId,
          postId: variant.postId,
          campaignKey,
          planId: variant.planId
        })
      : null;
    return {
      synced: Boolean(campaignKey),
      idempotent: true,
      task_id: task.id,
      slot_status: slotStatus,
      plan_status: null
    };
  }

  if (args.finalStatus === "posted") {
    if (task && task.status !== "done") {
      await prisma.postbotTask.update({
        where: { id: task.id },
        data: { status: "done", reminderSentAt: new Date() }
      });
    }
  } else {
    // Failed / abandoned: leave task pending for retry; mark variant failed.
    if (variant.status !== "posted") {
      await prisma.postDistributionVariant.update({
        where: { id: variant.id },
        data: { status: "failed" }
      });
    }
  }

  let slotStatus: string | null = null;
  let planStatus: string | null = null;

  if (campaignKey) {
    slotStatus = await recomputeGoalCycleSlotFromVariants(prisma, {
      creatorId,
      postId: variant.postId,
      campaignKey,
      planId: variant.planId
    });
  }

  if (variant.planId) {
    planStatus = await recomputePlanStatus(prisma, {
      creatorId,
      planId: variant.planId
    });
  }

  return {
    synced: Boolean(campaignKey) || Boolean(task),
    idempotent: false,
    task_id: task?.id ?? null,
    slot_status: slotStatus,
    plan_status: planStatus
  };
}

/** Pure helper — slot terminal states from sibling variant statuses. */
export function deriveSlotStatusFromVariantStatuses(
  statuses: string[]
): "materialized" | "media_ready" | "published" | "failed" {
  if (statuses.length === 0) return "materialized";
  const allPosted = statuses.every((s) => s === "posted" || s === "skipped");
  if (allPosted) return "published";
  const anyPosted = statuses.some((s) => s === "posted");
  const allFailed = statuses.every((s) => s === "failed" || s === "fill_failed" || s === "skipped");
  if (allFailed && !anyPosted) return "failed";
  return "media_ready";
}

/** Pure helper — bounded tasks: published only when all done. */
export function deriveSlotStatusFromTaskStatuses(
  statuses: string[]
): "materialized" | "published" {
  if (statuses.length === 0) return "materialized";
  if (statuses.every((s) => s === "done" || s === "dismissed")) return "published";
  return "materialized";
}

async function recomputeGoalCycleSlotFromVariants(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    postId: string;
    campaignKey: string;
    planId: string | null;
  }
): Promise<string | null> {
  const cycleId = parseGoalCycleIdFromCampaignKey(args.campaignKey);
  if (!cycleId) return null;

  const slot = await prisma.creatorGoalCycleSlot.findFirst({
    where: {
      cycleId,
      OR: [
        { downstreamPostId: args.postId },
        { goalCycleCampaignKey: args.campaignKey },
        ...(args.planId ? [{ downstreamPlanId: args.planId }] : [])
      ]
    },
    orderBy: { rank: "asc" },
    select: { id: true, mediaState: true }
  });
  if (!slot) return null;

  const variants = await prisma.postDistributionVariant.findMany({
    where: {
      creatorId: args.creatorId,
      OR: [
        { postId: args.postId, goalCycleCampaignKey: args.campaignKey },
        ...(args.planId ? [{ planId: args.planId }] : [])
      ]
    },
    select: { status: true }
  });

  let next = deriveSlotStatusFromVariantStatuses(variants.map((v) => v.status));
  if (next === "media_ready" && slot.mediaState === "missing") {
    next = "materialized";
  }

  await prisma.creatorGoalCycleSlot.update({
    where: { id: slot.id },
    data: { status: next }
  });
  return next;
}

async function recomputeGoalCycleSlotFromTasks(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    postId: string;
    campaignKey: string | null;
    planId: string | null;
  }
): Promise<string | null> {
  const campaignKey = args.campaignKey?.trim() || null;
  if (!campaignKey) return null;
  const cycleId = parseGoalCycleIdFromCampaignKey(campaignKey);
  if (!cycleId) return null;

  const slot = await prisma.creatorGoalCycleSlot.findFirst({
    where: {
      cycleId,
      OR: [
        { downstreamPostId: args.postId },
        { goalCycleCampaignKey: campaignKey },
        ...(args.planId ? [{ downstreamPlanId: args.planId }] : [])
      ]
    },
    orderBy: { rank: "asc" },
    select: { id: true, downstreamTaskIds: true }
  });
  if (!slot) return null;

  const taskIds = Array.isArray(slot.downstreamTaskIds)
    ? (slot.downstreamTaskIds as unknown[]).map(String).filter(Boolean)
    : [];

  const tasks =
    taskIds.length > 0
      ? await prisma.postbotTask.findMany({
          where: { id: { in: taskIds }, creatorId: args.creatorId },
          select: { status: true }
        })
      : await prisma.postbotTask.findMany({
          where: {
            creatorId: args.creatorId,
            postId: args.postId,
            goalCycleCampaignKey: campaignKey
          },
          select: { status: true }
        });

  const next = deriveSlotStatusFromTaskStatuses(tasks.map((t) => t.status));
  await prisma.creatorGoalCycleSlot.update({
    where: { id: slot.id },
    data: { status: next }
  });

  if (args.planId && next === "published") {
    await recomputePlanStatus(prisma, { creatorId: args.creatorId, planId: args.planId });
  }

  return next;
}

async function recomputePlanStatus(
  prisma: PrismaClient,
  args: { creatorId: string; planId: string }
): Promise<string | null> {
  const variants = await prisma.postDistributionVariant.findMany({
    where: { planId: args.planId, creatorId: args.creatorId },
    select: { status: true }
  });
  if (variants.length === 0) return null;

  const terminal = new Set(["posted", "failed", "skipped", "fill_failed"]);
  const allTerminal = variants.every((v) => terminal.has(v.status));
  const allPosted = variants.every((v) => v.status === "posted" || v.status === "skipped");

  if (!allTerminal && !allPosted) return null;

  const nextStatus = allPosted ? "completed" : "active";
  if (allPosted) {
    await prisma.postDistributionPlan.update({
      where: { id: args.planId },
      data: { status: "completed" }
    });
    return "completed";
  }
  return nextStatus;
}

async function resolveTaskKindForTask(
  prisma: PrismaClient,
  task: { goalCycleCampaignKey: string | null; action: string; postId: string }
): Promise<GoalCycleTaskKind> {
  const campaignKey = task.goalCycleCampaignKey?.trim() || null;
  if (!campaignKey) {
    return task.action === "post" ? "publish" : "social_upkeep";
  }
  const cycleId = parseGoalCycleIdFromCampaignKey(campaignKey);
  if (!cycleId) return "publish";

  const cycle = await prisma.creatorGoalCycle.findFirst({
    where: { id: cycleId },
    select: { breakMode: true }
  });
  const slot = await prisma.creatorGoalCycleSlot.findFirst({
    where: {
      cycleId,
      OR: [{ downstreamPostId: task.postId }, { goalCycleCampaignKey: campaignKey }]
    },
    orderBy: { rank: "asc" },
    select: { format: true, intent: true }
  });

  return resolveGoalCycleTaskKindFromSlot({
    breakMode: cycle?.breakMode,
    format: slot?.format,
    intent: slot?.intent
  });
}

export function upkeepActionForFormat(
  format: string
): "repost" | "pin_comment" {
  if (format === "upkeep_pin") return "pin_comment";
  return "repost";
}
