/**
 * @fileoverview Tip reveal expiry + day-before nudge worker (MB-13).
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import type { PrismaClient } from "@prisma/client";
import { isFanPremiumEnabled } from "../billing/fan-plan-config.js";
import { emitNotificationOutboxEvent } from "../patron/notification-event-emit.js";
import { isTipsBetaEnabled } from "./config.js";

export const DEFAULT_REVEAL_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;
export const MIN_REVEAL_EXPIRY_INTERVAL_MS = 60_000;

export const REVEAL_EXPIRING_EVENT = "tips.reveal_expiring";

export type RevealExpiryCycleResult = {
  cycle_started_at: string;
  notified: number;
  closed: number;
};

export type RunRevealExpiryOptions = {
  now?: Date;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
  env?: NodeJS.ProcessEnv;
};

export function revealExpiryRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  if (!isTipsBetaEnabled(env) && !isFanPremiumEnabled(env)) return null;
  const raw = env.RELAY_REVEAL_EXPIRY_INTERVAL_MS?.trim();
  if (raw === "0" || raw === "off") return null;
  if (!raw) return DEFAULT_REVEAL_EXPIRY_INTERVAL_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_REVEAL_EXPIRY_INTERVAL_MS) {
    return DEFAULT_REVEAL_EXPIRY_INTERVAL_MS;
  }
  return n;
}

/**
 * Day-before: emit outbox `tips.reveal_expiring` (dedupe via primaryId = reveal id).
 * Close pass: set closedAt when expiresAt <= now.
 */
export async function runRevealExpiryOnce(
  prisma: PrismaClient,
  options: RunRevealExpiryOptions = {}
): Promise<RevealExpiryCycleResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => undefined);
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let notified = 0;
  let closed = 0;

  const expiringSoon = await prisma.tipReveal.findMany({
    where: {
      closedAt: null,
      expiresAt: { gt: now, lte: in24h }
    },
    take: 500
  });

  for (const reveal of expiringSoon) {
    try {
      const prior = await prisma.outboxEvent.findFirst({
        where: {
          eventName: REVEAL_EXPIRING_EVENT,
          primaryId: reveal.id
        }
      });
      if (prior) continue;

      await emitNotificationOutboxEvent(prisma, {
        eventName: REVEAL_EXPIRING_EVENT,
        tenantId: reveal.creatorId,
        primaryId: reveal.id,
        producer: "reveal-expiry-worker",
        payload: {
          reveal_id: reveal.id,
          post_id: reveal.postId,
          creator_id: reveal.creatorId,
          patron_account_id: reveal.patronAccountId,
          expires_at: reveal.expiresAt.toISOString(),
          cluster_key: `reveal_expiring:${reveal.id}`
        }
      });
      notified += 1;
    } catch (err) {
      log("reveal-expiry: notify failed", {
        revealId: reveal.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const toClose = await prisma.tipReveal.findMany({
    where: {
      closedAt: null,
      expiresAt: { lte: now }
    },
    take: 500
  });

  for (const reveal of toClose) {
    try {
      await prisma.tipReveal.update({
        where: { id: reveal.id },
        data: { closedAt: now }
      });
      closed += 1;
    } catch (err) {
      log("reveal-expiry: close failed", {
        revealId: reveal.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    cycle_started_at: now.toISOString(),
    notified,
    closed
  };
}
