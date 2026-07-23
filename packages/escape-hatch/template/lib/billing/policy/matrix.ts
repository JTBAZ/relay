/**
 * Dated provider policy matrix (EH-052).
 * Official URLs + checked dates — not legal advice. Wizard must surface checked date.
 */

export type ContentUseCategory =
  | "general_eligible_business"
  | "creative_non_adult"
  | "mature_non_sexual"
  | "adult_sexual_gratification"
  | "other_high_risk"
  | "undeclared";

export const CONTENT_ATTESTATION_CONTRACT =
  "eh-content-use-attestation/1.0.0" as const;

export type ContentUseAttestation = {
  contract_version: typeof CONTENT_ATTESTATION_CONTRACT;
  site_id: string;
  category: ContentUseCategory;
  /** Creator accepts they must follow linked provider policies. */
  acceptedProviderTerms: boolean;
  /** Creator affirms declaration is accurate (not legal advice). */
  affirmedAccurate: boolean;
  attestedAt: string | null;
  attestedByHint: string | null;
  production_safe: false;
  note: string;
};

export type PolicyRole =
  | "billing"
  | "hosting"
  | "storage"
  | "email"
  | "identity";

export type PolicyEligibility =
  | "allowed"
  | "restricted"
  | "prohibited"
  | "unknown";

export type ProviderPolicyRow = {
  id: string;
  provider: string;
  product: string;
  role: PolicyRole;
  policyUrl: string;
  /** ISO date when this matrix row was last checked against the official page. */
  checkedAt: string;
  /** ISO date when this row should be re-checked. */
  nextReviewAt: string;
  reviewer: string;
  eligibilityByCategory: Readonly<
    Record<ContentUseCategory, PolicyEligibility>
  >;
  regionNotes: string;
  accountApprovalNotes: string;
  adapterStatus: "preview_only" | "stub_only" | "not_implemented";
  migrationRoute: string;
  notes: readonly string[];
};

export const PROVIDER_POLICY_MATRIX_CONTRACT =
  "eh-provider-policy-matrix/1.0.0" as const;

/**
 * Release artifact — update checkedAt when re-reading official sources.
 * Stripe restricted-businesses page last observed: 2026-05-13 (retrieved 2026-07-23).
 */
