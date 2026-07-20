/**
 * Creator-only Promo Hub summary: which Promo Pieces inherit which tier defaults.
 * Uses resolveMinimumGateRelayTierId — no alternate gate algorithm.
 */

import type { PrismaClient } from "@prisma/client";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../patreon/relay-access-tiers.js";
import {
  resolveMinimumGateRelayTierId,
  type CatalogTierAmount
} from "./effective-marketing-offer.js";
import {
  loadDiscountCodeUsageSummaries,
  type DiscountCodeUsageSummary
} from "./discount-code-service.js";
import { listCreatorTierPromotionDefaults } from "./tier-promotion-default-service.js";

export type PromoPieceUnmatchedReason =
  | "missing_post"
  | "public_or_ungated"
  | "no_matching_default";

export type PromotionHubPieceSummary = {
  promo_piece_id: string;
  slot_rank: 1 | 2 | 3 | 4 | 5;
  post_id: string | null;
  title: string | null;
  minimum_gate_relay_tier_id: string | null;
  unmatched_reason: PromoPieceUnmatchedReason | null;
};

export type PromotionHubRuleSummary = {
  default_id: string;
  gate_relay_tier_id: string;
  inherited_piece_count: number;
  matching_promo_piece_ids: string[];
};

export type PromotionHubSummary = {
  creator_id: string;
  pieces: PromotionHubPieceSummary[];
  rules: PromotionHubRuleSummary[];
  unmatched: {
    missing_post_count: number;
    public_or_ungated_count: number;
    no_matching_default_count: number;
  };
  /** Creator-only code library usage; never exposed on visitor DTOs. */
  code_usage: DiscountCodeUsageSummary[];
};

export type PromotionHubPieceInput = {
  promo_piece_id: string;
  slot_rank: 1 | 2 | 3 | 4 | 5;
  post_id: string | null;
  title?: string | null;
  /** null when post missing; otherwise the post's gate tier ids. */
  post_tier_ids: string[] | null;
};

/**
 * Pure summary — callers supply already-loaded pieces, catalog, and active defaults.
 */
export function summarizePromotionHub(args: {
  creator_id: string;
  pieces: readonly PromotionHubPieceInput[];
  catalog_tiers: readonly CatalogTierAmount[];
  /** Active unpermissioned defaults with their gate tier ids. */
  defaults: ReadonlyArray<{ id: string; gate_relay_tier_id: string; active: boolean }>;
  code_usage?: readonly DiscountCodeUsageSummary[];
}): PromotionHubSummary {
  const activeDefaults = args.defaults.filter(
    (d) => d.active && d.gate_relay_tier_id.trim()
  );
  const defaultGateSet = new Set(activeDefaults.map((d) => d.gate_relay_tier_id.trim()));

  const pieces: PromotionHubPieceSummary[] = args.pieces.map((piece) => {
    if (!piece.post_id || piece.post_tier_ids == null) {
      return {
        promo_piece_id: piece.promo_piece_id,
        slot_rank: piece.slot_rank,
        post_id: piece.post_id,
        title: piece.title ?? null,
        minimum_gate_relay_tier_id: null,
        unmatched_reason: "missing_post"
      };
    }
    const gate = resolveMinimumGateRelayTierId(piece.post_tier_ids, args.catalog_tiers);
    if (!gate) {
      return {
        promo_piece_id: piece.promo_piece_id,
        slot_rank: piece.slot_rank,
        post_id: piece.post_id,
        title: piece.title ?? null,
        minimum_gate_relay_tier_id: null,
        unmatched_reason: "public_or_ungated"
      };
    }
    if (!defaultGateSet.has(gate)) {
      return {
        promo_piece_id: piece.promo_piece_id,
        slot_rank: piece.slot_rank,
        post_id: piece.post_id,
        title: piece.title ?? null,
        minimum_gate_relay_tier_id: gate,
        unmatched_reason: "no_matching_default"
      };
    }
    return {
      promo_piece_id: piece.promo_piece_id,
      slot_rank: piece.slot_rank,
      post_id: piece.post_id,
      title: piece.title ?? null,
      minimum_gate_relay_tier_id: gate,
      unmatched_reason: null
    };
  });

  const rules: PromotionHubRuleSummary[] = activeDefaults.map((d) => {
    const gate = d.gate_relay_tier_id.trim();
    const matching = pieces
      .filter(
        (p) =>
          p.unmatched_reason == null && p.minimum_gate_relay_tier_id === gate
      )
      .map((p) => p.promo_piece_id);
    return {
      default_id: d.id,
      gate_relay_tier_id: gate,
      inherited_piece_count: matching.length,
      matching_promo_piece_ids: matching
    };
  });

  return {
    creator_id: args.creator_id,
    pieces,
    rules,
    unmatched: {
      missing_post_count: pieces.filter((p) => p.unmatched_reason === "missing_post").length,
      public_or_ungated_count: pieces.filter((p) => p.unmatched_reason === "public_or_ungated")
        .length,
      no_matching_default_count: pieces.filter(
        (p) => p.unmatched_reason === "no_matching_default"
      ).length
    },
    code_usage: [...(args.code_usage ?? [])]
  };
}

