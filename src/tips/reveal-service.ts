/**
 * @fileoverview Tip reveal service (spend + open window). MB-5.
 * @see docs/TIP_BETA_BUILD_PLAN.md
 */

import type { PrismaClient } from "@prisma/client";
import { SubscriptionStatus } from "@prisma/client";
import { recordTipEarned } from "../ledger/artist-ledger-service.js";
import {
  InsufficientTipsError,
  spendTip
} from "../ledger/tip-ledger-service.js";
import { fanPlanParams } from "../billing/fan-plan-config.js";
import { isFanPremiumEnabled } from "../billing/fan-plan-config.js";
import { scheduleUsageEvent } from "../usage/usage-events.js";
import { enqueueRelayEngagementEvent } from "../analytics/relay-engagement-event.js";
import { resolveTipsBetaConfig } from "./config.js";
import { resolveTipEligibility, type TipEligibilityReason } from "./tip-eligibility.js";

export class TipNotEligibleError extends Error {
  public readonly code = "not_eligible" as const;
  public constructor(public readonly reasons: TipEligibilityReason[]) {
    super(`not_eligible:${reasons.join(",")}`);
    this.name = "TipNotEligibleError";
  }
}

export type TipRevealWire = {
  reveal_id: string;
  post_id: string;
  creator_id: string;
  expires_at: string;
  media: { media_ids: string[] };
  reused: boolean;
};

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

async function revealWindowDaysForPatron(
  prisma: PrismaClient,
  patronAccountId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const betaDays = resolveTipsBetaConfig().revealWindowDays;
  if (!isFanPremiumEnabled(env)) return betaDays;

  const sub = await prisma.planSubscription.findFirst({
    where: {
      accountId: patronAccountId,
      scope: "fan",
      status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] },
      fanPlan: { not: null }
    },
    orderBy: { updatedAt: "desc" }
  });
  const params = fanPlanParams(sub?.fanPlan);
  return params.revealWindowDays ?? betaDays;
}

/** Exported for MB-13 window tests. */
export async function resolveRevealWindowDaysForPatron(
  prisma: PrismaClient,
  patronAccountId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  return revealWindowDaysForPatron(prisma, patronAccountId, env);
}

async function mediaIdsForPost(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<string[]> {
  const media = await prisma.mediaAsset.findMany({
    where: {
      creatorId,
      OR: [{ primaryPostId: postId }, { postIds: { has: postId } }]
    },
    select: { id: true },
    take: 50
  });
  return media.map((m) => m.id);
}

/**
 * Reveal a post by spending one Tip. Idempotent while the window is open.
 */
export async function revealPost(
  prisma: PrismaClient,
  args: {
    patronAccountId: string;
    postId: string;
    surface: "discover" | "artist_page" | string;
    viewerAlreadyEntitled?: boolean;
    now?: Date;
  }
): Promise<TipRevealWire> {
  const patronAccountId = args.patronAccountId.trim();
  const postId = args.postId.trim();
  const surface = String(args.surface ?? "discover").trim() || "discover";
  const now = args.now ?? new Date();
  // resolveTipsBetaConfig still used for beta fallback windows via revealWindowDaysForPatron

  const existing = await prisma.tipReveal.findFirst({
    where: {
      patronAccountId,
      postId,
      closedAt: null,
      expiresAt: { gt: now }
    },
    orderBy: { revealedAt: "desc" }
  });
  if (existing) {
    return {
      reveal_id: existing.id,
      post_id: existing.postId,
      creator_id: existing.creatorId,
      expires_at: existing.expiresAt.toISOString(),
      media: { media_ids: await mediaIdsForPost(prisma, existing.creatorId, postId) },
      reused: true
    };
  }

  const eligibility = await resolveTipEligibility(prisma, {
    postId,
    viewerAlreadyEntitled: args.viewerAlreadyEntitled
  });
  if (!eligibility.eligible || !eligibility.creator_id) {
    scheduleUsageEvent(prisma, {
      relayCreatorId: eligibility.creator_id,
      metric: "tips.reveal.blocked",
      quantity: 1,
      meta: { reasons: eligibility.reasons, post_id: postId }
    });
    throw new TipNotEligibleError(
      eligibility.reasons.length > 0 ? eligibility.reasons : ["not_in_promo_pool"]
    );
  }

  const creatorId = eligibility.creator_id;
  const windowDays = await revealWindowDaysForPatron(prisma, patronAccountId);
  const expiresAt = addDays(now, windowDays);
  const spendKey = `spend:${patronAccountId}:${postId}`;

  try {
    const open = await prisma.$transaction(async (tx) => {
      const again = await tx.tipReveal.findFirst({
        where: {
          patronAccountId,
          postId,
          closedAt: null,
          expiresAt: { gt: now }
        }
      });
      if (again) return { row: again, created: false };

      const created = await tx.tipReveal.create({
        data: {
          patronAccountId,
          creatorId,
          postId,
          promoSlotId: eligibility.promo_slot_id,
          surface,
          tipsSpent: 1,
          revealedAt: now,
          expiresAt
        }
      });

      await spendTip(
        prisma,
        {
          accountId: patronAccountId,
          revealId: created.id,
          idempotencyKey: spendKey,
          creatorId,
          tips: 1
        },
        tx
      );

      await recordTipEarned(
        prisma,
        { creatorId, revealId: created.id },
        tx
      );

      return { row: created, created: true };
    });

    if (open.created) {
      enqueueRelayEngagementEvent(
        { prisma },
        {
          creatorId: open.row.creatorId,
          eventType: "reveal_interaction",
          postId: open.row.postId,
          occurredAt: now
        }
      );
    }

    return {
      reveal_id: open.row.id,
      post_id: open.row.postId,
      creator_id: open.row.creatorId,
      expires_at: open.row.expiresAt.toISOString(),
      media: { media_ids: await mediaIdsForPost(prisma, open.row.creatorId, postId) },
      reused: !open.created
    };
  } catch (err) {
    if (err instanceof InsufficientTipsError) throw err;
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const winner = await prisma.tipReveal.findFirst({
        where: { patronAccountId, postId, closedAt: null, expiresAt: { gt: now } }
      });
      if (winner) {
        await spendTip(prisma, {
          accountId: patronAccountId,
          revealId: winner.id,
          idempotencyKey: spendKey,
          creatorId: winner.creatorId,
          tips: 1
        });
        await recordTipEarned(prisma, {
          creatorId: winner.creatorId,
          revealId: winner.id
        });
        return {
          reveal_id: winner.id,
          post_id: winner.postId,
          creator_id: winner.creatorId,
          expires_at: winner.expiresAt.toISOString(),
          media: { media_ids: await mediaIdsForPost(prisma, winner.creatorId, postId) },
          reused: true
        };
      }
    }
    throw err;
  }
}

export async function listActiveReveals(
  prisma: PrismaClient,
  patronAccountId: string,
  now: Date = new Date()
): Promise<
  Array<{ reveal_id: string; post_id: string; creator_id: string; expires_at: string }>
> {
  const rows = await prisma.tipReveal.findMany({
    where: {
      patronAccountId: patronAccountId.trim(),
      closedAt: null,
      expiresAt: { gt: now }
    },
    orderBy: { revealedAt: "desc" }
  });
  return rows.map((r) => ({
    reveal_id: r.id,
    post_id: r.postId,
    creator_id: r.creatorId,
    expires_at: r.expiresAt.toISOString()
  }));
}
