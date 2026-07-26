import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "@/lib/tier-access";

/** Patron-safe locked-viewer promo DTO (Slice 9). */
export type EffectivePromo = {
  headline: string;
  cta_text: string;
  code: string | null;
  percent_off: number | null;
  tracked_url: string | null;
  source: "explicit" | "tier_default";
};

export function trackedPromoHref(
  promo: EffectivePromo | null | undefined,
  fallbackMembershipUrl?: string | null
): string {
  const tracked = promo?.tracked_url?.trim();
  if (tracked) {
    if (tracked.startsWith("http://") || tracked.startsWith("https://")) return tracked;
    return tracked.startsWith("/") ? tracked : `/${tracked}`;
  }
  const membership = fallbackMembershipUrl?.trim();
  if (membership) return membership;
  return "https://www.patreon.com";
}

export type GateCatalogTier = {
  relay_tier_id: string;
  amount_cents: number | null;
};

/** Minimum gate Relay tier id for tier-default lookup (mirrors server resolver). */
export function resolveMinimumGateRelayTierId(
  postTierIds: readonly string[],
  catalog: readonly GateCatalogTier[]
): string | null {
  const concrete = postTierIds
    .map((id) => id.trim())
    .filter((id) => id && id !== RELAY_TIER_PUBLIC && id !== RELAY_TIER_ALL_PATRONS);
  if (concrete.length === 0) return null;

  const byId = new Map(
    catalog.map((t) => [t.relay_tier_id.trim(), t] as const).filter(([id]) => Boolean(id))
  );

  let floorId: string | null = null;
  let floorCents = Number.POSITIVE_INFINITY;
  for (const id of concrete) {
    const row = byId.get(id);
    const cents =
      row && typeof row.amount_cents === "number" && Number.isFinite(row.amount_cents)
        ? row.amount_cents
        : Number.POSITIVE_INFINITY;
    if (cents < floorCents || (cents === floorCents && (floorId === null || id < floorId))) {
      floorCents = cents;
      floorId = id;
    }
  }
  if (floorId === null || floorCents === Number.POSITIVE_INFINITY) {
    return [...concrete].sort()[0] ?? null;
  }
  return floorId;
}
