/**
 * Persist tier → independent billing product/price mapping (EH-054).
 * File: data/billing-tier-map.json — no secrets.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BILLING_TIER_MAP_CONTRACT = "eh-billing-tier-map/1.0.0" as const;
export const BILLING_TIER_MAP_FILENAME = "billing-tier-map.json";

export type BillingTierMapEntry = {
  tierId: string;
  productId: string | null;
  priceId: string | null;
  currency: string | null;
  unitAmountCents: number | null;
  interval: "month" | "year" | "week" | "day" | null;
  /** Optional note for Patreon continuity / source tier label. */
  patreonContinuityNote: string | null;
  /** Public benefit blurb for /tiers cards. */
  benefitCopy: string | null;
  updatedAt: string;
};

export type BillingTierMapDocument = {
  contract_version: typeof BILLING_TIER_MAP_CONTRACT;
  site_id: string;
  production_safe: false;
  entries: BillingTierMapEntry[];
  updatedAt: string | null;
};

function dataPath(kitDir: string): string {
  return join(kitDir, "data", BILLING_TIER_MAP_FILENAME);
}

export function emptyBillingTierMap(siteId: string): BillingTierMapDocument {
  return {
    contract_version: BILLING_TIER_MAP_CONTRACT,
    site_id: siteId,
    production_safe: false,
    entries: [],
    updatedAt: null
  };
}

export function loadBillingTierMap(
  siteId: string,
  kitDir = process.cwd()
): BillingTierMapDocument {
  const path = dataPath(kitDir);
  if (!existsSync(path)) return emptyBillingTierMap(siteId);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<BillingTierMapDocument>;
    if (
      parsed.contract_version !== BILLING_TIER_MAP_CONTRACT ||
      typeof parsed.site_id !== "string"
    ) {
      return emptyBillingTierMap(siteId);
    }
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter(
          (e): e is BillingTierMapEntry =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as BillingTierMapEntry).tierId === "string"
        )
      : [];
    return {
      contract_version: BILLING_TIER_MAP_CONTRACT,
      site_id: parsed.site_id,
      production_safe: false,
      entries,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : null
    };
  } catch {
    return emptyBillingTierMap(siteId);
  }
}

export function getMappedPriceId(
  map: BillingTierMapDocument,
  tierId: string
): string | null {
  const entry = map.entries.find((e) => e.tierId === tierId);
  const price = entry?.priceId?.trim();
  return price ? price : null;
}

export function getTierMapEntry(
  map: BillingTierMapDocument,
  tierId: string
): BillingTierMapEntry | null {
  return map.entries.find((e) => e.tierId === tierId) ?? null;
}

export type SaveBillingTierMapInput = {
  siteId: string;
  entries: Array<{
    tierId: string;
    productId?: string | null;
    priceId?: string | null;
    currency?: string | null;
    unitAmountCents?: number | null;
    interval?: "month" | "year" | "week" | "day" | null;
    patreonContinuityNote?: string | null;
    benefitCopy?: string | null;
  }>;
  kitDir?: string;
  nowIso?: string;
};

export function saveBillingTierMap(
  input: SaveBillingTierMapInput
):
  | { ok: true; document: BillingTierMapDocument }
  | { ok: false; reason: string } {
  const kitDir = input.kitDir ?? process.cwd();
  const nowIso = input.nowIso ?? new Date().toISOString();
  const byTier = new Map<string, BillingTierMapEntry>();

  for (const raw of input.entries) {
    const tierId = typeof raw.tierId === "string" ? raw.tierId.trim() : "";
    if (!tierId) return { ok: false, reason: "tier_id_required" };
    const priceId =
      typeof raw.priceId === "string" && raw.priceId.trim()
        ? raw.priceId.trim()
        : null;
    const productId =
      typeof raw.productId === "string" && raw.productId.trim()
        ? raw.productId.trim()
        : null;
    const currency =
      typeof raw.currency === "string" && raw.currency.trim()
        ? raw.currency.trim().toUpperCase()
        : null;
    const unitAmountCents =
      typeof raw.unitAmountCents === "number" &&
      Number.isFinite(raw.unitAmountCents) &&
      raw.unitAmountCents >= 0
        ? Math.floor(raw.unitAmountCents)
        : null;
    const interval =
      raw.interval === "month" ||
      raw.interval === "year" ||
      raw.interval === "week" ||
      raw.interval === "day"
        ? raw.interval
        : null;

    byTier.set(tierId, {
      tierId,
      productId,
      priceId,
      currency,
      unitAmountCents,
      interval,
      patreonContinuityNote:
        typeof raw.patreonContinuityNote === "string"
          ? raw.patreonContinuityNote.trim() || null
          : null,
      benefitCopy:
        typeof raw.benefitCopy === "string"
          ? raw.benefitCopy.trim() || null
          : null,
      updatedAt: nowIso
    });
  }

  const document: BillingTierMapDocument = {
    contract_version: BILLING_TIER_MAP_CONTRACT,
    site_id: input.siteId,
    production_safe: false,
    entries: [...byTier.values()].sort((a, b) =>
      a.tierId.localeCompare(b.tierId)
    ),
    updatedAt: nowIso
  };

  const dir = join(kitDir, "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    dataPath(kitDir),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8"
  );
  return { ok: true, document };
}
