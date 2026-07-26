/**
 * @fileoverview Load creator-post context and run pure audience simulation.
 * Read path — not gated by studio sync-write guard.
 */

import type { PrismaClient } from "@prisma/client";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../patreon/relay-access-tiers.js";
import {
  simulateAudiencePersonas,
  type AudienceSimulationResult,
  type SimulationTierRow
} from "./audience-simulation.js";
import type { PostVisibility } from "./types.js";
import {
  normalizeTierPreviewSettings,
  type TierPreviewSettingsV1
} from "./tier-preview-settings.js";
import { loadEffectivePromoForViewer } from "../marketing/load-effective-promo.js";

export type AudienceSimulationEnvelope = {
  post_id: string;
  creator_id: string;
  gate: { is_public: boolean; tier_ids: string[] };
  relay_visibility: PostVisibility;
  is_mature: boolean;
  catalog_tiers: SimulationTierRow[];
  simulation: AudienceSimulationResult;
  tier_preview_settings: TierPreviewSettingsV1 | null;
};

function aggregateRelayVisibility(
  rows: Array<{ visibility: "visible" | "hidden" | "review" | null }>
): PostVisibility {
  const values = rows
    .map((r) => r.visibility)
    .filter((v): v is "visible" | "hidden" | "review" => v != null);
  if (values.includes("hidden")) return "hidden";
  if (values.includes("review")) return "review";
  return "visible";
}

/**
 * Returns null when the post is missing or not owned by creatorId.
 */
export async function loadAudienceSimulationForCreatorPost(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<AudienceSimulationEnvelope | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, creatorId },
    select: {
      id: true,
      creatorId: true,
      isPublic: true,
      requiredTierId: true,
      versions: {
        orderBy: { versionSeq: "desc" },
        take: 1,
        select: { tierIds: true }
      },
      presentation: { select: { tierPreviewSettings: true } }
    }
  });
  if (!post) return null;

  const versionTier = post.versions[0]?.tierIds ?? [];
  let postTierIds: string[];
  if (post.isPublic || versionTier.includes(RELAY_TIER_PUBLIC)) {
    postTierIds = versionTier.length > 0 ? versionTier : [RELAY_TIER_PUBLIC];
  } else if (versionTier.length > 0) {
    postTierIds = versionTier;
  } else if (post.requiredTierId) {
    postTierIds = [post.requiredTierId];
  } else {
    postTierIds = [RELAY_TIER_PUBLIC];
  }

  const [tierRows, overrideRows] = await Promise.all([
    prisma.tier.findMany({
      where: {
        creatorId,
        relayTierId: { notIn: [RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC] }
      },
      orderBy: [{ amountCents: "asc" }, { title: "asc" }],
      select: {
        relayTierId: true,
        title: true,
        amountCents: true
      }
    }),
    prisma.postOverride.findMany({
      where: { creatorId, postId },
      select: { visibility: true }
    })
  ]);

  const catalogTiers: SimulationTierRow[] = tierRows.map((r) => ({
    relay_tier_id: r.relayTierId,
    title: r.title,
    amount_cents: r.amountCents
  }));

  const relayVisibility = aggregateRelayVisibility(overrideRows);
  const simulation = simulateAudiencePersonas({
    creatorId,
    postId,
    postTierIds,
    catalogTiers,
    relayPostVisibility: relayVisibility,
    isPostMature: relayVisibility === "review"
  });

  const settingsNorm = normalizeTierPreviewSettings(
    post.presentation?.tierPreviewSettings ?? null
  );
  const tier_preview_settings =
    settingsNorm.ok && settingsNorm.value
      ? settingsNorm.value
      : settingsNorm.ok
        ? null
        : null;

  const personasWithPromo = await Promise.all(
    simulation.personas.map(async (persona) => {
      if (persona.outcome === "allow" || persona.outcome === "missing_post") {
        return { ...persona, effective_promo: null };
      }
      if (relayVisibility === "hidden") {
        return { ...persona, effective_promo: null };
      }
      const promo = await loadEffectivePromoForViewer({
        prisma,
        creatorId,
        postId,
        audienceKey: persona.persona_key,
        permissionOutcome: persona.outcome,
        postTierIds,
        catalogTiers: catalogTiers.map((t) => ({
          relay_tier_id: t.relay_tier_id,
          amount_cents: t.amount_cents
        }))
      });
      return { ...persona, effective_promo: promo };
    })
  );

  return {
    post_id: post.id,
    creator_id: post.creatorId,
    gate: {
      is_public: postTierIds.includes(RELAY_TIER_PUBLIC) || post.isPublic,
      tier_ids: postTierIds.filter((id) => id !== RELAY_TIER_PUBLIC && id !== RELAY_TIER_ALL_PATRONS)
    },
    relay_visibility: relayVisibility,
    is_mature: relayVisibility === "review",
    catalog_tiers: catalogTiers,
    simulation: { ...simulation, personas: personasWithPromo },
    tier_preview_settings
  };
}
