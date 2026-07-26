/**
 * Unified /tiers catalog builder (EH-054).
 */

import type { CloneTierRule } from "../contracts";
import {
  resolveTierConversionAction,
  type ConversionAction,
  type ConversionSubject
} from "./conversion";
import type { PolicyRouteDecision } from "./policy";
import {
  getTierMapEntry,
  type BillingTierMapDocument
} from "./tier-map";

export type TierCatalogCard = {
  tierId: string;
  title: string;
  accessLevel: string;
  amountCents: number | null;
  priceLabel: string;
  interval: string | null;
  benefitCopy: string;
  patreonContinuityNote: string | null;
  mapped: boolean;
  priceId: string | null;
  action: ConversionAction;
};

function formatMoney(cents: number | null, currency: string | null): string {
  if (cents === null || !Number.isFinite(cents)) return "Price unset";
  const cur = (currency ?? "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}

export function buildTierCatalogCards(args: {
  catalog: readonly CloneTierRule[];
  map: BillingTierMapDocument;
  subject: ConversionSubject;
  policy: PolicyRouteDecision;
}): TierCatalogCard[] {
  const sorted = [...args.catalog].sort((a, b) => {
    const aa =
      typeof a.amount_cents === "number" && Number.isFinite(a.amount_cents)
        ? a.amount_cents
        : Number.MAX_SAFE_INTEGER;
    const bb =
      typeof b.amount_cents === "number" && Number.isFinite(b.amount_cents)
        ? b.amount_cents
        : Number.MAX_SAFE_INTEGER;
    return aa - bb || a.title.localeCompare(b.title);
  });

  return sorted
    .filter((tier) => tier.retired !== true)
    .map((tier) => {
    const entry = getTierMapEntry(args.map, tier.tier_id);
    const amount =
      entry?.unitAmountCents ??
      (typeof tier.amount_cents === "number" ? tier.amount_cents : null);
    const interval = entry?.interval ?? null;
    const action = resolveTierConversionAction({
      tier,
      map: args.map,
      subject: args.subject,
      policy: args.policy,
      catalog: args.catalog
    });
    const tierBenefit =
      typeof tier.benefit_copy === "string" && tier.benefit_copy.trim()
        ? tier.benefit_copy.trim()
        : null;
    return {
      tierId: tier.tier_id,
      title: tier.title,
      accessLevel: tier.access_level,
      amountCents: amount,
      priceLabel: formatMoney(amount, entry?.currency ?? null),
      interval,
      benefitCopy:
        entry?.benefitCopy ??
        tierBenefit ??
        `Access level: ${tier.access_level.replace(/_/g, " ")}.`,
      patreonContinuityNote: entry?.patreonContinuityNote ?? null,
      mapped: Boolean(entry?.priceId?.trim()),
      priceId: entry?.priceId?.trim() || null,
      action
    };
  });
}
