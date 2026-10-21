/**
 * @fileoverview Sweeps queued cross-posts (`PostDistributionVariant.scheduledFor`) and pings the
 * creator once their opted-in (`remindMe`) reminder time arrives. Writes `Notification` rows
 * directly via `createOrClusterNotification` rather than the `OutboxEvent` pipeline — this worker
 * is itself the producer + delivery point for a self-contained, idempotent (via `sourceEventId`)
 * event, so the extra indirection isn't needed.
 */

import type { PrismaClient } from "@prisma/client";
import { createOrClusterNotification } from "../patron/notification-service.js";
import { resolveCreatorAccountIdForRelayCreator } from "../patron/creator-notification-target.js";

export const DEFAULT_DISTRIBUTION_SCHEDULE_REMINDER_INTERVAL_MS = 5 * 60 * 1000;
export const MIN_DISTRIBUTION_SCHEDULE_REMINDER_INTERVAL_MS = 30_000;

const TERMINAL_VARIANT_STATUSES = new Set(["posted", "skipped"]);

export type DistributionScheduleReminderResult = {
  cycle_started_at: string;
  variants_scanned: number;
  reminders_sent: number;
};

export type RunDistributionScheduleReminderOnceOptions = {
  variantId?: string;
  now?: Date;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
};

export async function runDistributionScheduleReminderOnce(
  prisma: PrismaClient,
  opts?: RunDistributionScheduleReminderOnceOptions
): Promise<DistributionScheduleReminderResult> {
  const now = opts?.now ?? new Date();
  const log = opts?.log ?? (() => undefined);
  const variantFilter = opts?.variantId?.trim();

  const dueVariants = await prisma.postDistributionVariant.findMany({
    where: {
      remindMe: true,
      reminderSentAt: null,
      scheduledFor: { not: null, lte: now },
      ...(variantFilter ? { id: variantFilter } : {})
    }
  });

  let remindersSent = 0;
  for (const variant of dueVariants) {
    if (TERMINAL_VARIANT_STATUSES.has(variant.status)) continue;

    const recipientCreatorAccountId = await resolveCreatorAccountIdForRelayCreator(
      prisma,
      variant.creatorId
    );
    if (!recipientCreatorAccountId) continue;

    await createOrClusterNotification(prisma, {
      recipientCreatorAccountId,
      relayCreatorId: variant.creatorId,
      kind: "distribution_schedule_reminder",
      clusterKey: null,
      sourceEventId: `distribution_schedule_reminder:${variant.id}`,
      payload: {
        post_id: variant.postId,
        variant_id: variant.id,
        destination: variant.destination,
        scheduled_for: variant.scheduledFor?.toISOString() ?? null
      }
    });

    await prisma.postDistributionVariant.update({
      where: { id: variant.id },
      data: { reminderSentAt: now }
    });
    remindersSent += 1;
  }

  const summary: DistributionScheduleReminderResult = {
    cycle_started_at: now.toISOString(),
    variants_scanned: dueVariants.length,
    reminders_sent: remindersSent
  };
  log("distribution-schedule-reminder: cycle complete", summary);
  return summary;
}

export interface DistributionScheduleReminderRunner {
  start(): void;
  stop(): Promise<void>;
  processOnce(): Promise<DistributionScheduleReminderResult>;
}

export interface InProcessDistributionScheduleReminderRunnerOptions {
  prisma: PrismaClient;
  pollIntervalMs?: number;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
}

export class InProcessDistributionScheduleReminderRunner
  implements DistributionScheduleReminderRunner
{
  private readonly prisma: PrismaClient;
  private readonly pollIntervalMs: number;
  private readonly log: (msg: string, ctx?: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  public constructor(opts: InProcessDistributionScheduleReminderRunnerOptions) {
    this.prisma = opts.prisma;
    this.pollIntervalMs =
      opts.pollIntervalMs ?? DEFAULT_DISTRIBUTION_SCHEDULE_REMINDER_INTERVAL_MS;
    this.log = opts.log ?? (() => undefined);
  }

  public start(): void {
    if (this.timer) return;
    void this.processOnce();
    this.timer = setInterval(() => {
      void this.processOnce();
    }, this.pollIntervalMs);
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.inFlight) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  public async processOnce(): Promise<DistributionScheduleReminderResult> {
    if (this.inFlight) {
      return { cycle_started_at: new Date().toISOString(), variants_scanned: 0, reminders_sent: 0 };
    }
    this.inFlight = true;
    try {
      return await runDistributionScheduleReminderOnce(this.prisma, { log: this.log });
    } finally {
      this.inFlight = false;
    }
  }
}

export function distributionScheduleReminderRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_DISTRIBUTION_SCHEDULE_REMINDER_MS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_DISTRIBUTION_SCHEDULE_REMINDER_INTERVAL_MS;
  if (raw === "0") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_DISTRIBUTION_SCHEDULE_REMINDER_INTERVAL_MS) return null;
  return Math.floor(n);
}

export function startDistributionScheduleReminderWorker(
  prisma: PrismaClient,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): DistributionScheduleReminderRunner {
  const every = distributionScheduleReminderRepeatEveryMsFromEnv();
  if (every === null) {
    return {
      start: () => undefined,
      stop: async () => undefined,
      processOnce: async () => ({
        cycle_started_at: new Date().toISOString(),
        variants_scanned: 0,
        reminders_sent: 0
      })
    };
  }
  const runner = new InProcessDistributionScheduleReminderRunner({
    prisma,
    pollIntervalMs: every,
    log
  });
  runner.start();
  return runner;
}
