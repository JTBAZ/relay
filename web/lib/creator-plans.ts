/**
 * Artist SaaS plan display constants — single source for Studio billing UX.
 * Amounts match docs/financial-atlas.md + AUTOPOST_BUILD_PLAN Good/Better/Best.
 * Stripe price IDs live in server env only; never hardcode cents into Checkout.
 */

export type CreatorPlanId = "studio_core" | "autopost" | "growth_engine";

export type CreatorPlanCatalogEntry = {
  id: CreatorPlanId;
  /** Good / Better / Best ladder label */
  ladder: "Good" | "Better" | "Best";
  name: string;
  /** Display price string (atlas); not used for charging */
  priceLabel: string;
  /** Monthly dollars for display only */
  priceUsd: number;
  blurb: string;
};

export const CREATOR_PLAN_CATALOG: readonly CreatorPlanCatalogEntry[] = [
  {
    id: "studio_core",
    ladder: "Good",
    name: "Studio Core",
    priceLabel: "$18/mo",
    priceUsd: 18,
    blurb: "Library curation, gallery, analytics, backup sync, Promo Pool, and manual Schedule Rail events with one-off extension reminders."
  },
  {
    id: "autopost",
    ladder: "Better",
    name: "Autopost",
    priceLabel: "$39/mo",
    priceUsd: 39,
    blurb: "Full Autopost pipeline, Style Profile, Coach, Goal Cycle sequences, cross-post drafts, recurring routines, and follow-up social playbooks."
  },
  {
    id: "growth_engine",
    ladder: "Best",
    name: "Growth Engine",
    priceLabel: "$79/mo",
    priceUsd: 79,
    blurb: "Everything in Autopost, plus multilingual, A/B, and advanced targeting as they ship."
  }
] as const;

export const FREEMIUM_PITCH =
  "Free: sync, backup, and basic gallery. Upgrade when you want Studio tools or Autopost.";

export function creatorPlanEntry(id: CreatorPlanId | null | undefined): CreatorPlanCatalogEntry | null {
  if (!id) return null;
  return CREATOR_PLAN_CATALOG.find((p) => p.id === id) ?? null;
}
