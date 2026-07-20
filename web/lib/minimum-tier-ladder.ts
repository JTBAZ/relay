/**
 * Pure Patreon minimum-tier ladder for Audience & Promotion (Slice 2).
 * Options come only from the compose/synced catalog — never fallback mock labels.
 */

import type {
  MinimumTierAccessState,
  TierLadderRow
} from "@/lib/audience-promotion-contracts";
import type { RelayComposeTierRow } from "@/lib/relay-api";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "@/lib/tier-access";

export type LadderComposeTier = Pick<
  RelayComposeTierRow,
  "tier_id" | "relay_tier_id" | "title" | "amount_cents"
>;

function amountOrNull(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function sortCatalogByAmount(catalog: LadderComposeTier[]): LadderComposeTier[] {
  return [...catalog].sort((a, b) => {
    const ac = amountOrNull(a.amount_cents) ?? Number.POSITIVE_INFINITY;
    const bc = amountOrNull(b.amount_cents) ?? Number.POSITIVE_INFINITY;
    if (ac !== bc) return ac - bc;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function matchCatalogRow(
  catalog: LadderComposeTier[],
  relayOrComposeId: string
): LadderComposeTier | undefined {
  return (
    catalog.find((t) => t.relay_tier_id === relayOrComposeId) ??
    catalog.find((t) => t.tier_id === relayOrComposeId)
  );
}

/** Normalize gallery/upstream relay tier ids into Layer A minimum-tier state. */
export function buildMinimumTierAccessState(
  upstreamRelayTierIds: string[],
  catalog: LadderComposeTier[]
): MinimumTierAccessState {
  const upstream = upstreamRelayTierIds.map((id) => id.trim()).filter(Boolean);
  const concrete = upstream.filter(
    (id) => id !== RELAY_TIER_PUBLIC && id !== RELAY_TIER_ALL_PATRONS
  );

  if (concrete.length === 0) {
    return {
      is_public: true,
      minimum_tier_id: null,
      upstream_tier_ids: upstream
    };
  }

  const matched = concrete
    .map((id) => matchCatalogRow(catalog, id))
    .filter((row): row is LadderComposeTier => Boolean(row));

  const sorted = sortCatalogByAmount(matched.length > 0 ? matched : []);
  const floor = sorted[0] ?? null;

  return {
    is_public: false,
    /** Compose Prisma id for PATCH; null if upstream ids are unknown to catalog. */
    minimum_tier_id: floor?.tier_id ?? null,
    upstream_tier_ids: concrete,
    source: "RELAY"
  };
}

/**
 * Amount-sorted ladder rows for the Access checklist.
 * - Public gate: every catalog tier is `public` (open-web access; no paid minimum).
 * - Gated: exact floor is `minimum`; same or higher amount `implied`; lower `locked_out`.
 */
export function buildTierLadderRows(
  catalog: LadderComposeTier[],
  gate: MinimumTierAccessState
): TierLadderRow[] {
  const sorted = sortCatalogByAmount(catalog);

  if (gate.is_public || !gate.minimum_tier_id) {
    return sorted.map((row) => ({
      tier_id: row.tier_id,
      label: row.title.trim() || row.relay_tier_id,
      amount_cents: amountOrNull(row.amount_cents),
      state: gate.is_public ? ("public" as const) : ("locked_out" as const)
    }));
  }

  const floor = matchCatalogRow(sorted, gate.minimum_tier_id);
  const floorCents = amountOrNull(floor?.amount_cents);

  return sorted.map((row) => {
    const cents = amountOrNull(row.amount_cents);
    let state: TierLadderRow["state"];
    if (row.tier_id === gate.minimum_tier_id || row.relay_tier_id === gate.minimum_tier_id) {
      state = "minimum";
    } else if (floorCents !== null && cents !== null && cents >= floorCents) {
      state = "implied";
    } else if (floorCents === null && floor && row.tier_id === floor.tier_id) {
      state = "minimum";
    } else {
      state = "locked_out";
    }
    return {
      tier_id: row.tier_id,
      label: row.title.trim() || row.relay_tier_id,
      amount_cents: cents,
      state
    };
  });
}

/** Convenience: gate + ladder from upstream ids + compose catalog. */
export function buildMinimumTierLadder(
  upstreamRelayTierIds: string[],
  catalog: LadderComposeTier[]
): { gate: MinimumTierAccessState; rows: TierLadderRow[] } {
  const gate = buildMinimumTierAccessState(upstreamRelayTierIds, catalog);
  return { gate, rows: buildTierLadderRows(catalog, gate) };
}
