import type { RelayComposeTierRow, TierFacet } from "./relay-api";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "./tier-access";

/** Sentinel value for the compose/public tier picker (not a Prisma tier id). */
export const LIBRARY_CREATE_POST_PUBLIC_TIER = "__library_is_public__";

export type AudienceGateState = {
  isPublic: boolean;
  /** Canonical relay tier ids on the post gate (empty when public). */
  relayTierIds: string[];
};

type TierCatalogRow = {
  tier_id: string;
  title: string;
  amount_cents: number | null;
};

export type AudienceAccessTierDiff = {
  losing: string[];
  gaining: string[];
};

export function gateFromAccessTiers(accessTiers: TierFacet[]): AudienceGateState {
  if (accessTiers.length === 0) {
    return { isPublic: true, relayTierIds: [] };
  }
  const ids = accessTiers.map((t) => t.tier_id);
  const concrete = ids.filter((id) => id !== RELAY_TIER_PUBLIC && id !== RELAY_TIER_ALL_PATRONS);
  if (ids.includes(RELAY_TIER_PUBLIC) && concrete.length === 0) {
    return { isPublic: true, relayTierIds: [] };
  }
  if (concrete.length > 0) {
    return { isPublic: false, relayTierIds: concrete };
  }
  return { isPublic: false, relayTierIds: ids };
}

export function gateFromComposeSelection(
  selectedTierId: string,
  catalog: RelayComposeTierRow[]
): AudienceGateState {
  if (selectedTierId === LIBRARY_CREATE_POST_PUBLIC_TIER) {
    return { isPublic: true, relayTierIds: [] };
  }
  const row = catalog.find((t) => t.tier_id === selectedTierId);
  const relayId = row?.relay_tier_id ?? selectedTierId;
  return { isPublic: false, relayTierIds: [relayId] };
}

function catalogFromCompose(catalog: RelayComposeTierRow[]): Record<string, TierCatalogRow> {
  const out: Record<string, TierCatalogRow> = {};
  for (const row of catalog) {
    out[row.relay_tier_id] = {
      tier_id: row.relay_tier_id,
      title: row.title,
      amount_cents: row.amount_cents
    };
  }
  return out;
}

function tierFloorCents(catalog: Record<string, TierCatalogRow>, tierId: string): number | null {
  if (tierId === RELAY_TIER_PUBLIC) return 0;
  if (tierId === RELAY_TIER_ALL_PATRONS) return 1;
  const row = catalog[tierId];
  const n = row?.amount_cents;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return null;
}

function userMeetsTierGates(
  requiredTierIds: string[],
  userTierIds: string[],
  catalog: Record<string, TierCatalogRow>
): boolean {
  if (requiredTierIds.length === 0) return false;
  for (const req of requiredTierIds) {
    const reqFloor = tierFloorCents(catalog, req);
    for (const uid of userTierIds) {
      if (uid === req) return true;
      const uFloor = tierFloorCents(catalog, uid);
      if (reqFloor !== null && uFloor !== null && uFloor >= reqFloor) return true;
    }
  }
  return false;
}

function isPaidPatronTier(row: TierCatalogRow | undefined): boolean {
  if (!row) return true;
  const amt = row.amount_cents;
  if (typeof amt === "number" && Number.isFinite(amt)) return amt > 0;
  const n = row.title.trim().toLowerCase();
  return !(n === "free" || n === "public" || n.startsWith("free "));
}

/** Whether a viewer represented by `patronRelayTierId` (null = open web) can see the post. */
export function patronCanViewGate(
  gate: AudienceGateState,
  patronRelayTierId: string | null,
  catalog: Record<string, TierCatalogRow>
): boolean {
  if (gate.isPublic) return true;
  if (patronRelayTierId === null) return false;

  const hasAllPatrons = gate.relayTierIds.some((id) => id === RELAY_TIER_ALL_PATRONS);
  const concrete = gate.relayTierIds.filter(
    (id) => id !== RELAY_TIER_PUBLIC && id !== RELAY_TIER_ALL_PATRONS
  );

  if (concrete.length === 0 && hasAllPatrons) {
    return isPaidPatronTier(catalog[patronRelayTierId]);
  }
  if (concrete.length === 0) return false;

  return userMeetsTierGates(concrete, [patronRelayTierId], catalog);
}

type AudienceSegment = { patronRelayTierId: string | null; label: string };

function audienceSegments(catalog: RelayComposeTierRow[]): AudienceSegment[] {
  const sorted = [...catalog].sort((a, b) => {
    const ac = a.amount_cents ?? 0;
    const bc = b.amount_cents ?? 0;
    if (ac !== bc) return ac - bc;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
  return [
    { patronRelayTierId: null, label: "Public (open web)" },
    ...sorted.map((row) => ({
      patronRelayTierId: row.relay_tier_id,
      label: row.title
    }))
  ];
}

export function diffAudienceAccessTiers(
  oldAccessTiers: TierFacet[],
  newSelectedTierId: string,
  catalog: RelayComposeTierRow[]
): AudienceAccessTierDiff {
  const oldGate = gateFromAccessTiers(oldAccessTiers);
  const newGate = gateFromComposeSelection(newSelectedTierId, catalog);
  const tierCatalog = catalogFromCompose(catalog);
  const losing: string[] = [];
  const gaining: string[] = [];

  for (const seg of audienceSegments(catalog)) {
    const before = patronCanViewGate(oldGate, seg.patronRelayTierId, tierCatalog);
    const after = patronCanViewGate(newGate, seg.patronRelayTierId, tierCatalog);
    if (before && !after) losing.push(seg.label);
    if (!before && after) gaining.push(seg.label);
  }

  return { losing, gaining };
}

export function affectedTierLabels(diff: AudienceAccessTierDiff): string[] {
  return Array.from(new Set([...diff.losing, ...diff.gaining]));
}

export function formatAudienceAccessConfirmCopy(
  diff: AudienceAccessTierDiff,
  options?: { multiTierCollapse?: boolean }
): {
  summaryLine: string;
  losingLine: string;
  gainingLine: string;
  multiTierNote?: string;
} {
  const affected = affectedTierLabels(diff);
  const list =
    affected.length > 0
      ? affected.join(", ")
      : "no audience tiers (access unchanged for listed segments)";
  const summaryLine = `This will change the following tiers' ability to see this post: ${list}. Do you want to proceed?`;
  const losingLine =
    diff.losing.length > 0
      ? `Tiers losing access: ${diff.losing.join(", ")}`
      : "Tiers losing access: none";
  const gainingLine =
    diff.gaining.length > 0
      ? `Tiers gaining access: ${diff.gaining.join(", ")}`
      : "Tiers gaining access: none";
  const multiTierNote = options?.multiTierCollapse
    ? "This post currently has multiple tier gates. Saving applies a single tier gate."
    : undefined;
  return { summaryLine, losingLine, gainingLine, multiTierNote };
}
