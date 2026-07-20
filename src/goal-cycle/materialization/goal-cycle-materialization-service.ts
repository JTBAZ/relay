/**
 * Goal Cycle approval materialization (VS7-T02).
 * One transaction: lock cycle, create unpublished graph, consume credit, persist receipt.
 */

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { DistributionDestination } from "../../distribution/platform-destinations.js";
import { DISTRIBUTION_DESTINATIONS } from "../../distribution/platform-destinations.js";
import {
  createRelayPostTransaction,
  RelayCreatePostError
} from "../../relay/create-relay-post.js";
import {
  CoachPlanCreditError,
  consumeCoachPlanCreditReservationInTx,
  shouldReserveCoachPlanCredit
} from "../../usage/coach-plan-credit-service.js";
import { ensureCreditWallet } from "../../usage/coach-plan-credit-store.js";
import {
  GoalCycleContractError,
  GOAL_CYCLE_MAX_SLOTS,
  type GoalCycleMaterializationReceipt,
  type GoalCycleMaterializationSlotReceipt,
  type GoalCyclePlan,
  type GoalCyclePlanSlot,
  getGoalCycleFeatureFlags
} from "../contracts.js";
import {
  findGoalCycleForCreator,
  type GoalCycleTx
} from "../goal-cycle-store.js";
import {
  findMaterializationReceipt,
  insertMaterializationReceipt,
  upsertGoalCycleSlotMaterialized
} from "./goal-cycle-materialization-store.js";
import {
  classifyGoalCycleMaterializationMode,
  isActiveRestSlotFormat,
  upkeepActionForFormat
} from "../execution/goal-cycle-execution-service.js";
import { buildGoalCycleInstructions } from "../execution/goal-cycle-due-packet.js";

export type ApproveAndMaterializeInput = {
  creatorId: string;
  cycleId: string;
  expectedVersion: number;
  approvalKey: string;
};

function isDistributionDestination(value: string): value is DistributionDestination {
  return (DISTRIBUTION_DESTINATIONS as readonly string[]).includes(value);
}

export function assertLinkedDestinations(
  plan: GoalCyclePlan,
  slots: GoalCyclePlanSlot[]
): void {
  const linked = new Set(
    (plan.logistics.linked_destination_ids ?? []).map((d) => d.trim().toLowerCase())
  );
  for (const slot of slots) {
    for (const raw of slot.destination_ids) {
      const id = raw.trim().toLowerCase();
      if (!linked.has(id) || !isDistributionDestination(id)) {
        throw new GoalCycleContractError(
          "GOAL_CYCLE_DESTINATION_UNLINKED",
          `Destination ${raw} is not linked for this Plan.`,
          [{ field: "destination_ids", issue: raw }]
        );
      }
    }
  }
}

/** Complete silence: zero-slot receipt (no invented tasks/posts). */
export function buildSilenceReceipt(
  cycleId: string,
  approvalKey: string,
  materializedAt: Date
): GoalCycleMaterializationReceipt {
  return {
    cycle_id: cycleId,
    approval_key: approvalKey,
    status: "materialized",
    materialized_at: materializedAt.toISOString(),
    slots: []
  };
}

async function loadLatestPlan(
  tx: GoalCycleTx,
  cycleId: string
): Promise<GoalCyclePlan | null> {
  const revision = await tx.creatorGoalCycleRevision.findFirst({
    where: { cycleId },
    orderBy: { ordinal: "desc" }
  });
  if (!revision?.planJson || typeof revision.planJson !== "object" || Array.isArray(revision.planJson)) {
    return null;
  }
  return revision.planJson as GoalCyclePlan;
}

