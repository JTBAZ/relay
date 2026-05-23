/**
 * PILOT-003 — Resolve human-readable tier labels from the normalized tier catalog
 * (`Tier` / canonical `TierRow`), not Patreon JSON snapshots or generic placeholders.
 */
import {
  evaluateTierRules,
  isFreeTier,
  paidUserTierIds,
  resolvePostAccessLevel
} from "../clone/tier-rules.js";
import type { TierRow } from "../ingest/canonical-store.js";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../patreon/relay-access-tiers.js";
import { effectiveTierAmountCents } from "./tier-access.js";

function formatFallbackTierId(tierId: string): string {
  if (tierId.startsWith("patreon_tier_")) return tierId.slice("patreon_tier_".length);
  if (tierId.startsWith("relay_tier_")) return tierId.slice("relay_tier_".length);
  return tierId;
}

/**
 * Highest pledge-floor tier on a post (matches library access chip selection).
 */
export function pickPrimaryTierIdForDisplay(
  tierIds: string[],
  tierCatalog: Record<string, TierRow>
): string | null {
  if (!tierIds.length) return null;
  let bestId = tierIds[0]!;
  let bestFloor = effectiveTierAmountCents(tierCatalog, bestId);
  for (let i = 1; i < tierIds.length; i++) {
    const id = tierIds[i]!;
    const floor = effectiveTierAmountCents(tierCatalog, id);
    if (floor > bestFloor || (floor === bestFloor && id.localeCompare(bestId) < 0)) {
      bestId = id;
      bestFloor = floor;
    }
  }
  return bestId;
}

function titleForTierId(tierId: string, tierCatalog: Record<string, TierRow>): string {
  const title = tierCatalog[tierId]?.title?.trim();
  return title || formatFallbackTierId(tierId);
}

function cheapestPaidTierTitle(tierCatalog: Record<string, TierRow>): string | null {
  const paid = Object.values(tierCatalog)
    .filter((t) => !t.tier_id.startsWith("relay_tier_") && !isFreeTier(t))
    .sort((a, b) => {
      const fa = effectiveTierAmountCents(tierCatalog, a.tier_id);
      const fb = effectiveTierAmountCents(tierCatalog, b.tier_id);
      if (fa !== fb) return fa - fb;
      return a.tier_id.localeCompare(b.tier_id);
    });
  const first = paid[0];
  return first ? titleForTierId(first.tier_id, tierCatalog) : null;
}

/**
 * Post access chip / patron feed badge label from catalog truth.
 */
export function resolvePostTierDisplayLabel(args: {
  tierIds: string[];
  tierCatalog: Record<string, TierRow>;
  isPublicPost?: boolean;
}): string {
  if (args.isPublicPost) return "Free";
  const tierCatalog = args.tierCatalog;
  const tierIds = args.tierIds;
  const tierRules = evaluateTierRules(tierCatalog);
  const postAccess = resolvePostAccessLevel(tierIds, tierRules);

  if (postAccess.level === "public") return "Free";

  const concreteIds =
    postAccess.tier_ids.length > 0
      ? postAccess.tier_ids
      : tierIds.filter((t) => t !== RELAY_TIER_PUBLIC && t !== RELAY_TIER_ALL_PATRONS);

  if (postAccess.level === "member_only" && concreteIds.length === 0) {
    return cheapestPaidTierTitle(tierCatalog) ?? "Any patron";
  }

  const primary = pickPrimaryTierIdForDisplay(concreteIds, tierCatalog);
  if (!primary) return "Member";
  return titleForTierId(primary, tierCatalog);
}

/**
 * Patron sidebar badge: highest entitled paid tier title, or "Free".
 */
export function resolvePatronEntitlementDisplayLabel(
  entitledTierIds: readonly string[],
  tierCatalog: Record<string, TierRow>
): string {
  const paid = paidUserTierIds(entitledTierIds, tierCatalog);
  if (paid.length === 0) return "Free";
  const primary = pickPrimaryTierIdForDisplay(paid, tierCatalog);
  if (!primary) return "Supporter";
  const title = tierCatalog[primary]?.title?.trim();
  return title || "Supporter";
}
