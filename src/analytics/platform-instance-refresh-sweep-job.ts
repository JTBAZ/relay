/**
 * Performance intelligence Phase 4 — conservative platform instance refresh sweep.
 * Server-side hygiene only (Relay rollups + stale marking). No extension scraping.
 */

import type { PrismaClient } from "@prisma/client";
import {
  platformInstanceStaleAfterMsFromEnv,
  refreshRelayPlatformInstanceRollup,
  REFRESH_POLICY_CONSERVATIVE
} from "./platform-instance-refresh-service.js";

const DEFAULT_BATCH_SIZE = 40;

export type PlatformInstanceRefreshSweepResult = {
  cycle_started_at: string;
  stale_after_ms: number;
  instances_scanned: number;
  relay_refreshed: number;
  marked_stale: number;
  creators_rollup_refreshed: string[];
  writer: string;
};

export function platformInstanceRefreshSweepIntervalFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_PLATFORM_INSTANCE_REFRESH_SWEEP_MS?.trim();
  if (raw === undefined || raw === "") return null;
  if (raw === "0") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 300_000) return null;
  return Math.floor(n);
}

export function platformInstanceRefreshSweepBatchFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.RELAY_PLATFORM_INSTANCE_REFRESH_SWEEP_BATCH?.trim();
  if (!raw) return DEFAULT_BATCH_SIZE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(n), 200);
}

export async function runPlatformInstanceRefreshSweepOnce(args: {
  prisma: PrismaClient;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  creatorId?: string;
}): Promise<PlatformInstanceRefreshSweepResult> {
  const env = args.env ?? process.env;
  const now = args.now ?? new Date();
  const staleAfterMs = platformInstanceStaleAfterMsFromEnv(env);
  const staleCutoff = new Date(now.getTime() - staleAfterMs);
  const batchSize = platformInstanceRefreshSweepBatchFromEnv(env);
  const creatorFilter = args.creatorId?.trim();

  const instances = await args.prisma.platformInstance.findMany({
    where: {
      refreshPolicy: REFRESH_POLICY_CONSERVATIVE,
      status: { in: ["active", "stale"] },
      ...(creatorFilter ? { creatorId: creatorFilter } : {}),
      OR: [{ lastRefreshedAt: null }, { lastRefreshedAt: { lt: staleCutoff } }]
    },
    orderBy: [{ lastRefreshedAt: "asc" }, { linkedAt: "asc" }],
    take: batchSize,
    select: {
      id: true,
      creatorId: true,
      postId: true,
      destination: true,
      externalUrl: true,
      externalId: true,
      attemptId: true,
      linkSource: true,
      status: true,
      refreshPolicy: true,
      linkedAt: true,
      lastRefreshedAt: true,
      lastManualRefreshRequestedAt: true
    }
  });

  let relayRefreshed = 0;
  let markedStale = 0;
  const creatorsRollupRefreshed = new Set<string>();

  for (const instance of instances) {
    const anchor = instance.lastRefreshedAt ?? instance.linkedAt;
    const isStale = now.getTime() - anchor.getTime() > staleAfterMs;

    if (instance.destination === "relay") {
      await refreshRelayPlatformInstanceRollup(args.prisma, instance, now, env);
      creatorsRollupRefreshed.add(instance.creatorId);
      relayRefreshed += 1;
      continue;
    }

    if (isStale && instance.status !== "stale") {
      await args.prisma.platformInstance.update({
        where: { id: instance.id },
        data: { status: "stale", updatedAt: now }
      });
      markedStale += 1;
    }
  }

  return {
    cycle_started_at: now.toISOString(),
    stale_after_ms: staleAfterMs,
    instances_scanned: instances.length,
    relay_refreshed: relayRefreshed,
    marked_stale: markedStale,
    creators_rollup_refreshed: [...creatorsRollupRefreshed].sort(),
    writer: "platform_instance_refresh_sweep"
  };
}
