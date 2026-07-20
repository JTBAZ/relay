/**
 * Goal Cycle trend research orchestration (VS3-T04).
 * Appends fixed progress codes; hydrates status without chain-of-thought.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  GoalCycleContractError,
  getGoalCycleFeatureFlags,
  type GoalCycleProgressEvent
} from "../contracts.js";
import { findGoalCycleForCreator } from "../goal-cycle-store.js";
import { createTrendEvidenceGateway } from "./trend-evidence-gateway.js";
import {
  evidenceFromStoredJson,
  findTrendRunByRequestId,
  stripRawFromEvidence
} from "./trend-evidence-store.js";
import {
  isTrendProgressCode,
  TREND_PROGRESS_CODES,
  type TrendEvidence,
  type TrendProgressCode,
  type TrendResearchRequest
} from "./provider-types.js";

export type TrendResearchStatus = {
  cycle_id: string;
  request_id: string | null;
  status: "not_started" | "pending" | "complete" | "failed";
  mode: string;
  progress: GoalCycleProgressEvent[];
  evidence: TrendEvidence | null;
  error_code: string | null;
  strength: string | null;
  confidence: string | null;
};

const SAFE_META_KEYS = new Set([
  "provider_id",
  "strength",
  "cache_hit",
  "quarantined",
  "latency_ms",
  "mode"
]);

function sanitizeProgressMeta(
  meta: Record<string, unknown> | undefined
): Record<string, string | number | boolean> {
  if (!meta) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!SAFE_META_KEYS.has(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, 64);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

export async function appendTrendProgress(
  prisma: PrismaClient,
  cycleId: string,
  code: TrendProgressCode,
  meta?: Record<string, unknown>
): Promise<void> {
  if (!isTrendProgressCode(code)) {
    throw new Error(`invalid_trend_progress_code:${code}`);
  }
  const last = await prisma.creatorGoalCycleProgress.findFirst({
    where: { cycleId },
    orderBy: { sequence: "desc" }
  });
  const sequence = (last?.sequence ?? 0) + 1;
  await prisma.creatorGoalCycleProgress.create({
    data: {
      cycleId,
      sequence,
      phase: "research",
      messageCode: code,
      metadataJson: {
        retryable: code === "research_failed",
        ...sanitizeProgressMeta(meta)
      } as Prisma.InputJsonValue
    }
  });
}

async function markCycleResearching(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string
): Promise<void> {
  const row = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }
  if (row.state === "draft") {
    await prisma.creatorGoalCycle.update({
      where: { id: row.id },
      data: {
        state: "researching",
        phase: "research",
        version: row.version + 1
      }
    });
  } else if (row.phase !== "research" && row.state === "researching") {
    await prisma.creatorGoalCycle.update({
      where: { id: row.id },
      data: { phase: "research" }
    });
  }
}

export type RunTrendResearchInput = {
  creatorId: string;
  cycleId: string;
  topic: string;
  locale?: string | null;
  geography?: string | null;
  window?: string;
  requestId: string;
  creatorContext?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

export type RunTrendResearchResult = {
  evidence: TrendEvidence;
  status: TrendResearchStatus;
};

/**
 * Run trend research for a cycle: progress stream + gateway (+ optional DB cache).
 */
