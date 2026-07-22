/**
 * AUT-VS4-T02/T03 — Occurrence → owned distribution rule run → shared materializer,
 * plus skip / one-pending / expiry sweeps (worker registration in automation-worker.ts).
 */

import type { PrismaClient } from "@prisma/client";
import {
  automationRunIdempotencyKeyForOccurrence,
  isAutomationsFeatureEnabled,
  type AutomationErrorCode
} from "./automation-contract.js";
import {
  materializeAutomationOwnedDistributionRun,
  type MaterializeDistributionRunResult
} from "./automation-materializer.js";
import { resolveLatestEligiblePatreonPost } from "./automation-source-resolver.js";

/** Stable intents for VS5 delivery (`deliverAutomationNotificationIntent`). */
export type AutomationNotificationIntent = {
  kind: "automation_no_new_post" | "automation_approval_expired";
  creator_id: string;
  automation_id: string;
  occurrence_id?: string;
  run_id?: string;
  dedupe_key: string;
};

export type AutomationsReconcileResult = {
  expired: number;
  claimed: number;
  materialized: number;
  skipped_no_post: number;
  skipped_awaiting_review: number;
  failed: number;
  notification_intents: AutomationNotificationIntent[];
};

export type CreateOrGetAutomationRunForOccurrenceResult = {
  run_id: string;
  rule_id: string;
  source_post_id: string;
  created: boolean;
  idempotency_key: string;
};

export type PrepareAutomationOccurrenceWorkResult =
  | {
      status: "materialized" | "already_materialized";
      run_id: string;
      draft_id: string | null;
      source_post_id: string;
      created_run: boolean;
    }
  | {
      status: "no_eligible_post";
      code: "AUTOMATION_NO_ELIGIBLE_POST";
    }
  | {
      status: "source_media_required";
      code: "AUTOMATION_SOURCE_MEDIA_REQUIRED";
      source_post_id: string;
      run_id: string | null;
      draft_id: null;
      created_run: boolean;
    }
  | {
      status: "failed";
      code: AutomationErrorCode | "MATERIALIZE_FAILED";
      run_id: string | null;
      draft_id: string | null;
      failure_reason?: string;
    };

/**
 * Atomically create or fetch the distribution rule run for a trigger occurrence.
 * Idempotency: `occurrence:{occurrenceId}` (unique). Also unique on (ruleId, sourcePostId).
 */
export async function createOrGetAutomationRunForOccurrence(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    distributionRuleId: string;
    occurrenceId: string;
    sourcePostId: string;
    sourcePublishedAt: Date;
    dueAt: Date;
  }
): Promise<CreateOrGetAutomationRunForOccurrenceResult> {
  const idempotencyKey = automationRunIdempotencyKeyForOccurrence(args.occurrenceId);

  const existingByKey = await prisma.creatorDistributionRuleRun.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      ruleId: true,
      sourcePostId: true,
      idempotencyKey: true
    }
  });
  if (existingByKey) {
    return {
      run_id: existingByKey.id,
      rule_id: existingByKey.ruleId,
      source_post_id: existingByKey.sourcePostId,
      created: false,
      idempotency_key: existingByKey.idempotencyKey
    };
  }

  try {
    const created = await prisma.creatorDistributionRuleRun.create({
      data: {
        ruleId: args.distributionRuleId,
        creatorId: args.creatorId,
        sourcePostId: args.sourcePostId,
        sourcePublishedAt: args.sourcePublishedAt,
        dueAt: args.dueAt,
        status: "pending",
        scheduleOccurrenceId: args.occurrenceId,
        idempotencyKey
      },
      select: {
        id: true,
        ruleId: true,
        sourcePostId: true,
        idempotencyKey: true
      }
    });
    return {
      run_id: created.id,
      rule_id: created.ruleId,
      source_post_id: created.sourcePostId,
      created: true,
      idempotency_key: created.idempotencyKey
    };
  } catch {
    const raced =
      (await prisma.creatorDistributionRuleRun.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          ruleId: true,
          sourcePostId: true,
          idempotencyKey: true
        }
      })) ??
      (await prisma.creatorDistributionRuleRun.findUnique({
        where: {
          ruleId_sourcePostId: {
            ruleId: args.distributionRuleId,
            sourcePostId: args.sourcePostId
          }
        },
        select: {
          id: true,
          ruleId: true,
          sourcePostId: true,
          idempotencyKey: true
        }
      }));
    if (!raced) {
      throw new Error("createOrGetAutomationRunForOccurrence: create failed without row.");
    }
    return {
      run_id: raced.id,
      rule_id: raced.ruleId,
      source_post_id: raced.sourcePostId,
      created: false,
      idempotency_key: raced.idempotencyKey
    };
  }
}

