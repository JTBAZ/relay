/**
 * Goal Cycle execution-phase repair (VS8-T06).
 * Replays projection sync from attempt/variant/task truth — never creates posts/tasks.
 */

import type { PrismaClient } from "@prisma/client";
import { GoalCycleContractError } from "../contracts.js";
import { findGoalCycleForCreator } from "../goal-cycle-store.js";
import { parseGoalCycleIdFromCampaignKey } from "./goal-cycle-due-packet.js";
import {
  deriveSlotStatusFromTaskStatuses,
  deriveSlotStatusFromVariantStatuses,
  syncGoalCycleDestinationCompletion
} from "./goal-cycle-execution-service.js";

export type ExecutionRepairStatus =
  | "healthy"
  | "stale_projections"
  | "missing_linkage"
  | "unrepairable";

export type ExecutionSlotObservation = {
  slot_key: string;
  slot_status: string;
  variant_states: Record<string, string>;
  task_states: Record<string, string>;
  issues: string[];
};

export type ExecutionRepairReport = {
  cycle_id: string;
  status: ExecutionRepairStatus;
  slots_observed: ExecutionSlotObservation[];
  repaired: boolean;
  can_safely_repair: boolean;
  message: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((s) => s.trim().length > 0);
}

/**
 * Diagnose (and optionally repair) stale Goal Cycle execution projections.
 */
