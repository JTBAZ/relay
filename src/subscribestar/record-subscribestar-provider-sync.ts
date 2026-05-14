/**
 * Persist SubscribeStar post-ingest health on `CreatorProviderSyncState` (best-effort).
 */

import { ProviderKind, type Prisma, type PrismaClient } from "@prisma/client";
import type { ApplyBatchResult } from "../ingest/types.js";

export async function recordSubscribeStarLastPostSync(
  prisma: PrismaClient,
  creatorId: string,
  result: ApplyBatchResult,
  traceId: string
): Promise<void> {
  const payload: Prisma.InputJsonValue = {
    trace_id: traceId,
    recorded_at: new Date().toISOString(),
    job_id: result.job_id,
    posts_written: result.posts_written,
    media_upserted: result.media_upserted,
    campaigns_upserted: result.campaigns_upserted,
    tiers_upserted: result.tiers_upserted,
    tombstones_applied: result.tombstones_applied,
    idempotent_skips: result.idempotent_skips
  };

  await prisma.creatorProviderSyncState.upsert({
    where: {
      creatorId_provider: {
        creatorId,
        provider: ProviderKind.subscribestar
      }
    },
    create: {
      creatorId,
      provider: ProviderKind.subscribestar,
      lastPostSync: payload
    },
    update: {
      lastPostSync: payload
    }
  });
}
