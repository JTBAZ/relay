/**
 * Provider policy router (EH-052).
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
  PROVIDER_POLICY_MATRIX,
  type ContentUseCategory,
  type PolicyEligibility,
  type ProviderPolicyRow
} from "./matrix";

export type BillingRecipeId =
  | "stripe_eligible_business"
  | "archive_free_patreon_only"
  | "alternate_pending_human_approval";

export type BillingRecipe = {
  id: BillingRecipeId;
  title: string;
  offered: boolean;
  reason: string;
  requiresHumanApproval: boolean;
};

export type PolicyRouteDecision = {
  production_safe: false;
  category: ContentUseCategory;
  attestationComplete: boolean;
  stripeEligibility: PolicyEligibility;
  stripeOffered: boolean;
  paidLaunchAllowed: boolean;
  recipes: BillingRecipe[];
  matrixCheckedAt: string;
  matrixPolicyUrl: string;
  blockers: string[];
  detail: string;
};

function stripeEligibilityFor(
  category: ContentUseCategory,
  row: ProviderPolicyRow = getBillingPolicyRow()
): PolicyEligibility {
  return row.eligibilityByCategory[category] ?? "unknown";
}

/**
 * Route attestation → recipes. Never invent Stripe eligibility for undeclared/prohibited.
 */
export function routeProviderPolicy(
  attestation: ContentUseAttestation
): PolicyRouteDecision {
  const row = getBillingPolicyRow();
  const complete = isAttestationComplete(attestation);
  const category = complete ? attestation.category : "undeclared";
  const stripeEligibility = stripeEligibilityFor(category, row);
  const stripeOffered = complete && stripeEligibility === "allowed";

  const recipes: BillingRecipe[] = [
    {
      id: "stripe_eligible_business",
      title: "Creator-owned Stripe Billing (eligible businesses)",
      offered: stripeOffered,
      reason: stripeOffered
        ? `Attestation category "${category}" is allowed for Stripe per matrix checked ${row.checkedAt}.`
        : !complete
          ? "Complete content/use attestation before Stripe can be offered."
          : stripeEligibility === "prohibited"
            ? "Stripe policy prohibits this declared use — do not route through Stripe or misclassify."
            : stripeEligibility === "restricted"
              ? "Declared use is Stripe-restricted — Escape Hatch does not auto-offer Stripe; seek human/legal path."
              : "Stripe eligibility unknown for this declaration.",
      requiresHumanApproval: false
    },
    {
      id: "archive_free_patreon_only",
      title: "Archive / free / Patreon-entitled site (no independent Checkout)",
      offered: true,
      reason:
        "Always available. Site remains usable without independent billing while Stripe is unresolved or ineligible.",
      requiresHumanApproval: false
    },
    {
      id: "alternate_pending_human_approval",
      title: "Lawful alternate billing processor (EH-053)",
      offered: false,
      reason:
        "Not implemented until human product/legal approval + sandbox parity (EH-053).",
      requiresHumanApproval: true
    }
  ];

  const blockers: string[] = [];
  if (!complete) {
    blockers.push(
      "Content/use attestation incomplete — independent paid launch blocked."
    );
  } else if (!stripeOffered) {
    blockers.push(
      "No Stripe-compatible recipe for declared use — independent Checkout blocked; archive/Patreon path remains."
    );
  }

  const paidLaunchAllowed = stripeOffered;

  return {
    production_safe: false,
    category,
    attestationComplete: complete,
    stripeEligibility,
    stripeOffered,
    paidLaunchAllowed,
    recipes,
    matrixCheckedAt: row.checkedAt,
    matrixPolicyUrl: row.policyUrl,
    blockers,
    detail: paidLaunchAllowed
      ? `Paid independent launch allowed via Stripe (matrix ${row.checkedAt}). productionSafe remains false.`
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
 * Gate independent Checkout / paid launch.
 * Fail closed unless attestation routes to an offered Stripe recipe.
 */
export function assertIndependentCheckoutAllowed(args: {
  siteId: string;
  kitDir?: string;
}):
  | { ok: true; decision: PolicyRouteDecision }
  | { ok: false; reason: string; decision: PolicyRouteDecision } {
  const decision = evaluateSiteProviderPolicy(
    args.siteId,
    args.kitDir ?? process.cwd()
  );
  if (!decision.paidLaunchAllowed) {
    return {
      ok: false,
      reason: decision.attestationComplete
        ? "provider_policy_blocks_stripe"
        : "provider_policy_attestation_required",
      decision
    };
  }
  return { ok: true, decision };
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