/**
 * Resolve eligible source for an automation-owned trigger occurrence, create/get one run,
 * and call `materializeAutomationOwnedDistributionRun`. Does not skip occurrences or emit notifications.
 */
export async function prepareAutomationOccurrenceWork(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    automationId: string;
    occurrenceId: string;
    now?: Date;
  }
): Promise<PrepareAutomationOccurrenceWorkResult> {
  const now = args.now ?? new Date();

  const automation = await prisma.creatorAutomation.findFirst({
    where: {
      id: args.automationId,
      creatorId: args.creatorId,
      status: { not: "archived" }
    },
    select: {
      id: true,
      distributionRuleId: true,
      scheduleSeriesId: true
    }
  });
  if (!automation?.scheduleSeriesId) {
    return {
      status: "failed",
      code: "AUTOMATION_NOT_FOUND",
      run_id: null,
      draft_id: null,
      failure_reason: "automation_missing_or_no_schedule_series"
    };
  }

  const occurrence = await prisma.creatorScheduleOccurrence.findFirst({
    where: {
      id: args.occurrenceId,
      creatorId: args.creatorId,
      seriesId: automation.scheduleSeriesId
    },
    select: {
      id: true,
      dueAt: true,
      status: true,
      series: { select: { materializationKind: true, status: true } }
    }
  });
  if (!occurrence) {
    return {
      status: "failed",
      code: "MATERIALIZE_FAILED",
      run_id: null,
      draft_id: null,
      failure_reason: "occurrence_not_found_for_automation"
    };
  }
  if (occurrence.series.materializationKind !== "automation_trigger") {
    return {
      status: "failed",
      code: "MATERIALIZE_FAILED",
      run_id: null,
      draft_id: null,
      failure_reason: "occurrence_not_automation_trigger"
    };
  }

  const resolved = await resolveLatestEligiblePatreonPost(prisma, {
    creatorId: args.creatorId,
    distributionRuleId: automation.distributionRuleId
  });

  if (!resolved.ok && resolved.code === "AUTOMATION_NO_ELIGIBLE_POST") {
    return { status: "no_eligible_post", code: "AUTOMATION_NO_ELIGIBLE_POST" };
  }

  if (!resolved.ok && resolved.code === "AUTOMATION_SOURCE_MEDIA_REQUIRED") {
    const source = resolved.source!;
    const run = await createOrGetAutomationRunForOccurrence(prisma, {
      creatorId: args.creatorId,
      distributionRuleId: automation.distributionRuleId,
      occurrenceId: occurrence.id,
      sourcePostId: source.post_id,
      sourcePublishedAt: source.published_at,
      dueAt: occurrence.dueAt
    });
    const mat = await materializeAutomationOwnedDistributionRun(prisma, {
      runId: run.run_id,
      creatorId: args.creatorId,
      automationId: automation.id,
      now
    });
    return {
      status: "source_media_required",
      code: "AUTOMATION_SOURCE_MEDIA_REQUIRED",
      source_post_id: source.post_id,
      run_id: mat.run_id ?? run.run_id,
      draft_id: null,
      created_run: run.created
    };
  }

  if (!resolved.ok) {
    return {
      status: "failed",
      code: "MATERIALIZE_FAILED",
      run_id: null,
      draft_id: null
    };
  }

  const source = resolved.source;
  const run = await createOrGetAutomationRunForOccurrence(prisma, {
    creatorId: args.creatorId,
    distributionRuleId: automation.distributionRuleId,
    occurrenceId: occurrence.id,
    sourcePostId: source.post_id,
    sourcePublishedAt: source.published_at,
    dueAt: occurrence.dueAt
  });

  const mat: MaterializeDistributionRunResult =
    await materializeAutomationOwnedDistributionRun(prisma, {
      runId: run.run_id,
      creatorId: args.creatorId,
      automationId: automation.id,
      now
    });

  if (mat.status === "materialized" || mat.status === "already_materialized") {
    // VS5: project prepared work onto rail via custom CreatorScheduleEvent (idempotent).
    try {
      const { ensureAutomationAttentionEventForRun } = await import(
        "./automation-attention-service.js"
      );
      await ensureAutomationAttentionEventForRun(prisma, {
        creatorId: args.creatorId,
        runId: mat.run_id,
        now
      });
    } catch {
      /* attention event is repairable on rail load; do not fail prepare */
    }
    return {
      status: mat.status,
      run_id: mat.run_id,
      draft_id: mat.draft_id,
      source_post_id: source.post_id,
      created_run: run.created
    };
  }

  return {
    status: "failed",
    code: mat.failure_code ?? "MATERIALIZE_FAILED",
    run_id: mat.run_id,
    draft_id: mat.draft_id,
    failure_reason: mat.failure_reason
  };
}

