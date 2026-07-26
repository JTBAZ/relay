/**
 * @fileoverview In-process interval runner that drains `media_storage_purge_queue` via {@link processMediaStoragePurgeSweepOnce}.
 * @description Same process shape as other workers — disable with `RELAY_MEDIA_STORAGE_PURGE_SWEEP_MS=0`.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `MediaStoragePurgeQueue`
 */

import type { PrismaClient } from "@prisma/client";
import { getR2ClientConfigFromEnv } from "./r2-config.js";
import {
  mediaStoragePurgeBatchFromEnv,
  processMediaStoragePurgeBatch,
  type MediaStoragePurgeStats
} from "./media-storage-purge-service.js";

/** Default poll interval when env empty. */
export const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h
/** Minimum interval clamp for timer stability. */
export const MIN_SWEEP_INTERVAL_MS = 250;

/** Lifecycle interface for tests and graceful shutdown. */
export interface MediaStoragePurgeRunner {
  start(): void;
  stop(): Promise<void>;
  processOnce(): Promise<{ scanned: number; deletedFromR2: number; failed: number; skippedNoR2: boolean }>;
}

/** Options for {@link InProcessMediaStoragePurgeRunner}. */
export interface MediaStoragePurgeWorkerOptions {
  prisma: PrismaClient;
  pollIntervalMs?: number;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
}

/** Options for {@link processMediaStoragePurgeSweepOnce}. */
export type ProcessMediaStoragePurgeSweepOnceOptions = {
  batchSize?: number;
  now?: Date;
  /** Single `MediaStoragePurgeQueue.id` when eligible (BullMQ). */
  purgeQueueRowId?: string;
};

/**
 * One R2 purge sweep: env R2 config + bounded batch from `media_storage_purge_queue`.
 */
export async function processMediaStoragePurgeSweepOnce(
  prisma: PrismaClient,
  opts?: ProcessMediaStoragePurgeSweepOnceOptions
): Promise<MediaStoragePurgeStats> {
  const r2 = getR2ClientConfigFromEnv();
  return processMediaStoragePurgeBatch(prisma, r2, {
    batchSize: opts?.batchSize ?? mediaStoragePurgeBatchFromEnv(),
    now: opts?.now,
    purgeQueueRowId: opts?.purgeQueueRowId
  });
}

/** `setInterval`-driven purge loop with overlap guard. */
export class InProcessMediaStoragePurgeRunner implements MediaStoragePurgeRunner {
  private readonly prisma: PrismaClient;
  private readonly pollIntervalMs: number;
  private readonly log: (msg: string, ctx?: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<unknown> | null = null;
  private stopping = false;

  public constructor(opts: MediaStoragePurgeWorkerOptions) {
    this.prisma = opts.prisma;
    this.pollIntervalMs = Math.max(MIN_SWEEP_INTERVAL_MS, opts.pollIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);
    this.log = opts.log ?? (() => undefined);
  }

  /** Starts the interval loop (no-op if already running). */
  public start(): void {
    if (this.timer || this.stopping) return;
    this.timer = setInterval(() => {
      if (this.inFlight) return;
      this.inFlight = this.processOnce()
        .catch((err) => {
          this.log("media-storage-purge: tick failed", {
            error: err instanceof Error ? err.message : String(err)
          });
        })
        .finally(() => {
          this.inFlight = null;
        });
    }, this.pollIntervalMs);
    if (typeof (this.timer as { unref?: () => void }).unref === "function") {
      (this.timer as { unref: () => void }).unref();
    }
  }

  /** Stops timer and awaits in-flight batch. */
  public async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      try {
        await this.inFlight;
      } catch {
        /* swallow */
      }
    }
    this.stopping = false;
  }

  /**
   * Runs a single purge batch against env-configured R2.
   * @async
   * @throws {Error} Delegates from batch processor / Prisma.
   */
  public async processOnce(): Promise<{
    scanned: number;
    deletedFromR2: number;
    failed: number;
    skippedNoR2: boolean;
  }> {
    return processMediaStoragePurgeSweepOnce(this.prisma);
  }
}

export function mediaStoragePurgeSweepRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = (env.RELAY_MEDIA_STORAGE_PURGE_SWEEP_MS ?? "").trim();
  const parsed = raw === "" ? DEFAULT_SWEEP_INTERVAL_MS : Number(raw);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }
  return Math.max(MIN_SWEEP_INTERVAL_MS, Math.floor(parsed));
}

/**
 * Honors `RELAY_MEDIA_STORAGE_PURGE_SWEEP_MS` (empty = 1h, 0 = disabled). R2 must be configured
 * or each tick becomes a no-op (rows stay queued).
 * @param prisma Prisma client.
 * @param log Optional structured logger.
 * @returns Runner instance or `null` when disabled.
 */
export function startMediaStoragePurgeWorker(
  prisma: PrismaClient,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): MediaStoragePurgeRunner | null {
  const every = mediaStoragePurgeSweepRepeatEveryMsFromEnv();
  if (every === null) {
    return null;
  }
  const runner = new InProcessMediaStoragePurgeRunner({
    prisma,
    pollIntervalMs: every,
    log
  });
  runner.start();
  return runner;
}