export const PROVIDER_POLICY_MATRIX: {
  contract_version: typeof PROVIDER_POLICY_MATRIX_CONTRACT;
  production_safe: false;
  retrievedAt: string;
  rows: readonly ProviderPolicyRow[];
} = {
  contract_version: PROVIDER_POLICY_MATRIX_CONTRACT,
  production_safe: false,
  retrievedAt: "2026-07-23",
  rows: [
    {
      id: "stripe_billing_restricted_businesses",
      provider: "stripe",
      product: "Billing / Checkout / Customer Portal",
      role: "billing",
      policyUrl: "https://stripe.com/legal/restricted-businesses",
      checkedAt: "2026-07-23",
      nextReviewAt: "2026-10-23",
      reviewer: "escape-hatch-eh052",
      eligibilityByCategory: {
        general_eligible_business: "allowed",
        creative_non_adult: "allowed",
        mature_non_sexual: "restricted",
        adult_sexual_gratification: "prohibited",
        other_high_risk: "restricted",
        undeclared: "prohibited"
      },
      regionNotes:
        "Global Stripe-supported regions; jurisdiction-specific prohibitions may apply — creator must re-read official page.",
      accountApprovalNotes:
        "Restricted categories may require Stripe preapproval; Escape Hatch never auto-approves restricted use.",
      adapterStatus: "preview_only",
      migrationRoute:
        "If ineligible: keep archive/free/Patreon-entitled site; EH-053 NOWPayments crypto or CCBill/Segpay merchant recipes (merchant approval required for card high-risk).",
      notes: [
        "Stripe prohibits pornography and other mature audience content designed for sexual gratification (official list; page last updated 2026-05-13).",
        "Do not disguise content or advise misclassification.",
        "Prefer restricted API keys (rk_) for live adapters."
      ]
    },
    {
      id: "nowpayments_crypto_recurring",
      provider: "nowpayments",
      product: "Crypto recurring / invoices (creator wallet)",
      role: "billing",
      policyUrl: "https://nowpayments.io/",
      checkedAt: "2026-07-23",
      nextReviewAt: "2026-10-23",
      reviewer: "escape-hatch-eh053",
      eligibilityByCategory: {
        general_eligible_business: "restricted",
        creative_non_adult: "restricted",
        mature_non_sexual: "allowed",
        adult_sexual_gratification: "allowed",
        other_high_risk: "restricted",
        undeclared: "prohibited"
      },
      regionNotes:
        "Global crypto rails; creator owns wallet + NOWPayments account. Local law and NOWPayments ToS still bind.",
      accountApprovalNotes:
        "Creator creates NOWPayments account + API/IPN secrets. Re-read official ToS before launch; marketing pages are not permanence guarantees.",
      adapterStatus: "preview_only",
      migrationRoute:
        "Swap BillingProvider to nowpayments; entitlement contract unchanged. Crypto renewals ≠ card autopull.",
      notes: [
        "Primary EH-053 alternate when Stripe prohibits sexual-gratification / mature adult use.",
        "Official product pages list adult business among supported verticals (checked 2026-07-23) — still re-verify ToS.",
        "MoonPay classic is an on-ramp, not merchant subscriptions; MoonPay Commerce ToS restricts certain sexually oriented materials — not the Stripe-gap default."
      ]
    },
    {
      id: "ccbill_merchant_card",
      provider: "ccbill",
      product: "High-risk card merchant (subscriptions)",
      role: "billing",
      policyUrl: "https://ccbill.com/doc/general-faqs",
      checkedAt: "2026-07-23",
      nextReviewAt: "2026-10-23",
      reviewer: "escape-hatch-eh053",
      eligibilityByCategory: {
        general_eligible_business: "restricted",
        creative_non_adult: "restricted",
        mature_non_sexual: "restricted",
        adult_sexual_gratification: "restricted",
        other_high_risk: "restricted",
        undeclared: "prohibited"
      },
      regionNotes:
        "Visa/Mastercard via CCBill typically require U.S., Canadian, EU, or U.K. presence — see CCBill designated-country list.",
      accountApprovalNotes:
        "Requires approved CCBill merchant account. Most applicants need a registered business (LLC/corp or equivalent), IDs, bank details, live HTTPS site, and compliance review — Escape Hatch does not auto-provision or guarantee approval.",
      adapterStatus: "preview_only",
      migrationRoute:
        "Guidance-only in EH-053 — no live BillingProvider until creator has approved merchant credentials and a dedicated adapter ships.",
      notes: [
        "Official signup FAQ: company/sole-proprietor info, two forms of ID, site URL, payout bank (https://ccbill.com/doc/general-faqs).",
        "Sales inquiry for new merchants — existing accounts use Merchant Support.",
        "Honest default: treat as heavy onboarding, not a one-click Escape Hatch toggle."
      ]
    },
    {
      id: "segpay_merchant_card",
      provider: "segpay",
      product: "High-risk card merchant (subscriptions)",
      role: "billing",
      policyUrl: "https://www.segpay.com/",
      checkedAt: "2026-07-23",
      nextReviewAt: "2026-10-23",
      reviewer: "escape-hatch-eh053",
      eligibilityByCategory: {
        general_eligible_business: "restricted",
        creative_non_adult: "restricted",
        mature_non_sexual: "restricted",
        adult_sexual_gratification: "restricted",
        other_high_risk: "restricted",
        undeclared: "prohibited"
      },
      regionNotes:
        "Merchant inquiry includes country of incorporation and website — underwriting decides fit.",
      accountApprovalNotes:
        "Requires approved Segpay merchant account. Typically needs a legal entity (LLC/corp common), business banking, live site with policies, and underwriting — Escape Hatch does not auto-provision or guarantee approval.",
      adapterStatus: "preview_only",
      migrationRoute:
        "Guidance-only in EH-053 — no live BillingProvider until creator has approved merchant credentials and a dedicated adapter ships.",
      notes: [
        "Adult / dating / subscription vertical processor; apply via Segpay merchant inquiry — do not invent eligibility.",
        "Honest default: heavier than crypto onboarding; plan for LLC + document pack before expecting card Checkout."
      ]
    },
    {
      id: "r2_storage_placeholder",
      provider: "cloudflare_r2",
      product: "Object storage (private media)",
      role: "storage",
      policyUrl: "https://www.cloudflare.com/trust-hub/abuse-approach/",
      checkedAt: "2026-07-23",
      nextReviewAt: "2026-10-23",
      reviewer: "escape-hatch-eh052",
      eligibilityByCategory: {
        general_eligible_business: "allowed",
        creative_non_adult: "allowed",
        mature_non_sexual: "restricted",
        adult_sexual_gratification: "restricted",
        other_high_risk: "restricted",
        undeclared: "prohibited"
      },
      regionNotes: "Creator-owned R2 account; follow Cloudflare ToS/AUP.",
      accountApprovalNotes: "Creator is the account holder.",
      adapterStatus: "preview_only",
      migrationRoute: "Swap storage adapter; entitlement contract unchanged.",
      notes: [
        "Matrix row is routing guidance only — re-check Cloudflare ToS before paid launch.",
        "Private media delivery remains fail-closed without credentials."
      ]
    },
    {
      id: "email_stub",
      provider: "transactional_email",
      product: "Transactional email (stub until EH-072)",
      role: "email",
      policyUrl: "https://escape-hatch.local/docs/email-policy-pending",
      checkedAt: "2026-07-23",
      nextReviewAt: "2026-10-23",
      reviewer: "escape-hatch-eh052",
      eligibilityByCategory: {
        general_eligible_business: "unknown",
        creative_non_adult: "unknown",
        mature_non_sexual: "unknown",
        adult_sexual_gratification: "unknown",
        other_high_risk: "unknown",
        undeclared: "prohibited"
      },
      regionNotes: "No live email adapter in EH-052.",
      accountApprovalNotes: "Stub only.",
      adapterStatus: "stub_only",
      migrationRoute: "EH-072 transactional email.",
      notes: ["Email provider not selectable for paid launch in this slice."]
    }
  ]
};

export function getBillingPolicyRow(): ProviderPolicyRow {
  const row = PROVIDER_POLICY_MATRIX.rows.find(
    (r) => r.provider === "stripe" && r.role === "billing"
  );
  if (!row) {
    throw new Error("stripe_billing_policy_row_missing");
  }
  return row;
}

export function getProviderPolicyRow(
  provider: ProviderPolicyRow["provider"]
): ProviderPolicyRow | undefined {
  return PROVIDER_POLICY_MATRIX.rows.find(
    (r) => r.provider === provider && r.role === "billing"
  );
}

export const CONTENT_USE_CATEGORY_LABELS: Record<ContentUseCategory, string> =
  {
    general_eligible_business: "General eligible business",
    creative_non_adult: "Creative / non-adult content",
    mature_non_sexual: "Mature but non-sexual content",
    adult_sexual_gratification:
      "Adult / pornography designed for sexual gratification",
    other_high_risk: "Other high-risk or restricted use",
    undeclared: "Not yet declared"
  };

export function isContentUseCategory(v: unknown): v is ContentUseCategory {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(CONTENT_USE_CATEGORY_LABELS, v)
  );
}