function resolvePostTierIds(post: {
  isPublic: boolean;
  requiredTierId: string | null;
  versions: Array<{ tierIds: string[] }>;
}): string[] {
  const versionTier = post.versions[0]?.tierIds ?? [];
  if (post.isPublic || versionTier.includes(RELAY_TIER_PUBLIC)) {
    return versionTier.length > 0 ? versionTier : [RELAY_TIER_PUBLIC];
  }
  if (versionTier.length > 0) return versionTier;
  if (post.requiredTierId) return [post.requiredTierId];
  return [RELAY_TIER_PUBLIC];
}

/**
 * Load creator Promo Pool + post gates + catalog + defaults into a hub summary.
 */
export async function loadPromotionHubSummary(
  prisma: PrismaClient,
  creatorId: string
): Promise<PromotionHubSummary> {
  const slots = await prisma.creatorPromoSlot.findMany({
    where: { creatorId },
    orderBy: { slotRank: "asc" },
    select: {
      id: true,
      slotRank: true,
      targetKind: true,
      targetId: true
    }
  });

  const mediaIds = slots.filter((s) => s.targetKind === "media").map((s) => s.targetId);
  const mediaRows =
    mediaIds.length > 0
      ? await prisma.mediaAsset.findMany({
          where: { id: { in: mediaIds }, creatorId },
          select: { id: true, primaryPostId: true }
        })
      : [];
  const mediaPostById = new Map(
    mediaRows.map((m) => [m.id, m.primaryPostId] as const)
  );

  const postIds = [
    ...new Set(
      slots
        .map((s) =>
          s.targetKind === "post" ? s.targetId : mediaPostById.get(s.targetId) ?? null
        )
        .filter((id): id is string => Boolean(id))
    )
  ];

  const [posts, tierRows, defaults, codeUsage] = await Promise.all([
    postIds.length > 0
      ? prisma.post.findMany({
          where: { id: { in: postIds }, creatorId },
          select: {
            id: true,
            isPublic: true,
            requiredTierId: true,
            versions: {
              orderBy: { versionSeq: "desc" },
              take: 1,
              select: { tierIds: true, title: true }
            }
          }
        })
      : Promise.resolve([]),
    prisma.tier.findMany({
      where: { creatorId },
      select: { relayTierId: true, amountCents: true }
    }),
    listCreatorTierPromotionDefaults(prisma, creatorId),
    loadDiscountCodeUsageSummaries(prisma, creatorId)
  ]);

  const postById = new Map(posts.map((p) => [p.id, p] as const));
  const catalog: CatalogTierAmount[] = tierRows.map((t) => ({
    relay_tier_id: t.relayTierId,
    amount_cents: t.amountCents
  }));

  const pieces: PromotionHubPieceInput[] = slots.map((slot) => {
    const postId =
      slot.targetKind === "post"
        ? slot.targetId
        : mediaPostById.get(slot.targetId) ?? null;
    const post = postId ? postById.get(postId) : undefined;
    if (!postId || !post) {
      return {
        promo_piece_id: slot.id,
        slot_rank: slot.slotRank as 1 | 2 | 3 | 4 | 5,
        post_id: postId,
        title: null,
        post_tier_ids: null
      };
    }
    return {
      promo_piece_id: slot.id,
      slot_rank: slot.slotRank as 1 | 2 | 3 | 4 | 5,
      post_id: postId,
      title: post.versions[0]?.title ?? null,
      post_tier_ids: resolvePostTierIds(post)
    };
  });

  return summarizePromotionHub({
    creator_id: creatorId,
    pieces,
    catalog_tiers: catalog,
    defaults: defaults.map((d) => ({
      id: d.id,
      gate_relay_tier_id: d.gate_relay_tier_id,
      active: d.active
    })),
    code_usage: codeUsage
  });
}

/** Exported for tests — public/all-patrons sentinel awareness. */
export const PROMOTION_HUB_PUBLIC_SENTINELS = [RELAY_TIER_PUBLIC, RELAY_TIER_ALL_PATRONS] as const;