/** Awaiting-review = unfinished prepared work for this owned rule. */
export async function findAwaitingReviewAutomationRun(
  prisma: PrismaClient,
  args: { creatorId: string; distributionRuleId: string }
): Promise<{ id: string; status: string } | null> {
  return prisma.creatorDistributionRuleRun.findFirst({
    where: {
      creatorId: args.creatorId,
      ruleId: args.distributionRuleId,
      status: { in: ["pending", "materialized"] }
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true }
  });
}

/**
 * Expire untouched materialized automation runs past expiresAt (idempotent).
 * Emits one notification intent per newly expired run for VS5.
 */
export async function expireStaleAutomationRuns(
  prisma: PrismaClient,
  options?: { now?: Date; limit?: number; creatorId?: string }
): Promise<{ expired: number; notification_intents: AutomationNotificationIntent[] }> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 50;
  const intents: AutomationNotificationIntent[] = [];

  const due = await prisma.creatorDistributionRuleRun.findMany({
    where: {
      status: "materialized",
      expiresAt: { lte: now },
      ...(options?.creatorId ? { creatorId: options.creatorId } : {})
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: {
      id: true,
      creatorId: true,
      ruleId: true,
      scheduleOccurrenceId: true
    }
  });

  let expired = 0;
  for (const run of due) {
    const updated = await prisma.creatorDistributionRuleRun.updateMany({
      where: { id: run.id, status: "materialized" },
      data: { status: "expired", updatedAt: now }
    });
    if (updated.count !== 1) continue;
    expired += 1;

    const automation = await prisma.creatorAutomation.findFirst({
      where: { distributionRuleId: run.ruleId, creatorId: run.creatorId },
      select: { id: true }
    });
    if (automation) {
      intents.push({
        kind: "automation_approval_expired",
        creator_id: run.creatorId,
        automation_id: automation.id,
        run_id: run.id,
        occurrence_id: run.scheduleOccurrenceId ?? undefined,
        dedupe_key: `automation_approval_expired:run:${run.id}`
      });
      try {
        const { syncAutomationAttentionEventToRunStatus } = await import(
          "./automation-attention-service.js"
        );
        await syncAutomationAttentionEventToRunStatus(prisma, {
          creatorId: run.creatorId,
          runId: run.id,
          runStatus: "expired",
          now
        });
      } catch {
        /* dismiss is best-effort; delivery still happens via intent */
      }
    }
  }

  return { expired, notification_intents: intents };
}

async function transitionOccurrence(
  prisma: PrismaClient,
  args: {
    occurrenceId: string;
    fromStatus: "planned";
    toStatus: "materialized" | "skipped" | "failed";
    now: Date;
    draftId?: string | null;
    failureReason?: string | null;
  }
): Promise<boolean> {
  const data: {
    status: "materialized" | "skipped" | "failed";
    failureReason: string | null;
    updatedAt: Date;
    materializedAt?: Date;
    draftId?: string | null;
  } = {
    status: args.toStatus,
    failureReason: args.failureReason ?? null,
    updatedAt: args.now
  };
  if (args.toStatus === "materialized") {
    data.materializedAt = args.now;
    if (args.draftId !== undefined) data.draftId = args.draftId;
  }
  const updated = await prisma.creatorScheduleOccurrence.updateMany({
    where: { id: args.occurrenceId, status: args.fromStatus },
    data
  });
  return updated.count === 1;
}

/**
 * Full Automations reconcile cycle (B11): expiry sweep → due trigger occurrences →
 * one-pending guard / prepare / skip. Flag-off performs no discovery/materialization.
 */