export async function runTrendResearchOnce(
  prisma: PrismaClient,
  input: RunTrendResearchInput
): Promise<RunTrendResearchResult> {
  const env = input.env ?? process.env;
  const flags = getGoalCycleFeatureFlags(env);
  const creatorId = input.creatorId.trim();
  const cycleId = input.cycleId.trim();
  const requestId = input.requestId.trim();

  if (!requestId) {
    throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "request_id is required.", [
      { field: "request_id", issue: "required" }
    ]);
  }

  await markCycleResearching(prisma, creatorId, cycleId);

  const existing = await findTrendRunByRequestId(prisma, creatorId, requestId);
  if (existing?.status === "complete") {
    const evidence = evidenceFromStoredJson(existing.evidenceJson);
    if (evidence) {
      await appendTrendProgress(prisma, cycleId, "research_complete", {
        strength: evidence.composite_strength,
        cache_hit: true,
        mode: flags.trend_mode
      });
      const status = await getTrendResearchStatus(prisma, creatorId, cycleId, requestId, env);
      return { evidence, status };
    }
  }

  const request: TrendResearchRequest = {
    creator_id: creatorId,
    topic: input.topic,
    locale: input.locale ?? null,
    geography: input.geography ?? null,
    window: (input.window ?? "7d").trim() || "7d",
    creator_context: input.creatorContext ?? {},
    request_id: requestId,
    cycle_id: cycleId
  };

  const gateway = createTrendEvidenceGateway({
    env,
    prisma,
    timeoutMs: input.timeoutMs,
    onProgress: async (code, meta) => {
      await appendTrendProgress(prisma, cycleId, code, { ...meta, mode: flags.trend_mode });
    }
  });

  try {
    const evidence = await gateway.research(request);
    const safe = stripRawFromEvidence(evidence);
    if (safe.composite_strength === "weak") {
      await appendTrendProgress(prisma, cycleId, "evidence_weak", {
        strength: "weak",
        mode: flags.trend_mode
      });
    }
    if (safe.composite_strength === "history_only") {
      await appendTrendProgress(prisma, cycleId, "history_fallback", {
        strength: "history_only",
        mode: flags.trend_mode
      });
    }
    await appendTrendProgress(prisma, cycleId, "research_complete", {
      strength: safe.composite_strength,
      cache_hit: false,
      mode: flags.trend_mode
    });
    const status = await getTrendResearchStatus(prisma, creatorId, cycleId, requestId, env);
    return { evidence: safe, status };
  } catch (err) {
    const code =
      err instanceof Error && err.message.startsWith("trend_provider_timeout")
        ? "timeout"
        : err instanceof Error && err.message.startsWith("invalid_trend_research_request")
          ? "malformed_request"
          : "research_failed";
    await appendTrendProgress(prisma, cycleId, "research_failed", {
      mode: flags.trend_mode
    });
    throw new GoalCycleContractError(
      "GOAL_CYCLE_RESEARCH_UNAVAILABLE",
      "Trend research failed.",
      [{ field: "research", issue: code }]
    );
  }
}

export async function getTrendResearchStatus(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  requestId?: string | null,
  env: NodeJS.ProcessEnv = process.env
): Promise<TrendResearchStatus> {
  const row = await findGoalCycleForCreator(prisma, creatorId.trim(), cycleId.trim());
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }

  const flags = getGoalCycleFeatureFlags(env);
  const progressRows = await prisma.creatorGoalCycleProgress.findMany({
    where: {
      cycleId: row.id,
      messageCode: { in: [...TREND_PROGRESS_CODES] }
    },
    orderBy: { sequence: "asc" }
  });

  const progress: GoalCycleProgressEvent[] = progressRows.map((p) => {
    const meta =
      p.metadataJson && typeof p.metadataJson === "object" && !Array.isArray(p.metadataJson)
        ? (p.metadataJson as Record<string, unknown>)
        : {};
    return {
      sequence: p.sequence,
      phase: "research",
      message_code: p.messageCode,
      occurred_at: p.createdAt.toISOString(),
      retryable: meta.retryable === true
    };
  });

  let run = null as Awaited<ReturnType<typeof findTrendRunByRequestId>>;
  if (requestId?.trim()) {
    run = await findTrendRunByRequestId(prisma, creatorId.trim(), requestId.trim());
  } else {
    run = await prisma.goalCycleTrendRun.findFirst({
      where: { creatorId: creatorId.trim(), cycleId: row.id },
      orderBy: { startedAt: "desc" }
    });
  }

  const evidence = run ? evidenceFromStoredJson(run.evidenceJson) : null;
  const safeEvidence = evidence ? stripRawFromEvidence(evidence) : null;

  return {
    cycle_id: row.id,
    request_id: run?.requestId ?? requestId?.trim() ?? null,
    status: (run?.status as TrendResearchStatus["status"]) ?? "not_started",
    mode: flags.trend_mode,
    progress,
    evidence: safeEvidence,
    error_code: run?.errorCode ?? null,
    strength: run?.strength ?? safeEvidence?.composite_strength ?? null,
    confidence: run?.confidence ?? safeEvidence?.confidence ?? null
  };
}

/** Start research: inline (default for fixture/tests) or caller enqueues async. */
export async function startTrendResearch(
  prisma: PrismaClient,
  input: RunTrendResearchInput & { inline?: boolean }
): Promise<TrendResearchStatus> {
  const inline =
    input.inline === true ||
    getGoalCycleFeatureFlags(input.env).trend_mode === "fixture" ||
    getGoalCycleFeatureFlags(input.env).trend_mode === "history_only" ||
    getGoalCycleFeatureFlags(input.env).trend_mode === "disabled";

  if (inline) {
    const { status } = await runTrendResearchOnce(prisma, input);
    return status;
  }

  // Async path: mark researching and leave pending for the worker.
  await markCycleResearching(prisma, input.creatorId, input.cycleId);
  return getTrendResearchStatus(
    prisma,
    input.creatorId,
    input.cycleId,
    input.requestId,
    input.env
  );
}