async function resolveUpkeepAnchorPostId(
  tx: GoalCycleTx,
  creatorId: string,
  evidenceRefs: string[]
): Promise<string> {
  for (const ref of evidenceRefs) {
    const raw = String(ref ?? "").trim();
    if (!raw) continue;
    const candidate = raw.replace(/^post:/i, "").trim();
    if (!candidate) continue;
    const hit = await tx.post.findFirst({
      where: { id: candidate, creatorId },
      select: { id: true }
    });
    if (hit) return hit.id;
  }
  const latest = await tx.post.findFirst({
    where: { creatorId },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
  if (latest) return latest.id;
  throw new GoalCycleContractError(
    "GOAL_CYCLE_MATERIALIZATION_FAILED",
    "Social upkeep requires an existing post to engage with.",
    [{ field: "slots", issue: "no_anchor_post" }]
  );
}

/**
 * Social upkeep: link an existing post — no new Relay draft, no media gate.
 */
async function materializeUpkeepSlot(
  tx: GoalCycleTx,
  args: {
    creatorId: string;
    cycleId: string;
    slot: GoalCyclePlanSlot;
    rank: number;
    campaignKey: string;
  }
): Promise<GoalCycleMaterializationSlotReceipt> {
  const destinations = args.slot.destination_ids
    .map((d) => d.trim().toLowerCase())
    .filter(isDistributionDestination);
  if (destinations.length === 0) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_DESTINATION_UNLINKED",
      "Slot has no linked destinations.",
      [{ field: `slots[${args.rank}].destination_ids`, issue: "empty" }]
    );
  }

  const postId = await resolveUpkeepAnchorPostId(
    tx,
    args.creatorId,
    args.slot.evidence_refs ?? []
  );
  const scheduledFor = args.slot.scheduled_utc
    ? new Date(args.slot.scheduled_utc)
    : new Date();
  if (Number.isNaN(scheduledFor.getTime())) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Invalid scheduled_utc on Plan slot.",
      [{ field: `slots[${args.rank}].scheduled_utc`, issue: "invalid" }]
    );
  }

  const action = upkeepActionForFormat(args.slot.format);
  const instructions = buildGoalCycleInstructions({
    taskKind: "social_upkeep",
    mediaReady: true,
    destinationLabel: destinations[0] ?? "destination"
  });

  const plan = await tx.postDistributionPlan.create({
    data: {
      creatorId: args.creatorId,
      postId,
      status: "active",
      assistantMode: "none",
      assistantContext: {
        goal_cycle_id: args.cycleId,
        slot_id: args.slot.id,
        mode: "upkeep_task"
      },
      assistantPlan: {
        source: "goal_cycle_materialization",
        goal_cycle_id: args.cycleId,
        slot_id: args.slot.id,
        mode: "upkeep_task",
        instructions
      },
      goalCycleCampaignKey: args.campaignKey
    }
  });

  const variantIds: string[] = [];
  const taskIds: string[] = [];
  for (const destination of destinations) {
    const variant = await tx.postDistributionVariant.create({
      data: {
        planId: plan.id,
        postId,
        creatorId: args.creatorId,
        destination,
        status: "draft",
        assistantEnabled: false,
        title: args.slot.title || null,
        bodyText: args.slot.draft_body || null,
        postText: args.slot.draft_body || null,
        scheduledFor,
        remindMe: true,
        advice: { media_state: "not_required", task_kind: "social_upkeep" },
        goalCycleCampaignKey: args.campaignKey
      }
    });
    variantIds.push(variant.id);
    const task = await tx.postbotTask.create({
      data: {
        creatorId: args.creatorId,
        postId,
        planId: plan.id,
        variantId: variant.id,
        destination,
        action,
        rationale: args.slot.draft_body || instructions,
        suggestedTime: scheduledFor,
        remindMe: true,
        status: "pending",
        goalCycleCampaignKey: args.campaignKey
      }
    });
    taskIds.push(task.id);
  }

  await upsertGoalCycleSlotMaterialized(tx, {
    cycleId: args.cycleId,
    slotKey: args.slot.id,
    rank: args.rank,
    intent: args.slot.intent,
    format: args.slot.format,
    title: args.slot.title,
    draftBody: args.slot.draft_body,
    destinationIds: destinations,
    scheduledLocal: args.slot.scheduled_local,
    scheduledUtc: scheduledFor,
    mediaState: "not_required",
    postId,
    planId: plan.id,
    variantIds,
    taskIds,
    campaignKey: args.campaignKey
  });

  return {
    slot_id: args.slot.id,
    post_id: postId,
    distribution_plan_id: plan.id,
    variant_ids: variantIds,
    task_ids: taskIds,
    rail_event_ids: [...taskIds],
    mode: "upkeep_task"
  };
}

