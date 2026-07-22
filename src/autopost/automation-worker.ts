/**
 * Autopost Automations reconcile worker (VS4 / B11).
 * Coordinates trigger occurrence claim → prepareAutomationOccurrenceWork → skip/expiry.
 * Behind RELAY_FEATURE_AUTOMATIONS + RELAY_AUTOPOST_AUTOMATIONS_MS kill switch.
 */

import type { PrismaClient } from "@prisma/client";
import {
  reconcileAutomations,
  type AutomationsReconcileResult
} from "./automation-reconcile-service.js";

export const DEFAULT_AUTOMATIONS_INTERVAL_MS = 3_600_000;
export const MIN_AUTOMATIONS_INTERVAL_MS = 60_000;

export function automationsRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_AUTOPOST_AUTOMATIONS_MS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_AUTOMATIONS_INTERVAL_MS;
  if (raw === "0") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_AUTOMATIONS_INTERVAL_MS) return null;
  return Math.floor(n);
}

export async function runAutomationsReconcileOnce(
  prisma: PrismaClient,
  options?: {
    creatorId?: string;
    now?: Date;
    log?: (msg: string, ctx?: Record<string, unknown>) => void;
  }
): Promise<AutomationsReconcileResult> {
  const result = await reconcileAutomations(prisma, {
    creatorId: options?.creatorId,
    now: options?.now
  });
  let notifications_delivered = 0;
  if (result.notification_intents.length > 0) {
    try {
      const { deliverAutomationNotificationIntents } = await import(
        "./automation-attention-service.js"
      );
      const delivered = await deliverAutomationNotificationIntents(
        prisma,
        result.notification_intents
      );
      notifications_delivered = delivered.delivered;
    } catch (err) {
      options?.log?.("autopost-automations: notification delivery failed", {
        error: err instanceof Error ? err.message : String(err),
        intents: result.notification_intents.length
      });
    }
  }
  options?.log?.("autopost-automations: reconcile", {
    expired: result.expired,
    claimed: result.claimed,
    materialized: result.materialized,
    skipped_no_post: result.skipped_no_post,
    skipped_awaiting_review: result.skipped_awaiting_review,
    failed: result.failed,
    notification_intents: result.notification_intents.length,
    notifications_delivered
  });
  return result;
}

export interface AutomationsRunner {
  start(): void;
  stop(): Promise<void>;
  processOnce(): Promise<AutomationsReconcileResult>;
}

export interface InProcessAutomationsRunnerOptions {
  prisma: PrismaClient;
  pollIntervalMs?: number;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
}

export class InProcessAutomationsRunner implements AutomationsRunner {
  private readonly prisma: PrismaClient;
  private readonly pollIntervalMs: number;
  private readonly log?: (msg: string, ctx?: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  public constructor(opts: InProcessAutomationsRunnerOptions) {
    this.prisma = opts.prisma;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_AUTOMATIONS_INTERVAL_MS;
    this.log = opts.log;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processOnce().catch((err) => {
        this.log?.("autopost-automations: tick failed", {
          error: err instanceof Error ? err.message : String(err)
        });
      });
    }, this.pollIntervalMs);
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = null;
  }

  public async processOnce(): Promise<AutomationsReconcileResult> {
    if (this.inFlight) {
      return {
        expired: 0,
        claimed: 0,
        materialized: 0,
        skipped_no_post: 0,
        skipped_awaiting_review: 0,
        failed: 0,
        notification_intents: []
      };
    }
    this.inFlight = true;
    try {
      return await runAutomationsReconcileOnce(this.prisma, { log: this.log });
    } finally {
      this.inFlight = false;
    }
  }
}

export function startAutomationsWorker(
  prisma: PrismaClient,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): AutomationsRunner {
  const every = automationsRepeatEveryMsFromEnv();
  if (every === null) {
    return {
      start: () => undefined,
      stop: async () => undefined,
      processOnce: async () => ({
        expired: 0,
        claimed: 0,
        materialized: 0,
        skipped_no_post: 0,
        skipped_awaiting_review: 0,
        failed: 0,
        notification_intents: []
      })
    };
  }
  const runner = new InProcessAutomationsRunner({
    prisma,
    pollIntervalMs: every,
    log
  });
  runner.start();
  return runner;
}
