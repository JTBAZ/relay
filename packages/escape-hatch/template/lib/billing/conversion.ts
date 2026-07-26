/**
 * Context-aware conversion CTAs + duplicate-billing safeguards (EH-054).
 * Server-resolved only — never trust browser entitlement claims.
 */

import type { CloneTierRule } from "../contracts";
import {
  evaluateSiteProviderPolicy,
  type PolicyRouteDecision
} from "./policy";
import {
  getMappedPriceId,
  getTierMapEntry,
  type BillingTierMapDocument
} from "./tier-map";

export type ConversionActionKind =
  | "connect_patreon"
  | "choose_tier"
  | "already_included"
  | "manage_billing"
  | "upgrade"
  | "policy_blocked"
  | "unmapped"
  | "sign_in";

export type ConversionAction = {
  kind: ConversionActionKind;
  label: string;
  /** When true, independent Checkout must not be offered for this tier. */
  blocksCheckout: boolean;
  reason: string;
  priceId: string | null;
  href: string | null;
};

export type ConversionSubject = {
  signedIn: boolean;
  /** Entitlement tier ids (merged). */
  effectiveTier: readonly string[];
  /** Active grant sources (patreon / billing / manual). */
  activeSources: readonly string[];
  /** Soft-gate preview only when identity is unset. */
  softPersonaPreview?: boolean;
};

export type ResolveConversionInput = {
  tier: CloneTierRule;
  map: BillingTierMapDocument;
  subject: ConversionSubject;
  policy: PolicyRouteDecision;
  /** Catalog ordered by access / amount for upgrade detection. */
  catalog: readonly CloneTierRule[];
};

function hasEquivalentAccess(
  subject: ConversionSubject,
  tier: CloneTierRule,
  catalog: readonly CloneTierRule[]
): boolean {
  if (subject.effectiveTier.includes(tier.tier_id)) return true;
  const targetAmount =
    typeof tier.amount_cents === "number" && Number.isFinite(tier.amount_cents)
      ? tier.amount_cents
      : null;
  if (targetAmount === null) return false;
  for (const heldId of subject.effectiveTier) {
    const held = catalog.find((t) => t.tier_id === heldId);
    const heldAmount =
      typeof held?.amount_cents === "number" && Number.isFinite(held.amount_cents)
        ? held.amount_cents
        : null;
    if (heldAmount !== null && heldAmount >= targetAmount) return true;
  }
  return false;
}

/**
 * Resolve one primary action for a /tiers card.
 */
export function resolveTierConversionAction(
  input: ResolveConversionInput
): ConversionAction {
  const { tier, map, subject, policy, catalog } = input;
  const entry = getTierMapEntry(map, tier.tier_id);
  const priceId = getMappedPriceId(map, tier.tier_id);
  const equivalent = hasEquivalentAccess(subject, tier, catalog);
  const sources = new Set(
    subject.activeSources.map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
  const hasPatreon = sources.has("patreon");
  const hasBilling = sources.has("billing");

  if (!policy.paidLaunchAllowed && !equivalent) {
    return {
      kind: "policy_blocked",
      label: "Billing unavailable",
      blocksCheckout: true,
      reason: policy.detail || "Independent checkout blocked by provider policy.",
      priceId: null,
      href: "/admin/billing/policy"
    };
  }

  if (equivalent) {
    if (hasBilling && !hasPatreon) {
      return {
        kind: "manage_billing",
        label: "Manage billing",
        blocksCheckout: true,
        reason: "Active independent subscription already covers this access.",
        priceId: null,
        href: "/account"
      };
    }
    if (hasPatreon || hasBilling) {
      return {
        kind: "already_included",
        label: "Already included",
        blocksCheckout: true,
        reason: hasPatreon && hasBilling
          ? "Patreon and independent billing both cover this access — duplicate checkout blocked."
          : hasPatreon
            ? "Patreon membership already includes this access."
            : "Existing membership already includes this access.",
        priceId: null,
        href: "/account"
      };
    }
    return {
      kind: "already_included",
      label: "Already included",
      blocksCheckout: true,
      reason: "Current entitlement already includes this tier.",
      priceId: null,
      href: "/account"
    };
  }

  if (!subject.signedIn && !subject.softPersonaPreview) {
    // Contract: anonymous new → Choose this tier (login → checkout).
    // Connect Patreon is offered as a catalog-level secondary CTA, not per-card primary.
    return {
      kind: "choose_tier",
      label: "Choose this tier",
      blocksCheckout: !priceId,
      reason: priceId
        ? "Sign in, then start independent checkout for this mapped price."
        : "Map a price in Hatch Console before checkout can start.",
      priceId,
      href: `/login?next=${encodeURIComponent(`/tiers?checkout=${tier.tier_id}`)}`
    };
  }

  if (!subject.signedIn && subject.softPersonaPreview) {
    return {
      kind: "choose_tier",
      label: "Choose this tier",
      blocksCheckout: true,
      reason:
        "Soft persona preview only — independent checkout needs identity + mapped price.",
      priceId,
      href: "/login"
    };
  }

  // Signed in, insufficient access
  if (!priceId) {
    return {
      kind: "unmapped",
      label: "Coming soon",
      blocksCheckout: true,
      reason: "This tier is not mapped to an independent price yet.",
      priceId: null,
      href: null
    };
  }

  if (!policy.paidLaunchAllowed) {
    return {
      kind: "policy_blocked",
      label: "Billing unavailable",
      blocksCheckout: true,
      reason: policy.detail,
      priceId: null,
      href: "/account"
    };
  }

  return {
    kind: "upgrade",
    label: subject.effectiveTier.length > 0 ? "Upgrade" : "Choose this tier",
    blocksCheckout: false,
    reason: "Start independent checkout for the mapped price.",
    priceId,
    href: null
  };
}

/**
 * Fail closed when checkout would duplicate equivalent access.
 */
export function assertNoDuplicateBilling(args: {
  tier: CloneTierRule;
  catalog: readonly CloneTierRule[];
  subject: ConversionSubject;
}):
  | { ok: true }
  | { ok: false; reason: "duplicate_billing_prevented"; detail: string } {
  if (hasEquivalentAccess(args.subject, args.tier, args.catalog)) {
    return {
      ok: false,
      reason: "duplicate_billing_prevented",
      detail:
        "Equivalent access already active (Patreon and/or independent billing). Do not start another Checkout for this tier."
    };
  }
  return { ok: true };
}

export function buildConversionSubjectFromSummary(args: {
  signedIn: boolean;
  tierIds: readonly string[];
  source: string | null;
  softPersonaPreview?: boolean;
  /** Extra sources when dual-source is known. */
  activeSources?: readonly string[];
}): ConversionSubject {
  const sources = new Set<string>();
  if (args.source) sources.add(args.source);
  for (const s of args.activeSources ?? []) {
    if (s.trim()) sources.add(s.trim());
  }
  return {
    signedIn: args.signedIn,
    effectiveTier: [...args.tierIds],
    activeSources: [...sources],
    softPersonaPreview: args.softPersonaPreview === true
  };
}

export function loadPolicyForSite(siteId: string, kitDir?: string): PolicyRouteDecision {
  return evaluateSiteProviderPolicy(siteId, kitDir);
}
