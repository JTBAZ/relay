/**
 * DB-backed effective promo loader for patron/simulator surfaces (Slice 9).
 */

import type { PrismaClient } from "@prisma/client";
import type { PostPermissionOutcome } from "../gallery/post-permission.js";
import type { AudiencePersonaKeyServer } from "../gallery/tier-preview-settings.js";
import {
  resolveEffectiveMarketingOffer,
  type CatalogTierAmount,
  type EffectivePromoDto,
  type ExplicitOfferCandidate,
  type TierDefaultCandidate
} from "./effective-marketing-offer.js";

function mapExplicit(row: {
  active: boolean;
  audienceKey: string;
  headline: string;
  ctaText: string;
  redirectSlug: string | null;
  discountCodeId: string | null;
  discountCode: {
    code: string;
    percentOff: number;
    active: boolean;
  } | null;
}): ExplicitOfferCandidate {
  return {
    active: row.active,
    audience_key: row.audienceKey,
    headline: row.headline,
    cta_text: row.ctaText,
    redirect_slug: row.redirectSlug,
    discount_code: row.discountCode
      ? {
          code: row.discountCode.code,
          percent_off: row.discountCode.percentOff,
          active: row.discountCode.active
        }
      : null,
    code_missing: Boolean(row.discountCodeId && !row.discountCode)
  };
}

function mapTierDefault(row: {
  active: boolean;
  gateRelayTierId: string;
  segment: string;
  headline: string;
  ctaText: string;
  redirectSlug: string | null;
  discountCodeId: string | null;
  discountCode: {
    code: string;
    percentOff: number;
    active: boolean;
  } | null;
}): TierDefaultCandidate {
  return {
    active: row.active,
    gate_relay_tier_id: row.gateRelayTierId,
    segment: row.segment,
    headline: row.headline,
    cta_text: row.ctaText,
    redirect_slug: row.redirectSlug,
    discount_code: row.discountCode
      ? {
          code: row.discountCode.code,
          percent_off: row.discountCode.percentOff,
          active: row.discountCode.active
        }
      : null,
    code_missing: Boolean(row.discountCodeId && !row.discountCode)
  };
}

export async function loadEffectivePromoForViewer(args: {
  prisma: PrismaClient;
  creatorId: string;
  postId: string;
  audienceKey?: AudiencePersonaKeyServer | string;
  audienceKeys?: readonly (AudiencePersonaKeyServer | string)[];
  permissionOutcome: PostPermissionOutcome["outcome"] | "missing_post" | "hidden";
  postTierIds: readonly string[];
  catalogTiers: readonly CatalogTierAmount[];
}): Promise<EffectivePromoDto | null> {
  if (
    args.permissionOutcome === "allow" ||
    args.permissionOutcome === "missing_post" ||
    args.permissionOutcome === "hidden"
  ) {
    return null;
  }

  const creatorId = args.creatorId.trim();
  const postId = args.postId.trim();

  const [offers, defaults] = await Promise.all([
    args.prisma.postMarketingOffer.findMany({
      where: { creatorId, postId, active: true },
      include: { discountCode: true }
    }),
    args.prisma.creatorTierPromotionDefault.findMany({
      where: { creatorId, active: true, segment: "unpermissioned" },
      include: { discountCode: true }
    })
  ]);

  return resolveEffectiveMarketingOffer({
    permissionOutcome: args.permissionOutcome,
    audienceKey: args.audienceKey,
    audienceKeys: args.audienceKeys,
    postTierIds: args.postTierIds,
    catalogTiers: args.catalogTiers,
    explicitOffers: offers.map(mapExplicit),
    tierDefaults: defaults.map(mapTierDefault)
  });
}
