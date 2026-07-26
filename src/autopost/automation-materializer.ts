/**
 * AUT-VS3-T02 — Shared prepared-draft materializer for distribution rule runs.
 * Owned + legacy share source load + draft create; ownership only adds snapshots / correlation / gates.
 *
 * Routing (owned vs legacy) lives in `materializeDueDistributionRuns` to avoid a service↔materializer cycle.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { saveAutopostDraft } from "./autopost-draft-service.js";
import type { AutopostDraftWorkspace } from "./autopost-draft-service.js";
import type { AutomationErrorCode } from "./automation-contract.js";
import {
  parsePreviewTemplateConfig,
  PreviewTemplateConfigError
} from "../distribution/preview-template-config.js";

export type MaterializeDistributionRunResult = {
  status: "materialized" | "already_materialized" | "failed";
  run_id: string;
  draft_id: string | null;
  failure_code?: AutomationErrorCode | "MATERIALIZE_FAILED";
  failure_reason?: string;
};

export type DistributionRunSourceVersion = {
  title: string;
  description: string | null;
  mediaIds: string[];
};

type RuleRow = {
  id: string;
  creatorId: string;
  title: string | null;
  targetDestinations: string[];
  transformMode: string;
  draftOnly: boolean;
};

/** Match legacy teaser body used by pre-automation materialize. */
export function teaserExcerpt(title: string, description: string | null): string {
  const body = (description ?? "").replace(/\s+/g, " ").trim();
  const base = body || `Preview: ${title}`;
  const clipped = base.slice(0, 220);
  return clipped.length < base.length ? `${clipped}…` : clipped;
}

export async function loadDistributionRunSourceVersion(
  prisma: PrismaClient,
  sourcePostId: string
): Promise<DistributionRunSourceVersion | null> {
  const version = await prisma.postVersion.findFirst({
    where: { postId: sourcePostId },
    orderBy: { versionSeq: "desc" },
    select: { title: true, description: true, mediaIds: true }
  });
  if (!version) return null;
  return {
    title: version.title?.trim() || "Patreon preview",
    description: version.description ?? null,
    mediaIds: Array.isArray(version.mediaIds)
      ? version.mediaIds.filter((id): id is string => typeof id === "string")
      : []
  };
}

function buildPreparedWorkspace(args: {
  rule: RuleRow;
  runId: string;
  sourcePostId: string;
  automation?: {
    automationId: string;
    previewTemplateId: string | null;
  };
}): AutopostDraftWorkspace {
  const base: AutopostDraftWorkspace = {
    selected_destinations: args.rule.targetDestinations,
    planned_format: "mixed",
    source_post_id: args.sourcePostId,
    automation_rule_id: args.rule.id,
    transform_mode: "preview",
    needs_preview: true
  };
  if (!args.automation) return base;
  return {
    ...base,
    automation_id: args.automation.automationId,
    automation_run_id: args.runId,
    distribution_rule_run_id: args.runId,
    preview_template_id: args.automation.previewTemplateId
  };
}

async function markRunFailed(
  prisma: PrismaClient,
  args: {
    runId: string;
    ruleId: string;
    code: AutomationErrorCode | "MATERIALIZE_FAILED";
    detail: string;
  }
): Promise<MaterializeDistributionRunResult> {
  const failureReason = `${args.code}: ${args.detail}`;
  await prisma.creatorDistributionRuleRun.update({
    where: { id: args.runId },
    data: {
      status: "failed",
      failureReason,
      updatedAt: new Date()
    }
  });
  await prisma.creatorDistributionRule.update({
    where: { id: args.ruleId },
    data: { lastError: failureReason }
  });
  return {
    status: "failed",
    run_id: args.runId,
    draft_id: null,
    failure_code: args.code,
    failure_reason: failureReason
  };
}

async function finalizeMaterializedRun(
  prisma: PrismaClient,
  args: {
    runId: string;
    ruleId: string;
    draftId: string;
    now: Date;
    expiresAt?: Date | null;
    previewTemplateSnapshot?: Prisma.InputJsonValue | null;
  }
): Promise<"materialized" | "already_materialized"> {
  const data: Prisma.CreatorDistributionRuleRunUpdateManyMutationInput = {
    status: "materialized",
    draftId: args.draftId,
    planId: null,
    failureReason: null,
    materializedAt: args.now,
    updatedAt: args.now
  };
  if (args.expiresAt !== undefined) {
    data.expiresAt = args.expiresAt;
  }
  if (args.previewTemplateSnapshot !== undefined) {
    data.previewTemplateSnapshot =
      args.previewTemplateSnapshot === null
        ? Prisma.DbNull
        : args.previewTemplateSnapshot;
  }

  const updated = await prisma.creatorDistributionRuleRun.updateMany({
    where: { id: args.runId, status: "pending" },
    data
  });

  if (updated.count === 1) {
    await prisma.creatorDistributionRule.update({
      where: { id: args.ruleId },
      data: { lastError: null }
    });
    return "materialized";
  }

  const current = await prisma.creatorDistributionRuleRun.findUnique({
    where: { id: args.runId },
    select: { status: true, draftId: true }
  });
  if (current?.status === "materialized" && current.draftId) {
    return "already_materialized";
  }
  return "materialized";
}

