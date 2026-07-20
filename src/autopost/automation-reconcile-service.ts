/**
 * AUT-VS4-T02 — Occurrence → owned distribution rule run → shared materializer.
 * Skip / one-pending / expiry / job registration remain B11.
 */

import type { PrismaClient } from "@prisma/client";
import {
  automationRunIdempotencyKeyForOccurrence,
  type AutomationErrorCode
} from "./automation-contract.js";
import {
  materializeAutomationOwnedDistributionRun,
  type MaterializeDistributionRunResult
} from "./automation-materializer.js";
import { resolveLatestEligiblePatreonPost } from "./automation-source-resolver.js";

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
