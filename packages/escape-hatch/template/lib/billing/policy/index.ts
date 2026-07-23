/**
 * Provider policy router (EH-052 / EH-053).
 * Maps content/use attestation → compatible recipes; blocks paid launch when none.
 */

export {
  CONTENT_ATTESTATION_CONTRACT,
  CONTENT_ATTESTATION_FILENAME,
  emptyContentUseAttestation,
  isAttestationComplete,
  loadContentUseAttestation,
  saveContentUseAttestation,
  type ContentUseAttestation,
  type SaveContentUseAttestationInput
} from "./attestation";

export {
  CONTENT_USE_CATEGORY_LABELS,
  getBillingPolicyRow,
  getProviderPolicyRow,
  isContentUseCategory,
  PROVIDER_POLICY_MATRIX,
  PROVIDER_POLICY_MATRIX_CONTRACT,
  type ContentUseCategory,
  type PolicyEligibility,
  type PolicyRole,
  type ProviderPolicyRow
} from "./matrix";

import {
  isAttestationComplete,
  loadContentUseAttestation,
  type ContentUseAttestation
} from "./attestation";
import {
  getBillingPolicyRow,
  getProviderPolicyRow,
  PROVIDER_POLICY_MATRIX,
  type ContentUseCategory,
  type PolicyEligibility,
  type ProviderPolicyRow
} from "./matrix";
import type { BillingImplementation } from "../types";

export type BillingRecipeId =
  | "stripe_eligible_business"
  | "archive_free_patreon_only"
  | "nowpayments_crypto_recurring"
  | "ccbill_merchant_card"
  | "segpay_merchant_card";

export type CheckoutCapableProvider = "stripe" | "nowpayments";

export type BillingRecipe = {
  id: BillingRecipeId;
  title: string;
  offered: boolean;
  reason: string;
  requiresHumanApproval: boolean;
  /** CCBill/Segpay-style underwriting — not one-click. */
  requiresMerchantApproval: boolean;
  /** Which BillingProvider may run Checkout if offered; null = guidance only. */
  checkoutProvider: CheckoutCapableProvider | null;
};

export type PolicyRouteDecision = {
  production_safe: false;
  category: ContentUseCategory;
  attestationComplete: boolean;
  stripeEligibility: PolicyEligibility;
  stripeOffered: boolean;
  nowpaymentsOffered: boolean;
  /** Independent money path available (Stripe and/or NOWPayments recipe). */
  paidLaunchAllowed: boolean;
  /** Providers allowed to create Checkout for this attestation. */
  checkoutProviders: CheckoutCapableProvider[];
  recipes: BillingRecipe[];
  matrixCheckedAt: string;
  matrixPolicyUrl: string;
  blockers: string[];
  detail: string;
};

function eligibilityFor(
  category: ContentUseCategory,
  row: ProviderPolicyRow | undefined
): PolicyEligibility {
  if (!row) return "unknown";
  return row.eligibilityByCategory[category] ?? "unknown";
}

/**
 * Route attestation → recipes. Never invent Stripe eligibility for undeclared/prohibited.
 */