async function createPreparedDraft(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    title: string;
    body: string;
    workspace: AutopostDraftWorkspace;
  }
) {
  return saveAutopostDraft(prisma, args.creatorId, {
    media_ids: [],
    title: `Preview: ${args.title}`.slice(0, 200),
    body_text: args.body,
    generate: false,
    status: "nudged",
    composer_step: "draft-post",
    intent: "Distribution rule preview",
    workspace: args.workspace
  });
}

/**
 * Testable VS4 seam: materialize one automation-owned distribution rule run into AutopostDraft only.
 * Never creates CreatorDistributionPlan / Variant.
 * Caller must pass `automationId` (ownership already established).
 */
export async function materializeAutomationOwnedDistributionRun(
  prisma: PrismaClient,
  args: {
    runId: string;
    creatorId: string;
    automationId: string;
    now?: Date;
  }
): Promise<MaterializeDistributionRunResult> {
  const now = args.now ?? new Date();
  const run = await prisma.creatorDistributionRuleRun.findFirst({
    where: { id: args.runId, creatorId: args.creatorId },
    include: {
      rule: {
        select: {
          id: true,
          creatorId: true,
          title: true,
          targetDestinations: true,
          transformMode: true,
          draftOnly: true
        }
      }
    }
  });
  if (!run?.rule) {
    return {
      status: "failed",
      run_id: args.runId,
      draft_id: null,
      failure_code: "MATERIALIZE_FAILED",
      failure_reason: "MATERIALIZE_FAILED: run_not_found"
    };
  }

  if (run.status === "materialized" && run.draftId) {
    return {
      status: "already_materialized",
      run_id: run.id,
      draft_id: run.draftId
    };
  }

  if (run.status !== "pending") {
    return {
      status: "failed",
      run_id: run.id,
      draft_id: run.draftId,
      failure_code: "MATERIALIZE_FAILED",
      failure_reason: `MATERIALIZE_FAILED: run_not_pending:${run.status}`
    };
  }

  const automation = await prisma.creatorAutomation.findFirst({
    where: {
      id: args.automationId,
      creatorId: args.creatorId,
      status: { not: "archived" }
    },
    select: {
      id: true,
      approvalTtlHours: true,
      previewTemplateId: true
    }
  });
  if (!automation) {
    return markRunFailed(prisma, {
      runId: run.id,
      ruleId: run.ruleId,
      code: "AUTOMATION_NOT_FOUND",
      detail: "automation_missing_or_archived"
    });
  }

  const source = await loadDistributionRunSourceVersion(prisma, run.sourcePostId);
  if (!source) {
    return markRunFailed(prisma, {
      runId: run.id,
      ruleId: run.ruleId,
      code: "AUTOMATION_NO_ELIGIBLE_POST",
      detail: "source_post_or_version_missing"
    });
  }

  if (source.mediaIds.length === 0) {
    return markRunFailed(prisma, {
      runId: run.id,
      ruleId: run.ruleId,
      code: "AUTOMATION_SOURCE_MEDIA_REQUIRED",
      detail: "preview_transform_requires_source_media"
    });
  }

  let previewTemplateSnapshot: Prisma.InputJsonValue | null = null;
  if (automation.previewTemplateId) {
    const template = await prisma.creatorPreviewTemplate.findFirst({
      where: {
        id: automation.previewTemplateId,
        creatorId: args.creatorId
      },
      select: { id: true, config: true }
    });
    if (!template) {
      return markRunFailed(prisma, {
        runId: run.id,
        ruleId: run.ruleId,
        code: "AUTOMATION_TEMPLATE_NOT_FOUND",
        detail: "preview_template_missing"
      });
    }
    try {
      const parsed = parsePreviewTemplateConfig(template.config);
      previewTemplateSnapshot = parsed as unknown as Prisma.InputJsonValue;
    } catch (error) {
      const detail =
        error instanceof PreviewTemplateConfigError
          ? "preview_template_config_invalid"
          : "preview_template_config_parse_failed";
      return markRunFailed(prisma, {
        runId: run.id,
        ruleId: run.ruleId,
        code: "AUTOMATION_TEMPLATE_NOT_FOUND",
        detail
      });
    }
  }

  const workspace = buildPreparedWorkspace({
    rule: run.rule,
    runId: run.id,
    sourcePostId: run.sourcePostId,
    automation: {
      automationId: automation.id,
      previewTemplateId: automation.previewTemplateId
    }
  });

  try {
    const draft = await createPreparedDraft(prisma, {
      creatorId: args.creatorId,
      title: source.title,
      body: teaserExcerpt(source.title, source.description),
      workspace
    });
    const expiresAt = new Date(
      now.getTime() + Math.max(1, automation.approvalTtlHours) * 60 * 60 * 1000
    );
    const outcome = await finalizeMaterializedRun(prisma, {
      runId: run.id,
      ruleId: run.ruleId,
      draftId: draft.draft_id,
      now,
      expiresAt,
      previewTemplateSnapshot
    });
    if (outcome === "already_materialized") {
      const current = await prisma.creatorDistributionRuleRun.findUnique({
        where: { id: run.id },
        select: { draftId: true }
      });
      return {
        status: "already_materialized",
        run_id: run.id,
        draft_id: current?.draftId ?? draft.draft_id
      };
    }
    return {
      status: "materialized",
      run_id: run.id,
      draft_id: draft.draft_id
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return markRunFailed(prisma, {
      runId: run.id,
      ruleId: run.ruleId,
      code: "MATERIALIZE_FAILED",
      detail: message
    });
  }
}

/**
 * Legacy delayed-release materialize: same draft outputs as pre-automation path (no automation correlation).
 */
export async function materializeLegacyDistributionRun(
  prisma: PrismaClient,
  args: {
    runId: string;
    creatorId: string;
    now?: Date;
  }
): Promise<MaterializeDistributionRunResult> {
  const now = args.now ?? new Date();
  const run = await prisma.creatorDistributionRuleRun.findFirst({
    where: { id: args.runId, creatorId: args.creatorId },
    include: {
      rule: {
        select: {
          id: true,
          creatorId: true,
          title: true,
          targetDestinations: true,
          transformMode: true,
          draftOnly: true
        }
      }
    }
  });
  if (!run?.rule) {
    return {
      status: "failed",
      run_id: args.runId,
      draft_id: null,
      failure_code: "MATERIALIZE_FAILED",
      failure_reason: "MATERIALIZE_FAILED: run_not_found"
    };
  }

  if (run.status === "materialized" && run.draftId) {
    return {
      status: "already_materialized",
      run_id: run.id,
      draft_id: run.draftId
    };
  }

  if (run.status !== "pending") {
    return {
      status: "failed",
      run_id: run.id,
      draft_id: run.draftId,
      failure_code: "MATERIALIZE_FAILED",
      failure_reason: `MATERIALIZE_FAILED: run_not_pending:${run.status}`
    };
  }

  const source = await loadDistributionRunSourceVersion(prisma, run.sourcePostId);
  // Preserve legacy behavior: missing version still materializes with fallback title.
  const title = source?.title ?? "Patreon preview";
  const description = source?.description ?? null;
  const legacyWorkspace: AutopostDraftWorkspace = {
    selected_destinations: run.rule.targetDestinations,
    planned_format: "mixed",
    source_post_id: run.sourcePostId,
    automation_rule_id: run.rule.id,
    transform_mode: "preview"
  };

  try {
    const draft = await createPreparedDraft(prisma, {
      creatorId: args.creatorId,
      title,
      body: teaserExcerpt(title, description),
      workspace: legacyWorkspace
    });
    const outcome = await finalizeMaterializedRun(prisma, {
      runId: run.id,
      ruleId: run.ruleId,
      draftId: draft.draft_id,
      now
    });
    if (outcome === "already_materialized") {
      const current = await prisma.creatorDistributionRuleRun.findUnique({
        where: { id: run.id },
        select: { draftId: true }
      });
      return {
        status: "already_materialized",
        run_id: run.id,
        draft_id: current?.draftId ?? draft.draft_id
      };
    }
    return {
      status: "materialized",
      run_id: run.id,
      draft_id: draft.draft_id
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return markRunFailed(prisma, {
      runId: run.id,
      ruleId: run.ruleId,
      code: "MATERIALIZE_FAILED",
      detail: message
    });
  }
}
