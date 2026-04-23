/**
 * PE-J (BO-P4-02) — account deletion sweeper.
 *
 * Periodically scans `AccountDeletion` rows whose grace has elapsed and runs the
 * `executeDeletion` purge. Same interface-based shape as the notification delivery worker:
 *   - InProcessAccountDeletionRunner ships now (single-node, setInterval loop)
 *   - Future BullMQ runner is a one-line DI swap when Redis lands -- same processOnce body,
 *     same idempotency story (the `pending` -> `executed` flip is atomic in the service).
 *
 * The sweep cadence is intentionally slow (default 1h). The grace period is measured in days
 * so polling more aggressively yields no UX win and only wastes Postgres round-trips. Lower
 * the interval temporarily for tests via the env var.
 */

import type { PrismaClient } from "@prisma/client";

import { executeDeletion, listDueDeletions } from "./account-deletion-service.js";

export const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h
export const MIN_SWEEP_INTERVAL_MS = 250;
export const DEFAULT_BATCH_SIZE = 25;

export interface AccountDeletionRunner {
  start(): void;
  stop(): Promise<void>;
  processOnce(): Promise<AccountDeletionStats>;
}

export interface AccountDeletionStats {
  scanned: number;
  executed: number;
  failed: number;
}

export interface InProcessRunnerOptions {
  prisma: PrismaClient;
  pollIntervalMs?: number;
  batchSize?: number;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
}

export class InProcessAccountDeletionRunner implements AccountDeletionRunner {
  private readonly prisma: PrismaClient;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly log: (msg: string, ctx?: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<unknown> | null = null;
  private stopping = false;

  public constructor(opts: InProcessRunnerOptions) {
    this.prisma = opts.prisma;
    this.pollIntervalMs = Math.max(
      MIN_SWEEP_INTERVAL_MS,
      opts.pollIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
    );
    this.batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    this.log = opts.log ?? (() => undefined);
  }

  public start(): void {
    if (this.timer || this.stopping) return;
    this.timer = setInterval(() => {
      if (this.inFlight) return;
      this.inFlight = this.processOnce()
        .catch((err) => {
          this.log("account-deletion-sweep: tick failed", {
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

  public async processOnce(): Promise<AccountDeletionStats> {
    const due = await listDueDeletions(this.prisma, { limit: this.batchSize });
    if (due.length === 0) {
      return { scanned: 0, executed: 0, failed: 0 };
    }
    let executed = 0;
    let failed = 0;
    for (const row of due) {
      try {
        const result = await executeDeletion(this.prisma, row.id);
        if (result && result.record.status === "executed") {
          executed += 1;
        }
      } catch (err) {
        failed += 1;
        // One bad row must not stall the whole batch -- cancelled / executed rows are skipped
        // by the listDueDeletions filter on the next tick, and a transient DB error here just
        // means we'll retry that account next sweep.
        this.log("account-deletion-sweep: row failed", {
          deletionId: row.id,
          accountId: row.accountId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    return { scanned: due.length, executed, failed };
  }
}

/**
 * Bootstrap helper. Honors `RELAY_ACCOUNT_DELETION_SWEEP_MS` (=0 disables; default 1h with the
 * floor applied). Returns null when the worker is disabled so callers can skip the stop hook.
 */
export function startAccountDeletionWorker(
  prisma: PrismaClient,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): AccountDeletionRunner | null {
  const raw = (process.env.RELAY_ACCOUNT_DELETION_SWEEP_MS ?? "").trim();
  const parsed = raw === "" ? DEFAULT_SWEEP_INTERVAL_MS : Number(raw);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }
  const runner = new InProcessAccountDeletionRunner({
    prisma,
    pollIntervalMs: parsed,
    log
  });
  runner.start();
  return runner;
}
