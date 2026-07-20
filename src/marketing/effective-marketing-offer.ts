/**
 * Permission-safe effective marketing promo resolution (Slice 9).
 * Precedence: exact post/persona override → matching creator tier default → none.
 * Never widens Layer A; hidden / allow → no promo.
 */

import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../patreon/relay-access-tiers.js";
import type { PostPermissionOutcome } from "../gallery/post-permission.js";
import type { AudiencePersonaKeyServer } from "../gallery/tier-preview-settings.js";

export type EffectivePromoSource = "explicit" | "tier_default";

/** Patron-safe DTO — no code libraries, raw destinations, or other personas. */
export type EffectivePromoDto = {
  headline: string;
  cta_text: string;
  code: string | null;
  percent_off: number | null;
  tracked_url: string | null;
  source: EffectivePromoSource;
};

export type ExplicitOfferCandidate = {
  active: boolean;
  audience_key: string;
  headline: string;
  cta_text: string;
  redirect_slug: string | null;
  discount_code: {
    code: string;
    percent_off: number;
    active: boolean;
  } | null;
  code_missing?: boolean;
};

export type TierDefaultCandidate = {
  active: boolean;
  gate_relay_tier_id: string;
  segment: string;
  headline: string;
  cta_text: string;
  redirect_slug: string | null;
  discount_code: {
    code: string;
    percent_off: number;
    active: boolean;
  } | null;
  code_missing?: boolean;
};

export type CatalogTierAmount = {
  relay_tier_id: string;
  amount_cents: number | null;
};

/**
 * Normalize post gate tier ids to the minimum (floor) Relay tier id by catalog amount.
 * Public / empty → null (no tier default applies).
 */
export function resolveMinimumGateRelayTierId(
  postTierIds: readonly string[],
  catalog: readonly CatalogTierAmount[]
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
  // Unknown catalog amounts: still pick a deterministic floor (lexicographically first).
  if (floorId === null || floorCents === Number.POSITIVE_INFINITY) {
    return [...concrete].sort()[0] ?? null;
  }
  return floorId;
}

function trackedUrlFromSlug(slug: string | null | undefined): string | null {
  const s = typeof slug === "string" ? slug.trim() : "";
  return s ? `/go/${s}` : null;
}

function toPromoFromOffer(
  offer: ExplicitOfferCandidate,
  source: EffectivePromoSource
): EffectivePromoDto | null {
  if (!offer.active) return null;
  const codeRow = offer.discount_code;
  const codeOk = Boolean(codeRow && codeRow.active && !offer.code_missing);
  const headline = offer.headline.trim();
  const cta = offer.cta_text.trim();
  // Inactive/missing code still allows copy-only promo when headline or CTA present.
  if (!headline && !cta && !codeOk) return null;
  return {
    headline,
    cta_text: cta || (codeOk ? `Use code ${codeRow!.code}` : "Unlock on Patreon"),
    code: codeOk ? codeRow!.code : null,
    percent_off: codeOk ? codeRow!.percent_off : null,
    tracked_url: trackedUrlFromSlug(offer.redirect_slug),
    source
  };
}

function toPromoFromTierDefault(row: TierDefaultCandidate): EffectivePromoDto | null {
  if (!row.active || row.segment !== "unpermissioned") return null;
  return toPromoFromOffer(
    {
      active: row.active,
      audience_key: "anonymous",
      headline: row.headline,
      cta_text: row.cta_text,
      redirect_slug: row.redirect_slug,
      discount_code: row.discount_code,
      code_missing: row.code_missing
    },
    "tier_default"
  );
}

/**
 * Pure resolver — callers supply already-loaded candidates and permission outcome.
 */
export function resolveEffectiveMarketingOffer(args: {
  permissionOutcome: PostPermissionOutcome["outcome"] | "missing_post" | "hidden";
  /** One or more viewer persona keys (`anonymous`, `tier:…`); exact override tried in order. */
  audienceKey?: AudiencePersonaKeyServer | string;
  audienceKeys?: readonly (AudiencePersonaKeyServer | string)[];
  postTierIds: readonly string[];
  catalogTiers: readonly CatalogTierAmount[];
  explicitOffers: readonly ExplicitOfferCandidate[];
  tierDefaults: readonly TierDefaultCandidate[];
}): EffectivePromoDto | null {
  const outcome = args.permissionOutcome;
  if (outcome === "allow" || outcome === "missing_post" || outcome === "hidden") {
    return null;
  }
  if (outcome !== "deny" && outcome !== "locked_preview") {
    return null;
  }

  const personas = (
    args.audienceKeys?.length
      ? args.audienceKeys
      : args.audienceKey != null
        ? [args.audienceKey]
        : []
  ).map((k) => String(k).trim()).filter(Boolean);

  for (const persona of personas) {
    const exact = args.explicitOffers.find(
      (o) => o.active && o.audience_key === persona
    );
    if (exact) {
      const fromExact = toPromoFromOffer(exact, "explicit");
      if (fromExact) return fromExact;
    }
  }

  const gateTierId = resolveMinimumGateRelayTierId(args.postTierIds, args.catalogTiers);
  if (!gateTierId) return null;

  const tierDefault = args.tierDefaults.find(
    (d) =>
      d.active &&
      d.segment === "unpermissioned" &&
      d.gate_relay_tier_id.trim() === gateTierId
  );
  if (!tierDefault) return null;
  return toPromoFromTierDefault(tierDefault);
}
