/**
 * Hourly Autopost distribution-rule discovery + draft materialization.
 */

import type { PrismaClient } from "@prisma/client";
import { reconcileDistributionRules } from "./distribution-rule-service.js";

export const DEFAULT_DISTRIBUTION_RULES_INTERVAL_MS = 3_600_000;
export const MIN_DISTRIBUTION_RULES_INTERVAL_MS = 60_000;

export type DistributionRulesReconcileResult = {
  rules: number;
  runs_created: number;
  materialized: number;
  failed: number;
};

export function distributionRulesRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_AUTOPOST_DISTRIBUTION_RULES_MS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_DISTRIBUTION_RULES_INTERVAL_MS;
  if (raw === "0") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_DISTRIBUTION_RULES_INTERVAL_MS) return null;
  return Math.floor(n);
}

export async function runDistributionRulesReconcileOnce(
  prisma: PrismaClient,
  options?: { creatorId?: string; now?: Date; log?: (msg: string, ctx?: Record<string, unknown>) => void }
): Promise<DistributionRulesReconcileResult> {
  const result = await reconcileDistributionRules(prisma, {
    creatorId: options?.creatorId,
    now: options?.now
  });
  options?.log?.("autopost-distribution-rules: reconcile", result);
  return result;
}

export interface DistributionRulesRunner {
  start(): void;
  stop(): Promise<void>;
  processOnce(): Promise<DistributionRulesReconcileResult>;
}

export interface InProcessDistributionRulesRunnerOptions {
  prisma: PrismaClient;
  pollIntervalMs?: number;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
}

export class InProcessDistributionRulesRunner implements DistributionRulesRunner {
  private readonly prisma: PrismaClient;
  private readonly pollIntervalMs: number;
  private readonly log?: (msg: string, ctx?: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  public constructor(opts: InProcessDistributionRulesRunnerOptions) {
    this.prisma = opts.prisma;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_DISTRIBUTION_RULES_INTERVAL_MS;
    this.log = opts.log;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processOnce().catch((err) => {
        this.log?.("autopost-distribution-rules: tick failed", {
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

  public async processOnce(): Promise<DistributionRulesReconcileResult> {
    if (this.inFlight) {
      return { rules: 0, runs_created: 0, materialized: 0, failed: 0 };
    }
    this.inFlight = true;
    try {
      return await runDistributionRulesReconcileOnce(this.prisma, { log: this.log });
    } finally {
      this.inFlight = false;
    }
  }
}

export function startDistributionRulesWorker(
  prisma: PrismaClient,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): DistributionRulesRunner {
  const every = distributionRulesRepeatEveryMsFromEnv();
  if (every === null) {
    return {
      start: () => undefined,
      stop: async () => undefined,
      processOnce: async () => ({
        rules: 0,
        runs_created: 0,
        materialized: 0,
        failed: 0
      })
    };
  }
  const runner = new InProcessDistributionRulesRunner({
    prisma,
    pollIntervalMs: every,
    log
  });
  runner.start();
  return runner;
}