export function routeProviderPolicy(
  attestation: ContentUseAttestation
): PolicyRouteDecision {
  const stripeRow = getBillingPolicyRow();
  const nowRow = getProviderPolicyRow("nowpayments");
  const ccbillRow = getProviderPolicyRow("ccbill");
  const segpayRow = getProviderPolicyRow("segpay");

  const complete = isAttestationComplete(attestation);
  const category = complete ? attestation.category : "undeclared";
  const stripeEligibility = eligibilityFor(category, stripeRow);
  const stripeOffered = complete && stripeEligibility === "allowed";

  const nowEligibility = eligibilityFor(category, nowRow);
  const needsAlternate =
    complete &&
    (stripeEligibility === "prohibited" || stripeEligibility === "restricted");
  const nowpaymentsOffered =
    needsAlternate && nowEligibility === "allowed";

  const merchantGuidanceOffered = needsAlternate;

  const recipes: BillingRecipe[] = [
    {
      id: "stripe_eligible_business",
      title: "Creator-owned Stripe Billing (eligible businesses)",
      offered: stripeOffered,
      reason: stripeOffered
        ? `Attestation category "${category}" is allowed for Stripe per matrix checked ${stripeRow.checkedAt}.`
        : !complete
          ? "Complete content/use attestation before Stripe can be offered."
          : stripeEligibility === "prohibited"
            ? "Stripe policy prohibits this declared use — do not route through Stripe or misclassify."
            : stripeEligibility === "restricted"
              ? "Declared use is Stripe-restricted — Escape Hatch does not auto-offer Stripe; seek human/legal path."
              : "Stripe eligibility unknown for this declaration.",
      requiresHumanApproval: false,
      requiresMerchantApproval: false,
      checkoutProvider: "stripe"
    },
    {
      id: "archive_free_patreon_only",
      title: "Archive / free / Patreon-entitled site (no independent Checkout)",
      offered: true,
      reason:
        "Always available. Site remains usable without independent billing while card/crypto recipes are unresolved.",
      requiresHumanApproval: false,
      requiresMerchantApproval: false,
      checkoutProvider: null
    },
    {
      id: "nowpayments_crypto_recurring",
      title: "NOWPayments crypto recurring (creator-owned wallet)",
      offered: nowpaymentsOffered,
      reason: nowpaymentsOffered
        ? `Stripe-ineligible declaration → NOWPayments crypto recipe offered (matrix ${nowRow?.checkedAt ?? "n/a"}). Crypto renewals require patron payment each cycle.`
        : !complete
          ? "Complete attestation before alternate processors are offered."
          : !needsAlternate
            ? "Stripe-eligible path preferred when allowed; NOWPayments is for Stripe-gap categories."
            : "NOWPayments not auto-offered for this category — re-check matrix / ToS.",
      requiresHumanApproval: false,
      requiresMerchantApproval: false,
      checkoutProvider: "nowpayments"
    },
    {
      id: "ccbill_merchant_card",
      title: "CCBill high-risk card merchant (guidance)",
      offered: merchantGuidanceOffered,
      reason: merchantGuidanceOffered
        ? `Guidance only (matrix ${ccbillRow?.checkedAt ?? "n/a"}). Requires an approved CCBill merchant account — LLC/registered business + underwriting most times. Escape Hatch does not auto-provision.`
        : !complete
          ? "Complete attestation before merchant recipes are listed."
          : "CCBill guidance shown when Stripe is prohibited/restricted for the declared use.",
      requiresHumanApproval: true,
      requiresMerchantApproval: true,
      checkoutProvider: null
    },
    {
      id: "segpay_merchant_card",
      title: "Segpay high-risk card merchant (guidance)",
      offered: merchantGuidanceOffered,
      reason: merchantGuidanceOffered
        ? `Guidance only (matrix ${segpayRow?.checkedAt ?? "n/a"}). Requires an approved Segpay merchant account — LLC/registered business + underwriting most times. Escape Hatch does not auto-provision.`
        : !complete
          ? "Complete attestation before merchant recipes are listed."
          : "Segpay guidance shown when Stripe is prohibited/restricted for the declared use.",
      requiresHumanApproval: true,
      requiresMerchantApproval: true,
      checkoutProvider: null
    }
  ];

  const checkoutProviders: CheckoutCapableProvider[] = [];
  if (stripeOffered) checkoutProviders.push("stripe");
  if (nowpaymentsOffered) checkoutProviders.push("nowpayments");

  const blockers: string[] = [];
  if (!complete) {
    blockers.push(
      "Content/use attestation incomplete — independent paid launch blocked."
    );
  } else if (checkoutProviders.length === 0) {
    blockers.push(
      "No Checkout-capable recipe for declared use — independent Checkout blocked; archive/Patreon path remains. CCBill/Segpay require separate merchant approval before card adapters can ship."
    );
  }

  const paidLaunchAllowed = checkoutProviders.length > 0;

  return {
    production_safe: false,
    category,
    attestationComplete: complete,
    stripeEligibility,
    stripeOffered,
    nowpaymentsOffered,
    paidLaunchAllowed,
    checkoutProviders,
    recipes,
    matrixCheckedAt: stripeRow.checkedAt,
    matrixPolicyUrl: stripeRow.policyUrl,
    blockers,
    detail: paidLaunchAllowed
      ? `Paid independent launch allowed via ${checkoutProviders.join(" + ")} (matrix ${stripeRow.checkedAt}). productionSafe remains false.`
      : `Paid independent launch blocked. ${blockers.join(" ")}`
  };
}

export function evaluateSiteProviderPolicy(
  siteId: string,
  kitDir = process.cwd()
): PolicyRouteDecision {
  return routeProviderPolicy(loadContentUseAttestation(siteId, kitDir));
}

/**
 * Gate independent Checkout / paid launch for a specific BillingProvider.
 * Stripe never unlocks for adult_sexual_gratification; NOWPayments may.
 * CCBill/Segpay guidance never unlocks Checkout alone.
 */
export function assertIndependentCheckoutAllowed(args: {
  siteId: string;
  kitDir?: string;
  /** Active billing adapter — defaults to stripe for backward-compatible callers. */
  implementation?: BillingImplementation;
}):
  | { ok: true; decision: PolicyRouteDecision }
  | { ok: false; reason: string; decision: PolicyRouteDecision } {
  const decision = evaluateSiteProviderPolicy(
    args.siteId,
    args.kitDir ?? process.cwd()
  );
  const impl = args.implementation ?? "stripe";

  if (!decision.attestationComplete) {
    return {
      ok: false,
      reason: "provider_policy_attestation_required",
      decision
    };
  }

  if (impl === "stub") {
    return {
      ok: false,
      reason: "provider_policy_billing_stub",
      decision
    };
  }

  if (impl === "stripe") {
    if (!decision.stripeOffered) {
      return {
        ok: false,
        reason: "provider_policy_blocks_stripe",
        decision
      };
    }
    return { ok: true, decision };
  }

  if (impl === "nowpayments") {
    if (!decision.nowpaymentsOffered) {
      return {
        ok: false,
        reason: "provider_policy_blocks_nowpayments",
        decision
      };
    }
    return { ok: true, decision };
  }

  return {
    ok: false,
    reason: "provider_policy_unknown_implementation",
    decision
  };
}

export function listMatrixSummary() {
  return {
    contract_version: PROVIDER_POLICY_MATRIX.contract_version,
    retrievedAt: PROVIDER_POLICY_MATRIX.retrievedAt,
    production_safe: false as const,
    rows: PROVIDER_POLICY_MATRIX.rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      product: r.product,
      role: r.role,
      policyUrl: r.policyUrl,
      checkedAt: r.checkedAt,
      nextReviewAt: r.nextReviewAt,
      adapterStatus: r.adapterStatus
    }))
  };
}
