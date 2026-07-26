/**
 * Slice 2d-3 — Daily rollup job for creator external post metrics.
 * @see docs/distribution/EXTERNAL_POST_METRICS_SLICE2.md Phase 2d
 */

import type { PrismaClient } from "@prisma/client";
import { computeDailyRollups } from "./external-metric-rollup-service.js";

const WRITER = "external_metric_daily_rollup_job";
const DEFAULT_LOOKBACK_DAYS = 2;

export type RunExternalMetricDailyRollupOnceArgs = {
  prisma: PrismaClient;
  now?: Date;
  /** UTC days to recompute ending at `now` (inclusive). Default 2. */
  lookbackDays?: number;
  /** Optional: restrict cycle to one Relay creator id (ops / replay). */
  creatorId?: string;
};

export type ExternalMetricDailyRollupCreatorResult = {
  creator_id: string;
  upserted: number;
  since: string;
  until: string;
};

export type ExternalMetricDailyRollupJobResult = {
  cycle_started_at: string;
  lookback_days: number;
  creators_processed: number;
  total_upserted: number;
  writer: string;
  creators: ExternalMetricDailyRollupCreatorResult[];
};

function rollupLookbackDays(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw) || raw < 0) return DEFAULT_LOOKBACK_DAYS;
  return Math.min(Math.floor(raw), 31);
}

function rollupWindow(now: Date, lookbackDays: number): { since: Date; until: Date } {
  const until = now;
  const since = new Date(now.getTime());
  since.setUTCDate(since.getUTCDate() - lookbackDays);
  since.setUTCHours(0, 0, 0, 0);
  return { since, until };
}

/**
 * Creators with linked distribution, metric snapshots, CSV insights, or post-scoped Relay engagement.
 */
export async function listActiveExternalMetricCreatorIds(
  prisma: PrismaClient,
  since: Date,
  creatorId?: string
): Promise<string[]> {
  const single = creatorId?.trim();
  if (single) return [single];

  const ids = new Set<string>();

  const [snapshotCreators, attemptCreators, insightCreators, relayCreators, telemetryCreators] =
    await Promise.all([
      prisma.externalPostMetricSnapshot.findMany({
        where: { capturedAt: { gte: since } },
        select: { creatorId: true },
        distinct: ["creatorId"]
      }),
      prisma.postDistributionAttempt.findMany({
        where: {
          status: "posted",
          NOT: { externalUrl: null }
        },
        select: { creatorId: true },
        distinct: ["creatorId"]
      }),
      prisma.patreonInsightsPostMetric.findMany({
        select: { creatorId: true },
        distinct: ["creatorId"]
      }),
      prisma.relayEngagementEvent.findMany({
        where: {
          occurredAt: { gte: since },
          postId: { not: null }
        },
        select: { creatorId: true },
        distinct: ["creatorId"]
      }),
      prisma.platformTelemetryEvent.findMany({
        where: {
          occurredAt: { gte: since },
          eventName: { in: ["post_view", "post_liked", "comment_created"] }
        },
        select: { creatorId: true },
        distinct: ["creatorId"]
      })
    ]);

  for (const row of [
    ...snapshotCreators,
    ...attemptCreators,
    ...insightCreators,
    ...relayCreators,
    ...telemetryCreators
  ]) {
    const cid = row.creatorId?.trim() ?? "";
    if (cid) ids.add(cid);
  }

  return [...ids].sort();
}

export async function runExternalMetricDailyRollupOnce(
  args: RunExternalMetricDailyRollupOnceArgs
): Promise<ExternalMetricDailyRollupJobResult> {
  const now = args.now ?? new Date();
  const lookbackDays = rollupLookbackDays(args.lookbackDays);
  const { since, until } = rollupWindow(now, lookbackDays);
  const computedAt = now;

  const creatorIds = await listActiveExternalMetricCreatorIds(
    args.prisma,
    since,
    args.creatorId
  );

  const creators: ExternalMetricDailyRollupCreatorResult[] = [];
  let totalUpserted = 0;

  for (const creatorId of creatorIds) {
    const result = await computeDailyRollups(args.prisma, creatorId, {
      since,
      until,
      computedAt
    });
    creators.push({
      creator_id: result.creator_id,
      upserted: result.upserted,
      since: result.since,
      until: result.until
    });
    totalUpserted += result.upserted;
  }

  return {
    cycle_started_at: now.toISOString(),
    lookback_days: lookbackDays,
    creators_processed: creators.length,
    total_upserted: totalUpserted,
    writer: WRITER,
    creators
  };
}

export function externalMetricDailyRollupIntervalFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_EXTERNAL_METRIC_DAILY_ROLLUP_MS?.trim();
  if (raw === undefined || raw === "") return null;
  if (raw === "0") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return null;
  return Math.floor(n);
}

export function externalMetricDailyRollupLookbackDaysFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.RELAY_EXTERNAL_METRIC_DAILY_ROLLUP_LOOKBACK_DAYS?.trim();
  if (!raw) return DEFAULT_LOOKBACK_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_LOOKBACK_DAYS;
  return Math.min(Math.floor(n), 31);
}
