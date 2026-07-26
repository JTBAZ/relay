/**
 * Autopost distribution rules — after a Patreon post is published, prepare
 * draft-only preview Autopost drafts for other destinations after an offset.
 */

import type { PrismaClient } from "@prisma/client";
import { CreatorPlan, PostSource } from "@prisma/client";
import { requireCreatorPlanAtLeast } from "../billing/creator-plan-entitlement-service.js";
import {
  materializeAutomationOwnedDistributionRun,
  materializeLegacyDistributionRun
} from "./automation-materializer.js";

export const DISTRIBUTION_RULES_FEATURE_ENV = "RELAY_FEATURE_DISTRIBUTION_RULES";

export function isDistributionRulesFeatureEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = (env[DISTRIBUTION_RULES_FEATURE_ENV] ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export class DistributionRuleValidationError extends Error {
  public override readonly name = "DistributionRuleValidationError";
  public readonly statusCode = 400;
  public constructor(message: string) {
    super(message);
  }
}

export class DistributionRuleNotFoundError extends Error {
  public override readonly name = "DistributionRuleNotFoundError";
  public readonly statusCode = 404;
  public constructor(message: string) {
    super(message);
  }
}

export class DistributionRulePlanRequiredError extends Error {
  public override readonly name = "DistributionRulePlanRequiredError";
  public readonly statusCode = 402;
  public readonly required_plan = "autopost";
  public constructor(message = "Autopost plan required for distribution rules.") {
    super(message);
  }
}

const DESTINATIONS = new Set(["patreon", "x", "deviantart", "bluesky"]);

export type CreateDistributionRuleInput = {
  offset_days?: number;
  target_destinations: string[];
  remind_me?: boolean;
  title?: string | null;
};

export type PatchDistributionRuleInput = {
  status?: "active" | "paused";
  offset_days?: number;
  target_destinations?: string[];
  remind_me?: boolean;
  title?: string | null;
};

export type DistributionRuleWire = {
  rule_id: string;
  creator_id: string;
  status: string;
  trigger_kind: string;
  offset_days: number;
  target_destinations: string[];
  transform_mode: string;
  remind_me: boolean;
  draft_only: boolean;
  title: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type DistributionRuleRunWire = {
  run_id: string;
  rule_id: string;
  source_post_id: string;
  source_published_at: string;
  due_at: string;
  status: string;
  draft_id: string | null;
  plan_id: string | null;
  failure_reason: string | null;
};

function normalizeDestinations(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of raw) {
    const v = String(d ?? "")
      .trim()
      .toLowerCase();
    if (!DESTINATIONS.has(v) || seen.has(v) || v === "patreon") continue;
    seen.add(v);
    out.push(v);
  }
  if (out.length === 0) {
    throw new DistributionRuleValidationError(
      "target_destinations must include at least one non-Patreon destination."
    );
  }
  return out;
}

async function requireAutopost(prisma: PrismaClient, creatorId: string) {
  const gate = await requireCreatorPlanAtLeast(prisma, creatorId, CreatorPlan.autopost);
  if (!gate.ok) throw new DistributionRulePlanRequiredError();
}

/**
 * True when a CreatorAutomation connector owns this distribution rule (1:1).
 * Legacy public wires stay unchanged — ownership is relational, not a list field.
 */
export async function findAutomationIdForDistributionRule(
  prisma: PrismaClient,
  ruleId: string
): Promise<string | null> {
  const row = await prisma.creatorAutomation.findFirst({
    where: { distributionRuleId: ruleId },
    select: { id: true }
  });
  return row?.id ?? null;
}

export async function isAutomationOwnedDistributionRule(
  prisma: PrismaClient,
  ruleId: string
): Promise<boolean> {
  return (await findAutomationIdForDistributionRule(prisma, ruleId)) != null;
}

async function assertRuleNotOwnedByAutomation(
  prisma: PrismaClient,
  ruleId: string,
  creatorId: string
): Promise<void> {
  const owned = await prisma.creatorAutomation.findFirst({
    where: { distributionRuleId: ruleId, creatorId },
    select: { id: true }
  });
  if (owned) {
    throw new DistributionRuleValidationError(
      "This distribution rule is owned by an Automation; manage it via Automations APIs."
    );
  }
}

function mapRule(row: {
  id: string;
  creatorId: string;
  status: string;
  triggerKind: string;
  offsetDays: number;
  targetDestinations: string[];
  transformMode: string;
  remindMe: boolean;
  draftOnly: boolean;
  title: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DistributionRuleWire {
  return {
    rule_id: row.id,
    creator_id: row.creatorId,
    status: row.status,
    trigger_kind: row.triggerKind,
    offset_days: row.offsetDays,
    target_destinations: row.targetDestinations,
    transform_mode: row.transformMode,
    remind_me: row.remindMe,
    draft_only: row.draftOnly,
    title: row.title,
    last_error: row.lastError,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

function mapRun(row: {
  id: string;
  ruleId: string;
  sourcePostId: string;
  sourcePublishedAt: Date;
  dueAt: Date;
  status: string;
  draftId: string | null;
  planId: string | null;
  failureReason: string | null;
}): DistributionRuleRunWire {
  return {
    run_id: row.id,
    rule_id: row.ruleId,
    source_post_id: row.sourcePostId,
    source_published_at: row.sourcePublishedAt.toISOString(),
    due_at: row.dueAt.toISOString(),
    status: row.status,
    draft_id: row.draftId,
    plan_id: row.planId,
    failure_reason: row.failureReason
  };
}

export async function createDistributionRule(
  prisma: PrismaClient,
  creatorId: string,
  input: CreateDistributionRuleInput
): Promise<DistributionRuleWire> {
  await requireAutopost(prisma, creatorId);
  if (!isDistributionRulesFeatureEnabled()) {
    throw new DistributionRuleValidationError("Distribution rules feature is disabled.");
  }
  const offsetDays = Math.max(0, Math.floor(input.offset_days ?? 30));
  const targets = normalizeDestinations(input.target_destinations);
  const row = await prisma.creatorDistributionRule.create({
    data: {
      creatorId,
      status: "active",
      triggerKind: "patreon_published",
      offsetDays,
      targetDestinations: targets,
      transformMode: "preview",
      remindMe: input.remind_me !== false,
      draftOnly: true,
      title: input.title?.trim() || null
    }
  });
  return mapRule(row);
}

export async function listDistributionRules(
  prisma: PrismaClient,
  creatorId: string
): Promise<DistributionRuleWire[]> {
  await requireAutopost(prisma, creatorId);
  const rows = await prisma.creatorDistributionRule.findMany({
    where: { creatorId },
    orderBy: { updatedAt: "desc" }
  });
  return rows.map(mapRule);
}

export async function patchDistributionRule(
  prisma: PrismaClient,
  creatorId: string,
  ruleId: string,
  input: PatchDistributionRuleInput
): Promise<DistributionRuleWire> {
  await requireAutopost(prisma, creatorId);
  const existing = await prisma.creatorDistributionRule.findFirst({
    where: { id: ruleId, creatorId }
  });
  if (!existing) throw new DistributionRuleNotFoundError("Distribution rule not found.");
  await assertRuleNotOwnedByAutomation(prisma, ruleId, creatorId);

  const data: Record<string, unknown> = {};
  if (input.status) data.status = input.status;
  if (input.offset_days != null) data.offsetDays = Math.max(0, Math.floor(input.offset_days));
  if (input.target_destinations) {
    data.targetDestinations = normalizeDestinations(input.target_destinations);
  }
  if (input.remind_me != null) data.remindMe = input.remind_me;
  if (input.title !== undefined) data.title = input.title?.trim() || null;

  const updated = await prisma.creatorDistributionRule.update({
    where: { id: ruleId },
    data
  });
  return mapRule(updated);
}

export async function deleteDistributionRule(
  prisma: PrismaClient,
  creatorId: string,
  ruleId: string
): Promise<void> {
  await requireAutopost(prisma, creatorId);
  const existing = await prisma.creatorDistributionRule.findFirst({
    where: { id: ruleId, creatorId }
  });
  if (!existing) throw new DistributionRuleNotFoundError("Distribution rule not found.");
  await assertRuleNotOwnedByAutomation(prisma, ruleId, creatorId);
  await prisma.creatorDistributionRule.delete({ where: { id: ruleId } });
}

export async function listDistributionRuleRuns(
  prisma: PrismaClient,
  creatorId: string,
  ruleId: string
): Promise<DistributionRuleRunWire[]> {
  await requireAutopost(prisma, creatorId);
  const rule = await prisma.creatorDistributionRule.findFirst({
    where: { id: ruleId, creatorId }
  });
  if (!rule) throw new DistributionRuleNotFoundError("Distribution rule not found.");
  const rows = await prisma.creatorDistributionRuleRun.findMany({
    where: { ruleId },
    orderBy: { dueAt: "desc" },
    take: 50
  });
  return rows.map(mapRun);
}

/**
 * Discover Patreon-published posts and create delayed runs for active rules.
 * Single discovery authority for both legacy (unowned) and Automations-owned rules —
 * delayed_public_release must not introduce a second worker or trigger path.
 */
export async function discoverDistributionRuleRuns(
  prisma: PrismaClient,
  options?: { now?: Date; creatorId?: string; lookbackDays?: number }
): Promise<{ rules: number; runs_created: number }> {
  if (!isDistributionRulesFeatureEnabled()) return { rules: 0, runs_created: 0 };
  const now = options?.now ?? new Date();
  const lookbackDays = options?.lookbackDays ?? 120;
  const since = new Date(now.getTime() - lookbackDays * 86400000);

  const rules = await prisma.creatorDistributionRule.findMany({
    where: {
      status: "active",
      ...(options?.creatorId ? { creatorId: options.creatorId } : {})
    }
  });
  let created = 0;

  for (const rule of rules) {
    const posts = await prisma.post.findMany({
      where: {
        creatorId: rule.creatorId,
        source: PostSource.PATREON,
        publishState: "published",
        versions: { some: { publishedAt: { gte: since, not: null } } }
      },
      select: {
        id: true,
        versions: {
          orderBy: { versionSeq: "desc" },
          take: 1,
          select: { publishedAt: true, title: true }
        }
      },
      take: 100
    });

    for (const post of posts) {
      const publishedAt = post.versions[0]?.publishedAt;
      if (!publishedAt) continue;
      const dueAt = new Date(publishedAt.getTime() + rule.offsetDays * 86400000);
      try {
        await prisma.creatorDistributionRuleRun.create({
          data: {
            ruleId: rule.id,
            creatorId: rule.creatorId,
            sourcePostId: post.id,
            sourcePublishedAt: publishedAt,
            dueAt,
            status: "pending"
          }
        });
        created += 1;
      } catch {
        /* unique (ruleId, sourcePostId) */
      }
    }
  }

  return { rules: rules.length, runs_created: created };
}

/**
 * Materialize due pending runs into nudged Autopost drafts (draft-only, no publish).
 * Owned + legacy share the automation-materializer seam (AUT-VS3-T02).
 */
export async function materializeDueDistributionRuns(
  prisma: PrismaClient,
  options?: { now?: Date; limit?: number; creatorId?: string }
): Promise<{ materialized: number; failed: number }> {
  if (!isDistributionRulesFeatureEnabled()) return { materialized: 0, failed: 0 };
  const now = options?.now ?? new Date();
  const runs = await prisma.creatorDistributionRuleRun.findMany({
    where: {
      status: "pending",
      dueAt: { lte: now },
      ...(options?.creatorId ? { creatorId: options.creatorId } : {})
    },
    include: { rule: true },
    orderBy: { dueAt: "asc" },
    take: options?.limit ?? 50
  });

  let materialized = 0;
  let failed = 0;

  for (const run of runs) {
    const automationId = await findAutomationIdForDistributionRule(prisma, run.ruleId);
    const result = automationId
      ? await materializeAutomationOwnedDistributionRun(prisma, {
          runId: run.id,
          creatorId: run.creatorId,
          automationId,
          now
        })
      : await materializeLegacyDistributionRun(prisma, {
          runId: run.id,
          creatorId: run.creatorId,
          now
        });
    if (result.status === "materialized" || result.status === "already_materialized") {
      if (automationId && result.run_id) {
        try {
          const { ensureAutomationAttentionEventForRun } = await import(
            "./automation-attention-service.js"
          );
          await ensureAutomationAttentionEventForRun(prisma, {
            creatorId: run.creatorId,
            runId: result.run_id,
            now
          });
        } catch {
          /* attention event is repairable on rail load */
        }
      }
      materialized += 1;
    } else {
      failed += 1;
    }
  }

  return { materialized, failed };
}

export async function reconcileDistributionRules(
  prisma: PrismaClient,
  options?: { now?: Date; creatorId?: string }
): Promise<{
  rules: number;
  runs_created: number;
  materialized: number;
  failed: number;
}> {
  const discovered = await discoverDistributionRuleRuns(prisma, options);
  const mat = await materializeDueDistributionRuns(prisma, options);
  return {
    rules: discovered.rules,
    runs_created: discovered.runs_created,
    materialized: mat.materialized,
    failed: mat.failed
  };
}