export async function diagnoseOrRepairExecutionProjections(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    cycleId: string;
    slotKey?: string | null;
    repair?: boolean;
  }
): Promise<ExecutionRepairReport> {
  const creatorId = args.creatorId.trim();
  const cycleId = args.cycleId.trim();
  const slotKey = args.slotKey?.trim() || null;

  const row = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }

  const slots = await prisma.creatorGoalCycleSlot.findMany({
    where: {
      cycleId,
      ...(slotKey ? { slotKey } : {})
    },
    orderBy: { rank: "asc" }
  });

  const observations: ExecutionSlotObservation[] = [];
  let stale = false;
  let missingLinkage = false;
  const repairActions: Array<() => Promise<void>> = [];

  for (const slot of slots) {
    const issues: string[] = [];
    const variantIds = asStringArray(slot.downstreamVariantIds);
    const taskIds = asStringArray(slot.downstreamTaskIds);
    const campaignKey =
      slot.goalCycleCampaignKey?.trim() ||
      (slot.cycleId ? `gc_camp_${slot.cycleId}` : null);

    const variants =
      variantIds.length > 0
        ? await prisma.postDistributionVariant.findMany({
            where: { id: { in: variantIds }, creatorId },
            select: { id: true, destination: true, status: true, planId: true }
          })
        : slot.downstreamPlanId
          ? await prisma.postDistributionVariant.findMany({
              where: { planId: slot.downstreamPlanId, creatorId },
              select: { id: true, destination: true, status: true, planId: true }
            })
          : [];

    const tasks =
      taskIds.length > 0
        ? await prisma.postbotTask.findMany({
            where: { id: { in: taskIds }, creatorId },
            select: {
              id: true,
              destination: true,
              status: true,
              variantId: true
            }
          })
        : campaignKey
          ? await prisma.postbotTask.findMany({
              where: {
                creatorId,
                goalCycleCampaignKey: campaignKey,
                ...(slot.downstreamPostId ? { postId: slot.downstreamPostId } : {})
              },
              select: {
                id: true,
                destination: true,
                status: true,
                variantId: true
              }
            })
          : [];

    if (variantIds.length > 0 && variants.length < variantIds.length) {
      issues.push("missing_variant_rows");
      missingLinkage = true;
    }
    if (taskIds.length > 0 && tasks.length < taskIds.length) {
      issues.push("missing_task_rows");
      missingLinkage = true;
    }

    const variantStates: Record<string, string> = {};
    for (const v of variants) {
      variantStates[v.destination] = v.status;
    }
    const taskStates: Record<string, string> = {};
    for (const t of tasks) {
      taskStates[t.destination] = t.status;
    }

    // Stale: attempt posted but task still pending.
    for (const v of variants) {
      const latestAttempt = await prisma.postDistributionAttempt.findFirst({
        where: { variantId: v.id, creatorId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true }
      });
      const linkedTask = tasks.find((t) => t.variantId === v.id);
      if (latestAttempt?.status === "posted" && linkedTask && linkedTask.status !== "done") {
        issues.push(`attempt_posted_task_pending:${v.destination}`);
        stale = true;
        const attemptId = latestAttempt.id;
        repairActions.push(async () => {
          await syncGoalCycleDestinationCompletion(prisma, {
            creatorId,
            attemptId,
            finalStatus: "posted"
          });
        });
      }
      if (v.status === "posted" && linkedTask && linkedTask.status !== "done") {
        if (!issues.some((i) => i.startsWith(`attempt_posted_task_pending:${v.destination}`))) {
          issues.push(`variant_posted_task_pending:${v.destination}`);
          stale = true;
          const taskId = linkedTask.id;
          repairActions.push(async () => {
            await prisma.postbotTask.update({
              where: { id: taskId },
              data: { status: "done", reminderSentAt: new Date() }
            });
          });
        }
      }
    }

    const expectedFromVariants =
      variants.length > 0
        ? deriveSlotStatusFromVariantStatuses(variants.map((v) => v.status))
        : null;
    const expectedFromTasks =
      tasks.length > 0 && variants.every((v) => v.status === "draft")
        ? deriveSlotStatusFromTaskStatuses(tasks.map((t) => t.status))
        : null;

    const expected = expectedFromVariants ?? expectedFromTasks;
    if (expected && expected !== slot.status) {
      issues.push(`slot_status_stale:expected_${expected}_got_${slot.status}`);
      stale = true;
      const slotId = slot.id;
      const nextStatus = expected;
      repairActions.push(async () => {
        await prisma.creatorGoalCycleSlot.update({
          where: { id: slotId },
          data: { status: nextStatus }
        });
      });
    }

    observations.push({
      slot_key: slot.slotKey,
      slot_status: slot.status,
      variant_states: variantStates,
      task_states: taskStates,
      issues
    });
  }

  let status: ExecutionRepairStatus = "healthy";
  if (missingLinkage && !stale) status = "missing_linkage";
  else if (stale) status = "stale_projections";
  else if (missingLinkage) status = "missing_linkage";

  // Missing linkage without enough truth to rebuild → unrepairable for auto repair.
  const canSafelyRepair =
    status === "stale_projections" &&
    observations.every((o) => !o.issues.includes("missing_variant_rows"));

  let repaired = false;
  if (args.repair && canSafelyRepair && repairActions.length > 0) {
    for (const action of repairActions) {
      await action();
    }
    // Re-aggregate slots after task fixes.
    for (const slot of slots) {
      const campaignKey =
        slot.goalCycleCampaignKey?.trim() || `gc_camp_${cycleId}`;
      const variants = await prisma.postDistributionVariant.findMany({
        where: {
          creatorId,
          OR: [
            ...(slot.downstreamPlanId ? [{ planId: slot.downstreamPlanId }] : []),
            ...(slot.downstreamPostId
              ? [{ postId: slot.downstreamPostId, goalCycleCampaignKey: campaignKey }]
              : [])
          ]
        },
        select: { status: true }
      });
      if (variants.length > 0) {
        const next = deriveSlotStatusFromVariantStatuses(variants.map((v) => v.status));
        await prisma.creatorGoalCycleSlot.update({
          where: { id: slot.id },
          data: { status: next }
        });
      }
    }
    repaired = true;
    status = "healthy";
  }

  if (status === "missing_linkage" && !canSafelyRepair) {
    // Keep missing_linkage; if also unfixable graph, escalate label.
    const hardMissing = observations.some(
      (o) =>
        o.issues.includes("missing_variant_rows") || o.issues.includes("missing_task_rows")
    );
    if (hardMissing && !stale) {
      /* stay missing_linkage */
    }
  }

  const message =
    status === "healthy"
      ? repaired
        ? "Stale projections repaired from attempt/variant/task truth."
        : "Execution projections look consistent."
      : status === "stale_projections"
        ? canSafelyRepair
          ? "Stale projections detected. POST with repair=true to replay sync."
          : "Stale projections detected but auto-repair is blocked."
        : status === "missing_linkage"
          ? "Missing variant/task linkage — inspect manually; do not rematerialize."
          : "Execution graph needs manual inspection.";

  return {
    cycle_id: cycleId,
    status: repaired ? "healthy" : status,
    slots_observed: observations,
    repaired,
    can_safely_repair: canSafelyRepair,
    message
  };
}

/** Exported for tests — campaign key helper. */
export function expectedCampaignKeyForCycle(cycleId: string): string {
  return `gc_camp_${cycleId}`;
}

export function parseCycleIdFromCampaign(campaignKey: string | null | undefined): string | null {
  return parseGoalCycleIdFromCampaignKey(campaignKey);
}