async function materializeNewPostSlot(
  prisma: PrismaClient,
  tx: GoalCycleTx,
  args: {
    creatorId: string;
    cycleId: string;
    slot: GoalCyclePlanSlot;
    rank: number;
    campaignKey: string;
    timeZone: string;
  }
): Promise<GoalCycleMaterializationSlotReceipt> {
  const destinations = args.slot.destination_ids
    .map((d) => d.trim().toLowerCase())
    .filter(isDistributionDestination);
  if (destinations.length === 0) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_DESTINATION_UNLINKED",
      "Slot has no linked destinations.",
      [{ field: `slots[${args.rank}].destination_ids`, issue: "empty" }]
    );
  }

  const isActiveRest =
    args.slot.intent === "active_rest" || isActiveRestSlotFormat(args.slot.format);
  const taskAction = isActiveRest ? ("schedule" as const) : ("post" as const);
  const mediaState = isActiveRest ? "not_required" : args.slot.media_state;

  const postId = `relay_p_${randomUUID()}`;
  const created = await createRelayPostTransaction(
    prisma,
    postId,
    {
      creatorId: args.creatorId,
      campaignId: null,
      title: (args.slot.title || args.slot.intent || "Planned post").slice(0, 200),
      description: args.slot.draft_body || null,
      isPublic: true,
      requiredTierId: null,
      tierIds: [],
      tagIds: [],
      mediaIds: [],
      publish: false,
      publishedAtInput: null
    },
    { tx }
  );

  const scheduledFor = args.slot.scheduled_utc
    ? new Date(args.slot.scheduled_utc)
    : new Date();
  if (Number.isNaN(scheduledFor.getTime())) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Invalid scheduled_utc on Plan slot.",
      [{ field: `slots[${args.rank}].scheduled_utc`, issue: "invalid" }]
    );
  }

  const plan = await tx.postDistributionPlan.create({
    data: {
      creatorId: args.creatorId,
      postId: created.post.id,
      status: "active",
      assistantMode: "none",
      assistantContext: {
        goal_cycle_id: args.cycleId,
        slot_id: args.slot.id,
        ...(isActiveRest ? { mode: "active_rest" } : {})
      },
      assistantPlan: {
        source: "goal_cycle_materialization",
        goal_cycle_id: args.cycleId,
        slot_id: args.slot.id,
        ...(isActiveRest ? { mode: "active_rest" } : {})
      },
      goalCycleCampaignKey: args.campaignKey
    }
  });

  const variantIds: string[] = [];
  const taskIds: string[] = [];
  for (const destination of destinations) {
    const variant = await tx.postDistributionVariant.create({
      data: {
        planId: plan.id,
        postId: created.post.id,
        creatorId: args.creatorId,
        destination,
        status: "draft",
        assistantEnabled: false,
        title: args.slot.title || null,
        bodyText: args.slot.draft_body || null,
        postText: args.slot.draft_body || null,
        scheduledFor,
        remindMe: true,
        advice: {
          media_state: mediaState,
          ...(isActiveRest ? { task_kind: "active_rest" } : {})
        },
        goalCycleCampaignKey: args.campaignKey
      }
    });
    variantIds.push(variant.id);
    const task = await tx.postbotTask.create({
      data: {
        creatorId: args.creatorId,
        postId: created.post.id,
        planId: plan.id,
        variantId: variant.id,
        destination,
        action: taskAction,
        rationale: isActiveRest
          ? buildGoalCycleInstructions({
              taskKind: "active_rest",
              mediaReady: true,
              destinationLabel: destination
            })
          : `Goal Cycle slot ${args.slot.id}`,
        suggestedTime: scheduledFor,
        remindMe: true,
        status: "pending",
        goalCycleCampaignKey: args.campaignKey
      }
    });
    taskIds.push(task.id);
  }

  await upsertGoalCycleSlotMaterialized(tx, {
    cycleId: args.cycleId,
    slotKey: args.slot.id,
    rank: args.rank,
    intent: args.slot.intent,
    format: args.slot.format,
    title: args.slot.title,
    draftBody: args.slot.draft_body,
    destinationIds: destinations,
    scheduledLocal: args.slot.scheduled_local,
    scheduledUtc: scheduledFor,
    mediaState,
    postId: created.post.id,
    planId: plan.id,
    variantIds,
    taskIds,
    campaignKey: args.campaignKey
  });

  return {
    slot_id: args.slot.id,
    post_id: created.post.id,
    distribution_plan_id: plan.id,
    variant_ids: variantIds,
    task_ids: taskIds,
    // Rail currently keys events by PostBot task id.
    rail_event_ids: [...taskIds],
    mode: "new_post"
  };
}

