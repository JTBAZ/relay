/**
 * PE-G digest — sweeps digest-enabled patrons and sends batched creator-update emails.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { createEmailSender } from "../notifications/email-sender.js";
import { assembleDigestContentForPatron } from "./notification-digest-content.js";
import { sendDigestEmail } from "./notification-digest-email.js";
import {
  digestContentWindow,
  isPatronDigestDue,
  resolveNotificationDigestTimezone,
} from "./notification-digest-schedule.js";
import {
  resolveNotificationDigestCadence,
  resolveNotificationDigestSlot,
} from "./notification-digest-preferences.js";

export const DEFAULT_NOTIFICATION_DIGEST_SWEEP_MS = 15 * 60 * 1000;
export const MIN_NOTIFICATION_DIGEST_SWEEP_MS = 60_000;
export const DEFAULT_DIGEST_BATCH_SIZE = 50;

export interface NotificationDigestStats {
  scanned: number;
  sent: number;
  skippedEmpty: number;
  skippedNotDue: number;
  failed: number;
}

export interface NotificationDigestRunner {
  start(): void;
  stop(): Promise<void>;
  processOnce(): Promise<NotificationDigestStats>;
}

export type ProcessNotificationDigestOnceOptions = {
  batchSize?: number;
  now?: Date;
  webBaseUrl?: string;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
  sendEmail?: ReturnType<typeof createEmailSender>;
};

function patronWebBaseFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.RELAY_PATRON_WEB_BASE_URL?.trim() ||
    env.RELAY_PUBLIC_WEB_BASE_URL?.trim() ||
    "http://localhost:3000"
  );
}

async function lastSuccessfulDigestSentAt(
  prisma: PrismaClient,
  patronMembershipId: string
): Promise<Date | null> {
  const row = await prisma.notificationDigestRun.findFirst({
    where: { patronMembershipId, status: "sent" },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  return row?.sentAt ?? null;
}

export async function processNotificationDigestOnce(
  prisma: PrismaClient,
  opts?: ProcessNotificationDigestOnceOptions
): Promise<NotificationDigestStats> {
  const batchSize = opts?.batchSize ?? DEFAULT_DIGEST_BATCH_SIZE;
  const now = opts?.now ?? new Date();
  const log = opts?.log ?? (() => undefined);
  const webBaseUrl = opts?.webBaseUrl ?? patronWebBaseFromEnv();
  const sendEmail = opts?.sendEmail ?? createEmailSender();

  const stats: NotificationDigestStats = {
    scanned: 0,
    sent: 0,
    skippedEmpty: 0,
    skippedNotDue: 0,
    failed: 0,
  };

  const candidates = await prisma.patronProfile.findMany({
    where: { notificationDigestEnabled: true },
    include: {
      tenantMembership: {
        select: {
          id: true,
          createdAt: true,
          account: { select: { emailNorm: true } },
        },
      },
    },
    take: batchSize,
  });

  for (const profile of candidates) {
    stats.scanned += 1;
    const membership = profile.tenantMembership;
    const email = membership.account.emailNorm?.trim();
    if (!email?.includes("@")) {
      stats.skippedNotDue += 1;
      continue;
    }

    const lastSentAt = await lastSuccessfulDigestSentAt(prisma, membership.id);
    if (!isPatronDigestDue(now, profile, lastSentAt)) {
      stats.skippedNotDue += 1;
      continue;
    }

    const cadence = resolveNotificationDigestCadence(profile.notificationDigestCadence);
    const slot = resolveNotificationDigestSlot(profile.notificationDigestSlot);
    const { periodStart, periodEnd } = digestContentWindow(
      lastSentAt,
      now,
      membership.createdAt
    );

    const existing = await prisma.notificationDigestRun.findUnique({
      where: {
        patronMembershipId_cadence_periodStart: {
          patronMembershipId: membership.id,
          cadence,
          periodStart,
        },
      },
    });
    if (existing?.status === "sent" || existing?.status === "skipped") {
      stats.skippedNotDue += 1;
      continue;
    }

    const payload = await assembleDigestContentForPatron(prisma, {
      patronMembershipId: membership.id,
      periodStart,
      periodEnd,
      webBaseUrl,
    });

    if (payload.total_posts === 0) {
      await prisma.notificationDigestRun.upsert({
        where: {
          patronMembershipId_cadence_periodStart: {
            patronMembershipId: membership.id,
            cadence,
            periodStart,
          },
        },
        create: {
          patronMembershipId: membership.id,
          cadence,
          slot,
          periodStart,
          periodEnd,
          status: "skipped",
          itemCount: 0,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          sentAt: now,
        },
        update: {
          periodEnd,
          status: "skipped",
          itemCount: 0,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          sentAt: now,
          errorMessage: null,
        },
      });
      stats.skippedEmpty += 1;
      continue;
    }

    const mail = await sendDigestEmail(sendEmail, { to: email, payload });
    if (!mail.ok) {
      stats.failed += 1;
      await prisma.notificationDigestRun.upsert({
        where: {
          patronMembershipId_cadence_periodStart: {
            patronMembershipId: membership.id,
            cadence,
            periodStart,
          },
        },
        create: {
          patronMembershipId: membership.id,
          cadence,
          slot,
          periodStart,
          periodEnd,
          status: "failed",
          itemCount: payload.total_posts,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          errorMessage: mail.error,
        },
        update: {
          periodEnd,
          status: "failed",
          itemCount: payload.total_posts,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          errorMessage: mail.error,
        },
      });
      log("notification-digest: send failed", {
        patronMembershipId: membership.id,
        error: mail.error,
      });
      continue;
    }

    await prisma.notificationDigestRun.upsert({
      where: {
        patronMembershipId_cadence_periodStart: {
          patronMembershipId: membership.id,
          cadence,
          periodStart,
        },
      },
      create: {
        patronMembershipId: membership.id,
        cadence,
        slot,
        periodStart,
        periodEnd,
        status: "sent",
        itemCount: payload.total_posts,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        providerMessageId: mail.messageId,
        sentAt: now,
      },
      update: {
        periodEnd,
        status: "sent",
        itemCount: payload.total_posts,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        providerMessageId: mail.messageId,
        sentAt: now,
        errorMessage: null,
      },
    });
    stats.sent += 1;
    log("notification-digest: sent", {
      patronMembershipId: membership.id,
      itemCount: payload.total_posts,
      timezone: resolveNotificationDigestTimezone(profile.notificationDigestTimezone),
    });
  }

  return stats;
}

class InProcessNotificationDigestRunner implements NotificationDigestRunner {
  private readonly prisma: PrismaClient;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly log: (msg: string, ctx?: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  constructor(opts: {
    prisma: PrismaClient;
    pollIntervalMs: number;
    batchSize?: number;
    log?: (msg: string, ctx?: Record<string, unknown>) => void;
  }) {
    this.prisma = opts.prisma;
    this.pollIntervalMs = opts.pollIntervalMs;
    this.batchSize = opts.batchSize ?? DEFAULT_DIGEST_BATCH_SIZE;
    this.log = opts.log ?? (() => undefined);
  }

  start(): void {
    if (this.timer) return;
    void this.processOnce();
    this.timer = setInterval(() => void this.processOnce(), this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.inFlight) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async processOnce(): Promise<NotificationDigestStats> {
    if (this.inFlight) {
      return {
        scanned: 0,
        sent: 0,
        skippedEmpty: 0,
        skippedNotDue: 0,
        failed: 0,
      };
    }
    this.inFlight = true;
    try {
      return await processNotificationDigestOnce(this.prisma, {
        batchSize: this.batchSize,
        log: this.log,
      });
    } finally {
      this.inFlight = false;
    }
  }
}

export function startNotificationDigestWorker(
  prisma: PrismaClient,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): NotificationDigestRunner | null {
  const every = notificationDigestSweepRepeatEveryMsFromEnv();
  if (every === null) return null;
  const runner = new InProcessNotificationDigestRunner({
    prisma,
    pollIntervalMs: every,
    log,
  });
  runner.start();
  return runner;
}

export function notificationDigestSweepRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = (env.RELAY_NOTIFICATION_DIGEST_SWEEP_MS ?? "").trim();
  if (raw === "0") return null;
  const parsed = raw === "" ? DEFAULT_NOTIFICATION_DIGEST_SWEEP_MS : Number(raw);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return Math.max(MIN_NOTIFICATION_DIGEST_SWEEP_MS, Math.floor(parsed));
}
