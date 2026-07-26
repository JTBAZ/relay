/**
 * @fileoverview Expands synthetic `relay_tier_all_patrons` gate into concrete `patreon_tier_*` ids using campaign tier catalogs.
 * @description Used during ingest / sync so posts gated to “all patrons” become explicit tier lists for Relay entitlements.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `Tier.relayTierId`, ingest `IngestTier` shapes
 */
import type { IngestTier } from "../ingest/types.js";
import { RELAY_TIER_ALL_PATRONS } from "./relay-access-tiers.js";

/**
 * Patreon tier ids present on the campaign (excludes synthetic relay_* ids).
 * Sorted for stable `tier_ids` on posts after expanding `relay_tier_all_patrons`.
 * @param tiers Campaign tier rows from ingest snapshot.
 */
export function listCampaignPatreonTierIds(tiers: IngestTier[] | undefined): string[] {
  if (!tiers?.length) return [];
  const ids = tiers.map((t) => t.tier_id).filter((id) => id.startsWith("patreon_tier_"));
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function isPaidPatreonTierRow(t: IngestTier): boolean {
  return (
    t.tier_id.startsWith("patreon_tier_") &&
    typeof t.amount_cents === "number" &&
    Number.isFinite(t.amount_cents) &&
    t.amount_cents > 0
  );
}

/**
 * Paid `patreon_tier_*` ids from the campaign catalog (`amount_cents > 0` only).
 * Sorted by pledge floor descending, then `tier_id` for stability.
 * Free / $0 Patreon tiers are excluded so `relay_tier_all_patrons` expansion does not
 * attach a "Free" tier id to paid-only posts.
 * @param tiers Campaign tier rows.
 */
export function listCampaignPaidPatreonTierIds(tiers: IngestTier[] | undefined): string[] {
  if (!tiers?.length) return [];
  const paid = tiers.filter(isPaidPatreonTierRow);
  paid.sort((a, b) => {
    const da = a.amount_cents ?? 0;
    const db = b.amount_cents ?? 0;
    if (db !== da) return db - da;
    return a.tier_id.localeCompare(b.tier_id);
  });
  return [...new Set(paid.map((t) => t.tier_id))];
}

/** True if the batch tier catalog includes any `patreon_tier_*` row (paid or not). */
export function hasCampaignPatreonTierRows(tiers: IngestTier[] | undefined): boolean {
  return tiers?.some((t) => t.tier_id.startsWith("patreon_tier_")) ?? false;
}

/**
 * When Patreon encodes "all paid tiers" as `relay_tier_all_patrons` with no explicit
 * tier list, replace with the full set of known `patreon_tier_*` ids from the campaign.
 * Idempotent: already-concrete lists are unchanged.
 * @param tierIds Post-level tier id list (possibly synthetic).
 * @param patreonTierIds Concrete paid Patreon tier ids from {@link listCampaignPaidPatreonTierIds}.
 */
export function expandAllPatronsTierIds(
  tierIds: string[],
  patreonTierIds: string[]
): string[] {
  if (
    tierIds.length !== 1 ||
    tierIds[0] !== RELAY_TIER_ALL_PATRONS ||
    patreonTierIds.length === 0
  ) {
    return tierIds;
  }
  return [...patreonTierIds];
}
