/**
 * @fileoverview Tip-gated Discover section (MB-6) — eligible promo posts the fan cannot already view.
 */

import {
  CreatorPromoSlotTargetKind,
  type PrismaClient
} from "@prisma/client";
import { isTipsBetaEnabled } from "./config.js";
import { resolveTipEligibility } from "./tip-eligibility.js";
import { openTipRevealPostIds } from "./open-tip-reveal.js";

export type TipGatedDiscoverItem = {
  post_id: string;
  creator_id: string;
  /** Display name for Tip disclosure copy (MB-10). */
  creator_display_name?: string | null;
  blur_thumb_url: string | null;
  tip_cost: 1;
  /** MB-13 — prior reveal closed/expired; CTA is "Tip again to re-open". */
  tip_again?: boolean;
};

/**
 * Build tip_gated tiles for Discover when beta is on.
 * Candidates: CreatorPromoSlot posts that pass eligibility and are not already entitled / open-revealed.
 */
export async function buildTipGatedDiscoverSection(
  prisma: PrismaClient,
  args: {
    viewerAccountId: string | null;
    /** When set, only this creator's promo slots. */
    creatorId?: string;
    /** When set, skip posts already unlocked via open TipReveal. */
    skipRevealed?: boolean;
    limit?: number;
  }
): Promise<TipGatedDiscoverItem[]> {
  if (!isTipsBetaEnabled()) return [];

  const limit = Math.min(Math.max(args.limit ?? 12, 1), 24);
  const creatorFilter = args.creatorId?.trim();
  const slots = await prisma.creatorPromoSlot.findMany({
    where: {
      targetKind: CreatorPromoSlotTargetKind.post,
      tipEligible: true,
      ...(creatorFilter ? { creatorId: creatorFilter } : {})
    },
    orderBy: [{ updatedAt: "desc" }],
    take: creatorFilter ? 40 : 80,
    select: { creatorId: true, targetId: true }
  });

  const openReveals =
    args.viewerAccountId && args.skipRevealed !== false
      ? await openTipRevealPostIds(prisma, {
          patronAccountId: args.viewerAccountId,
          postIds: slots.map((s) => s.targetId)
        })
      : new Set<string>();

  const priorClosed = new Set<string>();
  if (args.viewerAccountId) {
    const closedRows = await prisma.tipReveal.findMany({
      where: {
        patronAccountId: args.viewerAccountId.trim(),
        postId: { in: slots.map((s) => s.targetId) },
        OR: [{ closedAt: { not: null } }, { expiresAt: { lte: new Date() } }]
      },
      select: { postId: true },
      distinct: ["postId"]
    });
    for (const row of closedRows) priorClosed.add(row.postId);
  }

  const out: TipGatedDiscoverItem[] = [];
  const seen = new Set<string>();
  const creatorIds = new Set<string>();

  for (const slot of slots) {
    const key = `${slot.creatorId}:${slot.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (openReveals.has(slot.targetId)) continue;

    const eligibility = await resolveTipEligibility(prisma, {
      creatorId: slot.creatorId,
      postId: slot.targetId,
      viewerAlreadyEntitled: false
    });
    if (!eligibility.eligible) continue;

    // Thumb: prefer primary media export path when present
    const media = await prisma.mediaAsset.findFirst({
      where: {
        creatorId: slot.creatorId,
        OR: [{ primaryPostId: slot.targetId }, { postIds: { has: slot.targetId } }]
      },
      select: { id: true },
      orderBy: { currentIngestedAt: "desc" }
    });

    const blur_thumb_url = media
      ? `/api/v1/export/media/${encodeURIComponent(slot.creatorId)}/${encodeURIComponent(media.id)}/thumb`
      : null;

    creatorIds.add(slot.creatorId);
    out.push({
      post_id: slot.targetId,
      creator_id: slot.creatorId,
      blur_thumb_url,
      tip_cost: 1,
      tip_again: priorClosed.has(slot.targetId)
    });
    if (out.length >= limit) break;
  }

  if (out.length > 0 && creatorIds.size > 0) {
    const profiles = await prisma.creatorProfile.findMany({
      where: { tenant: { relayCreatorId: { in: [...creatorIds] } } },
      select: {
        displayName: true,
        tenant: { select: { relayCreatorId: true } }
      }
    });
    const nameById = new Map<string, string | null>();
    for (const p of profiles) {
      const rid = p.tenant.relayCreatorId?.trim();
      if (rid) nameById.set(rid, p.displayName?.trim() || null);
    }
    for (const item of out) {
      item.creator_display_name = nameById.get(item.creator_id) ?? null;
    }
  }

  return out;
}