export async function reconcileAutomations(
  prisma: PrismaClient,
  options?: { now?: Date; limit?: number; creatorId?: string }
): Promise<AutomationsReconcileResult> {
  const empty: AutomationsReconcileResult = {
    expired: 0,
    claimed: 0,
    materialized: 0,
    skipped_no_post: 0,
    skipped_awaiting_review: 0,
    failed: 0,
    notification_intents: []
  };
  if (!isAutomationsFeatureEnabled()) return empty;

  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 50;
  const intents: AutomationNotificationIntent[] = [];

  const expiredSweep = await expireStaleAutomationRuns(prisma, {
    now,
    limit,
    creatorId: options?.creatorId
  });
  intents.push(...expiredSweep.notification_intents);

  const automations = await prisma.creatorAutomation.findMany({
    where: {
      status: "active",
      scheduleSeriesId: { not: null },
      ...(options?.creatorId ? { creatorId: options.creatorId } : {})
    },
    select: {
      id: true,
      creatorId: true,
      distributionRuleId: true,
      scheduleSeriesId: true
    },
    take: 200
  });

  const seriesIds = automations
    .map((a) => a.scheduleSeriesId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (seriesIds.length === 0) {
    return { ...empty, expired: expiredSweep.expired, notification_intents: intents };
  }

  const bySeries = new Map(automations.map((a) => [a.scheduleSeriesId!, a]));

  const dueOccurrences = await prisma.creatorScheduleOccurrence.findMany({
    where: {
      status: "planned",
      dueAt: { lte: now },
      seriesId: { in: seriesIds },
      series: { materializationKind: "automation_trigger", status: "active" },
      ...(options?.creatorId ? { creatorId: options.creatorId } : {})
    },
    orderBy: { dueAt: "asc" },
    take: limit,
    select: {
      id: true,
      seriesId: true,
      creatorId: true,
      dueAt: true
    }
  });

  let claimed = 0;
  let materialized = 0;
  let skippedNoPost = 0;
  let skippedAwaiting = 0;
  let failed = 0;

  for (const occ of dueOccurrences) {
    const automation = bySeries.get(occ.seriesId);
    if (!automation || automation.creatorId !== occ.creatorId) continue;
    claimed += 1;

    const awaiting = await findAwaitingReviewAutomationRun(prisma, {
      creatorId: occ.creatorId,
      distributionRuleId: automation.distributionRuleId
    });
    if (awaiting) {
      const ok = await transitionOccurrence(prisma, {
        occurrenceId: occ.id,
        fromStatus: "planned",
        toStatus: "skipped",
        now,
        failureReason: "awaiting_review"
      });
      if (ok) skippedAwaiting += 1;
      continue;
    }

    const prepared = await prepareAutomationOccurrenceWork(prisma, {
      creatorId: occ.creatorId,
      automationId: automation.id,
      occurrenceId: occ.id,
      now
    });

    if (prepared.status === "no_eligible_post") {
      const ok = await transitionOccurrence(prisma, {
        occurrenceId: occ.id,
        fromStatus: "planned",
        toStatus: "skipped",
        now,
        failureReason: "AUTOMATION_NO_ELIGIBLE_POST"
      });
      if (ok) {
        skippedNoPost += 1;
        intents.push({
          kind: "automation_no_new_post",
          creator_id: occ.creatorId,
          automation_id: automation.id,
          occurrence_id: occ.id,
          dedupe_key: `automation_no_new_post:occurrence:${occ.id}`
        });
      }
      continue;
    }

    if (prepared.status === "materialized" || prepared.status === "already_materialized") {
      const ok = await transitionOccurrence(prisma, {
        occurrenceId: occ.id,
        fromStatus: "planned",
        toStatus: "materialized",
        now,
        draftId: prepared.draft_id,
        failureReason: null
      });
      // Retry after crash: occurrence may already be materialized; still count success.
      if (ok || prepared.status === "already_materialized") {
        materialized += 1;
      }
      continue;
    }

    if (prepared.status === "source_media_required") {
      await transitionOccurrence(prisma, {
        occurrenceId: occ.id,
        fromStatus: "planned",
        toStatus: "failed",
        now,
        failureReason: "AUTOMATION_SOURCE_MEDIA_REQUIRED"
      });
      failed += 1;
      continue;
    }

    if (prepared.status === "failed") {
      await transitionOccurrence(prisma, {
        occurrenceId: occ.id,
        fromStatus: "planned",
        toStatus: "failed",
        now,
        failureReason: prepared.failure_reason ?? prepared.code
      });
      failed += 1;
      continue;
    }

    failed += 1;
  }

  return {
    expired: expiredSweep.expired,
    claimed,
    materialized,
    skipped_no_post: skippedNoPost,
    skipped_awaiting_review: skippedAwaiting,
    failed,
    notification_intents: intents
  };
}
