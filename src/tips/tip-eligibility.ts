/**
 * @fileoverview Tip eligibility (spend-time + read-time). MB-5 uses this; MB-7 extends Studio UI.
 * @see docs/TIP_BETA_BUILD_PLAN.md
 */

import {
  CreatorPromoSlotTargetKind,
  MediaUpstreamStatus,
  type PrismaClient
} from "@prisma/client";
import { galleryOverridesRootFromRows } from "../gallery/overrides-store-db.js";
import { isPostMatureFromPatronSurfaces } from "../gallery/mature-post-ids.js";

export type TipEligibilityReason =
  | "not_in_promo_pool"
  | "mature"
  | "storefront"
  | "disabled"
  | "already_entitled";

export type TipEligibilityResult = {
  eligible: boolean;
  reasons: TipEligibilityReason[];
  promo_slot_id: string | null;
  creator_id: string | null;
};

/** Studio / UI copy keyed off stable reason codes (MB-7). */
export function tipEligibilityReasonCopy(reason: TipEligibilityReason): string {
  switch (reason) {
    case "mature":
      return "Rated 18+ — not eligible for Tips";
    case "storefront":
      return "Listed in a storefront — not eligible for Tips";
    case "disabled":
      return "You've turned Tips off for this piece";
    case "already_entitled":
      return "Already free to viewers — Tips not needed";
    case "not_in_promo_pool":
      return "Not in the Promo Pool";
    default:
      return "Not eligible for Tips";
  }
}

/**
 * Phase 3+: storefront integration point.
 * Returns true when the post is listed in a Relay storefront (blocks Tips).
 */
export function isStorefrontListed(_args: {
  creatorId: string;
  postId: string;
}): boolean {
  return false;
}

export async function resolveTipEligibility(
  prisma: PrismaClient,
  args: {
    creatorId?: string;
    postId: string;
    /** When true, fan already has Patreon/tier access — never Tip-gate. */
    viewerAlreadyEntitled?: boolean;
  }
): Promise<TipEligibilityResult> {
  const postId = args.postId.trim();
  const reasons: TipEligibilityReason[] = [];

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, creatorId: true, isPublic: true }
  });
  if (!post) {
    return {
      eligible: false,
      reasons: ["not_in_promo_pool"],
      promo_slot_id: null,
      creator_id: args.creatorId?.trim() || null
    };
  }

  const creatorId = (args.creatorId ?? post.creatorId).trim();

  if (args.viewerAlreadyEntitled === true || post.isPublic) {
    reasons.push("already_entitled");
  }

  const slot = await prisma.creatorPromoSlot.findFirst({
    where: {
      creatorId,
      targetKind: CreatorPromoSlotTargetKind.post,
      targetId: postId
    },
    select: { id: true, tipEligible: true }
  });
  if (!slot) {
    reasons.push("not_in_promo_pool");
  } else if (!slot.tipEligible) {
    reasons.push("disabled");
  }

  if (isStorefrontListed({ creatorId, postId })) {
    reasons.push("storefront");
  }

  const mediaRows = await prisma.mediaAsset.findMany({
    where: {
      creatorId,
      upstreamStatus: { not: MediaUpstreamStatus.deleted },
      OR: [{ primaryPostId: postId }, { postIds: { has: postId } }]
    },
    select: { id: true }
  });
  const overrideRows = await prisma.postOverride.findMany({
    where: { creatorId }
  });
  const overrides = galleryOverridesRootFromRows(overrideRows);
  if (
    isPostMatureFromPatronSurfaces({
      overrides,
      creatorId,
      postId,
      activeMediaIds: mediaRows.map((m) => m.id)
    })
  ) {
    reasons.push("mature");
  }

  const unique = [...new Set(reasons)];
  return {
    eligible: unique.length === 0,
    reasons: unique,
    promo_slot_id: slot?.id ?? null,
    creator_id: creatorId
  };
}
