/**
 * Fan patronage plan display constants — Supporter / Curator / Free (MB-9).
 * Amounts match docs/financial-atlas.md. Stripe price IDs stay server-side.
 */

export type FanPlanId = "free" | "supporter" | "curator";

export type FanPlanCatalogEntry = {
  id: FanPlanId;
  name: string;
  priceLabel: string;
  priceUsd: number | null;
  monthlyTips: number;
  revealWindowDays: number | null;
  blurb: string;
};

export const FAN_PLAN_CATALOG: readonly FanPlanCatalogEntry[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    priceUsd: 0,
    monthlyTips: 0,
    revealWindowDays: null,
    blurb:
      "Your Patreon subscriptions in one clean gallery. Trade Tips for samples and promo deals."
  },
  {
    id: "supporter",
    name: "Supporter",
    priceLabel: "$5/mo",
    priceUsd: 5,
    monthlyTips: 5,
    revealWindowDays: 14,
    blurb:
      "First 5 Tips of the month included. Preview offers from artists hoping to be discovered."
  },
  {
    id: "curator",
    name: "Curator",
    priceLabel: "$14.99/mo",
    priceUsd: 14.99,
    monthlyTips: 15,
    revealWindowDays: 30,
    blurb:
      "30-day reveal windows, custom aesthetics, and premium collector tools."
  }
] as const;

/** WIP draft — onboarding + /plans pitch. */
export const FAN_PATRONAGE_PITCH =
  "Your gallery is always free. Paid plans include monthly Relay Tips for opening artist previews.";

export const RELOAD_PACK_LABEL = "Reload Pack — $5 for 10 Tips";

export function fanPlanEntry(id: FanPlanId | null | undefined): FanPlanCatalogEntry | null {
  if (!id) return null;
  return FAN_PLAN_CATALOG.find((p) => p.id === id) ?? null;
}

export function isPaidFanPlanId(value: unknown): value is "supporter" | "curator" {
  return value === "supporter" || value === "curator";
}
