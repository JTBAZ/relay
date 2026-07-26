/**
 * Goal Cycle trend research BullMQ worker + enqueue (VS3-T04).
 * One-shot jobs only — not a repeatable sweep.
 */

import type { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import {
  RELAY_BULLMQ_DEFAULT_JOB_OPTIONS,
  relayBullMqIoredisOptions
} from "../../jobs/bullmq-shared.js";
import {
  RELAY_JOB_QUEUE_NAMES,
  type GoalCycleTrendResearchJobData
} from "../../jobs/queue-names.js";
import { runTrendResearchOnce } from "./trend-research-service.js";

export async function processGoalCycleTrendResearchJob(
  prisma: PrismaClient,
  data: GoalCycleTrendResearchJobData,
  options: {
    env?: NodeJS.ProcessEnv;
    log?: (msg: string, ctx?: Record<string, unknown>) => void;
  } = {}
): Promise<void> {
  const log = options.log ?? (() => undefined);
  log("goal-cycle-trend-research: start", {
    creator_id: data.creatorId,
    cycle_id: data.cycleId,
    request_id: data.requestId
  });
  await runTrendResearchOnce(prisma, {
    creatorId: data.creatorId,
    cycleId: data.cycleId,
    requestId: data.requestId,
    topic: data.topic,
    locale: data.locale ?? null,
    geography: data.geography ?? null,
    window: data.window,
    env: options.env
  });
  log("goal-cycle-trend-research: complete", {
    creator_id: data.creatorId,
    cycle_id: data.cycleId,
    request_id: data.requestId
  });
}

export async function enqueueGoalCycleTrendResearchJob(
  data: GoalCycleTrendResearchJobData,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ job_id: string }> {
  const queue = new Queue(RELAY_JOB_QUEUE_NAMES.GOAL_CYCLE_TREND_RESEARCH, {
    connection: relayBullMqIoredisOptions(env) as never,
    defaultJobOptions: RELAY_BULLMQ_DEFAULT_JOB_OPTIONS
  });
  try {
    const jobId = `${data.creatorId}:${data.requestId}`.slice(0, 120);
    const job = await queue.add("goal_cycle_trend_research", data, {
      jobId,
      ...RELAY_BULLMQ_DEFAULT_JOB_OPTIONS
    });
    return { job_id: String(job.id ?? jobId) };
  } finally {
    await queue.close();
  }
}
