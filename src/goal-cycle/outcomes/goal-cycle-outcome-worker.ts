/**
 * Goal Cycle outcome refresh worker (VS9-T05).
 * Refreshes snapshots for open cycles only — never suggests or terminalizes completion.
 */

import type { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import {
  RELAY_BULLMQ_DEFAULT_JOB_OPTIONS,
  relayBullMqIoredisOptions
} from "../../jobs/bullmq-shared.js";
import {
  RELAY_JOB_QUEUE_NAMES,
  type GoalCycleOutcomeRefreshJobData
} from "../../jobs/queue-names.js";
import { getGoalCycleFeatureFlags } from "../contracts.js";
import { refreshGoalCycleOutcomeSnapshot } from "./goal-cycle-outcome-service.js";

const DEFAULT_EVERY_MS = 6 * 60 * 60 * 1000;
const DEFAULT_BATCH = 40;

export function goalCycleOutcomeRefreshRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS?.trim();
  if (raw === "0" || raw === "off" || raw === "false") return null;
  if (!raw) return DEFAULT_EVERY_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return DEFAULT_EVERY_MS;
  return Math.floor(n);
}

export type GoalCycleOutcomeRefreshResult = {
  cycle_started_at: string;
  scanned: number;
  refreshed: number;
  failed: number;
  skipped_reason: string | null;
};

/**
 * Idempotent sweep: refresh outcome snapshots for active / completion_suggested cycles.
 * Does not call suggest/confirm/dismiss.
 */
export async function runGoalCycleOutcomeRefreshOnce(
  prisma: PrismaClient,
  options: {
    creatorId?: string;
    cycleId?: string;
    batchSize?: number;
    now?: Date;
    env?: NodeJS.ProcessEnv;
    log?: (msg: string, ctx?: Record<string, unknown>) => void;
  } = {}
): Promise<GoalCycleOutcomeRefreshResult> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const log = options.log ?? (() => undefined);
  const fromEnv = Number(env.RELAY_GOAL_CYCLE_OUTCOME_REFRESH_BATCH);
  const batchSize = Math.min(
    200,
    Math.max(
      1,
      options.batchSize ??
        (Number.isFinite(fromEnv) && fromEnv > 0 ? Math.floor(fromEnv) : DEFAULT_BATCH)
    )
  );

  if (!getGoalCycleFeatureFlags(env).enabled) {
    log("goal-cycle-outcome-refresh: skipped — goal cycle disabled");
    return {
      cycle_started_at: now.toISOString(),
      scanned: 0,
      refreshed: 0,
      failed: 0,
      skipped_reason: "goal_cycle_disabled"
    };
  }

  const where: {
    state: { in: string[] };
    creatorId?: string;
    id?: string;
  } = {
    state: { in: ["active", "completion_suggested"] }
  };
  if (options.creatorId?.trim()) where.creatorId = options.creatorId.trim();
  if (options.cycleId?.trim()) where.id = options.cycleId.trim();

  const rows = await prisma.creatorGoalCycle.findMany({
    where,
    orderBy: { updatedAt: "asc" },
    take: batchSize,
    select: { id: true, creatorId: true }
  });

  let refreshed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await refreshGoalCycleOutcomeSnapshot(prisma, row.creatorId, row.id, { now });
      refreshed += 1;
    } catch (err) {
      failed += 1;
      log("goal-cycle-outcome-refresh: cycle failed", {
        creator_id: row.creatorId,
        cycle_id: row.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  log("goal-cycle-outcome-refresh: tick", {
    scanned: rows.length,
    refreshed,
    failed
  });

  return {
    cycle_started_at: now.toISOString(),
    scanned: rows.length,
    refreshed,
    failed,
    skipped_reason: null
  };
}

export async function enqueueGoalCycleOutcomeRefreshJob(
  data: GoalCycleOutcomeRefreshJobData = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<{ job_id: string }> {
  const queue = new Queue(RELAY_JOB_QUEUE_NAMES.GOAL_CYCLE_OUTCOME_REFRESH, {
    connection: relayBullMqIoredisOptions(env) as never,
    defaultJobOptions: RELAY_BULLMQ_DEFAULT_JOB_OPTIONS
  });
  try {
    const jobId = data.cycleId
      ? `gc_outcome:${data.creatorId ?? "any"}:${data.cycleId}`.slice(0, 120)
      : undefined;
    const job = await queue.add("goal_cycle_outcome_refresh", data, {
      ...(jobId ? { jobId } : {}),
      ...RELAY_BULLMQ_DEFAULT_JOB_OPTIONS
    });
    return { job_id: String(job.id ?? jobId ?? "goal_cycle_outcome_refresh") };
  } finally {
    await queue.close();
  }
}
