/**
 * Hourly Autopost schedule-series reconciliation (two-month horizon + JIT drafts).
 */

import type { PrismaClient } from "@prisma/client";
import { reconcileAllActiveSeries } from "./schedule-series-service.js";

export const DEFAULT_SCHEDULE_SERIES_INTERVAL_MS = 3_600_000;
export const MIN_SCHEDULE_SERIES_INTERVAL_MS = 60_000;

export type ScheduleSeriesReconcileResult = {
  series: number;
  ensured: number;
  materialized: number;
  completed: number;
};

export function scheduleSeriesRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_AUTOPOST_SCHEDULE_SERIES_MS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_SCHEDULE_SERIES_INTERVAL_MS;
  if (raw === "0") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_SCHEDULE_SERIES_INTERVAL_MS) return null;
  return Math.floor(n);
}

export async function runScheduleSeriesReconcileOnce(
  prisma: PrismaClient,
  options?: { creatorId?: string; now?: Date; log?: (msg: string, ctx?: Record<string, unknown>) => void }
): Promise<ScheduleSeriesReconcileResult> {
  const result = await reconcileAllActiveSeries(prisma, {
    creatorId: options?.creatorId,
    now: options?.now
  });
  options?.log?.("autopost-schedule-series: reconcile", result);
  return result;
}

export interface ScheduleSeriesRunner {
  start(): void;
  stop(): Promise<void>;
  processOnce(): Promise<ScheduleSeriesReconcileResult>;
}

export interface InProcessScheduleSeriesRunnerOptions {
  prisma: PrismaClient;
  pollIntervalMs?: number;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
}

export class InProcessScheduleSeriesRunner implements ScheduleSeriesRunner {
  private readonly prisma: PrismaClient;
  private readonly pollIntervalMs: number;
  private readonly log?: (msg: string, ctx?: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  public constructor(opts: InProcessScheduleSeriesRunnerOptions) {
    this.prisma = opts.prisma;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_SCHEDULE_SERIES_INTERVAL_MS;
    this.log = opts.log;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processOnce().catch((err) => {
        this.log?.("autopost-schedule-series: tick failed", {
          error: err instanceof Error ? err.message : String(err)
        });
      });
    }, this.pollIntervalMs);
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async processOnce(): Promise<ScheduleSeriesReconcileResult> {
    if (this.inFlight) {
      return { series: 0, ensured: 0, materialized: 0, completed: 0 };
    }
    this.inFlight = true;
    try {
      return await runScheduleSeriesReconcileOnce(this.prisma, { log: this.log });
    } finally {
      this.inFlight = false;
    }
  }
}

export function startScheduleSeriesWorker(
  prisma: PrismaClient,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): ScheduleSeriesRunner {
  const every = scheduleSeriesRepeatEveryMsFromEnv();
  if (every === null) {
    return {
      start: () => undefined,
      stop: async () => undefined,
      processOnce: async () => ({ series: 0, ensured: 0, materialized: 0, completed: 0 })
    };
  }
  const runner = new InProcessScheduleSeriesRunner({
    prisma,
    pollIntervalMs: every,
    log
  });
  runner.start();
  return runner;
}
