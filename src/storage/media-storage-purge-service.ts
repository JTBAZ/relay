/**
 * @fileoverview Asynchronous purge pipeline: enqueue R2 keys when `MediaAsset` rows disappear, sweep queue with bounded retries + `deleteR2Object`.
 * @description Reasons distinguish Discord staging discard vs unified library staging. Worker tick lives in `media-storage-purge-worker.ts`.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `MediaStoragePurgeQueue`, `MediaAsset`
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { R2ClientConfig } from "./r2-config.js";
import { deleteR2Object } from "./relay-upload-r2.js";

/**
 * Staged Discord capture discarded via legacy DELETE `/api/v1/relay/discord/staging/:mediaId`.
 * Prefer unified `/api/v1/relay/library/staging` + `MEDIA_STORAGE_PURGE_REASON_LIBRARY_STAGING` for new code.
 */
export const MEDIA_STORAGE_PURGE_REASON_DISCORD_STAGING = "DISCORD_STAGING_REMOVED" as const;

/** Staged media discarded via DELETE `/api/v1/relay/library/staging/:mediaId` (Discord + Relay upload). */
export const MEDIA_STORAGE_PURGE_REASON_LIBRARY_STAGING = "LIBRARY_STAGING_REMOVED" as const;

/** Default batch size when env override absent. */
export const DEFAULT_PURGE_BATCH = 25;

/** Rows exceeding this attempt count stall for operators. */
export const MAX_PURGE_ATTEMPTS = 30;

/**
 * Soft-delay before queue row becomes eligible (`RELAY_MEDIA_STORAGE_PURGE_DELAY_MS`).
 */
export function mediaStoragePurgeDelayMsFromEnv(): number {
  const raw = process.env.RELAY_MEDIA_STORAGE_PURGE_DELAY_MS?.trim();
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Batch cap from `RELAY_MEDIA_STORAGE_PURGE_BATCH` (max 500). */
export function mediaStoragePurgeBatchFromEnv(): number {
  const raw = process.env.RELAY_MEDIA_STORAGE_PURGE_BATCH?.trim();
  if (!raw) return DEFAULT_PURGE_BATCH;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : DEFAULT_PURGE_BATCH;
}

/** Input for {@link enqueueMediaStoragePurge} inside a larger transaction. */
export type EnqueueMediaStoragePurgeInput = {
  storageKey: string;
  creatorId: string;
  formerMediaId?: string | null;
  reason: string;
  /** Added to `Date.now()` for `eligibleAt` (e.g. long soft-delete window). */
  delayMs?: number;
};

/**
 * Record an R2 key for asynchronous deletion. Caller removes the `MediaAsset` row in the same transaction.
 * @async
 * @throws {Error} Prisma create errors on the transaction client.
 * @param tx Active Prisma transaction client.
 */
export async function enqueueMediaStoragePurge(
  tx: Prisma.TransactionClient,
  input: EnqueueMediaStoragePurgeInput
): Promise<void> {
  const key = input.storageKey.trim();
  if (!key) return;
  const delayMs = input.delayMs ?? mediaStoragePurgeDelayMsFromEnv();
  const eligibleAt = new Date(Date.now() + delayMs);
  await tx.mediaStoragePurgeQueue.create({
    data: {
      storageKey: key,
      creatorId: input.creatorId,
      formerMediaId: input.formerMediaId?.trim() || null,
      reason: input.reason,
      eligibleAt
    }
  });
}

/** Counters from one {@link processMediaStoragePurgeBatch} pass. */
export type MediaStoragePurgeStats = {
  scanned: number;
  deletedFromR2: number;
  failed: number;
  skippedNoR2: boolean;
};

/**
 * Process pending rows whose `eligibleAt` has passed: delete R2 object, then remove queue row.
 * Rows with `attempts >= MAX_PURGE_ATTEMPTS` are left for operators (not retried forever).
 * @async
 * @throws {Error} Surprising Prisma failures outside per-row catch (batch load).
 * @param prisma Prisma client.
 * @param r2 R2 config or `null` to no-op (returns `skippedNoR2: true`).
 */
export async function processMediaStoragePurgeBatch(
  prisma: PrismaClient,
  r2: R2ClientConfig | null,
  options?: { batchSize?: number; now?: Date; purgeQueueRowId?: string }
): Promise<MediaStoragePurgeStats> {
  if (!r2) {
    return { scanned: 0, deletedFromR2: 0, failed: 0, skippedNoR2: true };
  }
  const now = options?.now ?? new Date();
  const targeted = options?.purgeQueueRowId?.trim();
  const take = targeted ? 1 : (options?.batchSize ?? mediaStoragePurgeBatchFromEnv());
  const rows = await prisma.mediaStoragePurgeQueue.findMany({
    where: {
      eligibleAt: { lte: now },
      attempts: { lt: MAX_PURGE_ATTEMPTS },
      ...(targeted ? { id: targeted } : {})
    },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true, storageKey: true }
  });
  if (rows.length === 0) {
    return { scanned: 0, deletedFromR2: 0, failed: 0, skippedNoR2: false };
  }
  let deletedFromR2 = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deleteR2Object(r2, row.storageKey);
      await prisma.mediaStoragePurgeQueue.delete({ where: { id: row.id } });
      deletedFromR2 += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.mediaStoragePurgeQueue.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError: msg.slice(0, 2000)
        }
      });
    }
  }
  return { scanned: rows.length, deletedFromR2, failed, skippedNoR2: false };
}