async function materializePlanSlot(
  prisma: PrismaClient,
  tx: GoalCycleTx,
  args: {
    creatorId: string;
    cycleId: string;
    slot: GoalCyclePlanSlot;
    rank: number;
    campaignKey: string;
    timeZone: string;
    breakMode: string | null;
  }
): Promise<GoalCycleMaterializationSlotReceipt> {
  const mode = classifyGoalCycleMaterializationMode({
    format: args.slot.format,
    intent: args.slot.intent,
    breakMode: args.breakMode
  });
  if (mode === "upkeep_task") {
    return materializeUpkeepSlot(tx, {
      creatorId: args.creatorId,
      cycleId: args.cycleId,
      slot: args.slot,
      rank: args.rank,
      campaignKey: args.campaignKey
    });
  }
  return materializeNewPostSlot(prisma, tx, {
    creatorId: args.creatorId,
    cycleId: args.cycleId,
    slot: args.slot,
    rank: args.rank,
    campaignKey: args.campaignKey,
    timeZone: args.timeZone
  });
}
/**
 * Approve and materialize a Goal Cycle Plan.
 * Idempotent on (cycleId, approvalKey). Version conflicts throw GOAL_CYCLE_VERSION_CONFLICT.
 */
export async function approveAndMaterialize(
  prisma: PrismaClient,
  input: ApproveAndMaterializeInput
): Promise<{ receipt: GoalCycleMaterializationReceipt; idempotent: boolean }> {
  const flags = getGoalCycleFeatureFlags();
  if (!flags.enabled || !flags.materialization_enabled) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_MATERIALIZATION_FAILED",
      "Goal Cycle materialization is disabled.",
      [{ field: "feature", issue: "materialization_disabled" }]
    );
  }

  const creatorId = input.creatorId.trim();
  const cycleId = input.cycleId.trim();
  const approvalKey = input.approvalKey.trim();
  if (!approvalKey) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "approval_key is required.",
      [{ field: "approval_key", issue: "required" }]
    );
  }

  const existing = await findMaterializationReceipt(prisma, cycleId, approvalKey);
  if (existing) {
    return { receipt: existing, idempotent: true };
  }

  const now = new Date();

  try {
    const receipt = await prisma.$transaction(
      async (tx) => {
        // Lock cycle row for the materialization transaction boundary.
        await tx.$queryRawUnsafe(
          `SELECT id FROM creator_goal_cycles WHERE id = $1 AND creator_id = $2 FOR UPDATE`,
          cycleId,
          creatorId
        );

        const row = await findGoalCycleForCreator(tx, creatorId, cycleId);
        if (!row) {
          throw new GoalCycleContractError(
            "GOAL_CYCLE_NOT_FOUND",
            "Goal Cycle not found.",
            [{ field: "cycle_id", issue: "not_found" }]
          );
        }

        const already = await findMaterializationReceipt(tx, cycleId, approvalKey);
        if (already) return already;

        if (row.version !== input.expectedVersion) {
          throw new GoalCycleContractError(
            "GOAL_CYCLE_VERSION_CONFLICT",
            "Goal Cycle version conflict.",
            [
              { field: "expected_version", issue: String(input.expectedVersion) },
              { field: "current_version", issue: String(row.version) }
            ]
          );
        }

        const allowedStates = new Set(["review", "approved", "materializing"]);
        if (!allowedStates.has(row.state)) {
          throw new GoalCycleContractError(
            "GOAL_CYCLE_INVALID_STATE",
            `Cannot materialize from state ${row.state}.`,
            [{ field: "state", issue: row.state }]
          );
        }

        const silence =
          row.goalKind === "break" && row.breakMode === "complete_silence";
        const needsCredit = shouldReserveCoachPlanCredit({
          goal_kind: row.goalKind,
          break_mode: row.breakMode
        });

        if (needsCredit) {
          await ensureCreditWallet(tx, creatorId);
          await tx.$queryRawUnsafe(
            `SELECT creator_id FROM coach_plan_credit_wallets WHERE creator_id = $1 FOR UPDATE`,
            creatorId
          );
        }

        // Validate plan/destinations before mutating cycle state (tx still rolls back on throw).
        if (silence) {
          if (row.reservationRef) {
            throw new GoalCycleContractError(
              "GOAL_CYCLE_INVALID_STATE",
              "Complete silence must not hold a Coach Plan reservation.",
              [{ field: "reservation_ref", issue: "unexpected" }]
            );
          }
          const silencePlan = await loadLatestPlan(tx, cycleId);
          if (silencePlan && silencePlan.slots.length > 0) {
            throw new GoalCycleContractError(
              "GOAL_CYCLE_PLAN_INVALID",
              "Complete silence Plans must have zero slots.",
              [{ field: "slots", issue: "must_be_empty" }]
            );
          }
        }

        const plan = silence ? null : await loadLatestPlan(tx, cycleId);
        if (!silence) {
          if (!plan) {
            throw new GoalCycleContractError(
              "GOAL_CYCLE_PLAN_INVALID",
              "No Plan to materialize.",
              [{ field: "plan", issue: "missing" }]
            );
          }
          const slots = plan.slots.slice(0, GOAL_CYCLE_MAX_SLOTS);
          assertLinkedDestinations(plan, slots);
        }

        await tx.creatorGoalCycle.update({
          where: { id: cycleId },
          data: {
            state: "materializing",
            phase: "approval",
            approvedAt: row.approvedAt ?? now,
            version: { increment: 1 }
          }
        });

        if (silence) {
          const silenceReceipt = buildSilenceReceipt(cycleId, approvalKey, now);
          const ctx =
            row.contextJson && typeof row.contextJson === "object" && !Array.isArray(row.contextJson)
              ? { ...(row.contextJson as Record<string, unknown>) }
              : {};
          const suppressUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          ctx.reminder_suppression_until = suppressUntil.toISOString();
          ctx.silence_receipt = true;

          await insertMaterializationReceipt(tx, {
            cycleId,
            approvalKey,
            receipt: silenceReceipt,
            materializedAt: now
          });
          await tx.creatorGoalCycle.update({
            where: { id: cycleId },
            data: {
              state: "active",
              phase: "active",
              materializedAt: now,
              contextJson: ctx as Prisma.InputJsonValue,
              version: { increment: 1 }
            }
          });
          return silenceReceipt;
        }

        const slots = plan!.slots.slice(0, GOAL_CYCLE_MAX_SLOTS);
        const campaignKey = `gc_camp_${cycleId}`;
        const slotReceipts: GoalCycleMaterializationSlotReceipt[] = [];

        if (slots.length === 0 && row.breakMode === "social_upkeep") {
          // Zero new-post upkeep: receipt records empty graph (no invented tasks).
        } else {
          for (let i = 0; i < slots.length; i += 1) {
            const slot = slots[i]!;
            const receiptSlot = await materializePlanSlot(prisma, tx, {
              creatorId,
              cycleId,
              slot,
              rank: i,
              campaignKey,
              timeZone: row.timeZone,
              breakMode: row.breakMode
            });
            slotReceipts.push(receiptSlot);
          }
        }

        if (needsCredit) {
          await consumeCoachPlanCreditReservationInTx(tx, {
            creatorId,
            cycleId,
            approvalKey,
            now
          });
        }

        const full: GoalCycleMaterializationReceipt = {
          cycle_id: cycleId,
          approval_key: approvalKey,
          status: "materialized",
          materialized_at: now.toISOString(),
          slots: slotReceipts
        };

        await insertMaterializationReceipt(tx, {
          cycleId,
          approvalKey,
          receipt: full,
          materializedAt: now
        });

        await tx.creatorGoalCycle.update({
          where: { id: cycleId },
          data: {
            state: "active",
            phase: "active",
            materializedAt: now,
            version: { increment: 1 }
          }
        });

        return full;
      },
      { maxWait: 15_000, timeout: 60_000 }
    );

    return { receipt, idempotent: false };
  } catch (err) {
    if (err instanceof GoalCycleContractError) throw err;
    if (err instanceof CoachPlanCreditError) {
      throw new GoalCycleContractError(err.code, err.message, err.details);
    }
    if (err instanceof RelayCreatePostError) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_MATERIALIZATION_FAILED",
        err.message,
        [{ field: "post", issue: err.code }]
      );
    }
    throw new GoalCycleContractError(
      "GOAL_CYCLE_MATERIALIZATION_FAILED",
      err instanceof Error ? err.message : "Materialization failed.",
      [{ field: "materialization", issue: "failed" }]
    );
  }
}
