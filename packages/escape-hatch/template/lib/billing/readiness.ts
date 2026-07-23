/**
 * Billing readiness / capability reporter (EH-050 / EH-051).
 * Env-honest: Stripe is ready only when secret + webhook secret are real
 * (or a test client is injected). Never claims productionSafe.
 */

import {
  isPlaceholderSecret,
  loadEnv,
  type SiteEnv
} from "../env";
import type {
  BillingCapabilityMatrix,
  BillingImplementation,
  BillingPolicyDeclaration,
  BillingReadinessReport
} from "./types";

/** Env names reserved for creator-owned Stripe. Values never required for build. */
export const STRIPE_BILLING_ENV_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
] as const;

export const STUB_POLICY: BillingPolicyDeclaration = {
  implementation: "stub",
  supportedCurrencies: [],
  supportedIntervals: [],
  taxFeatures: [],
  contentCategories: [],
  regions: [],
  policyUrl: null,
  policyCheckedAt: null,
  notes: [
    "Stub billing provider — no live processor.",
    "Relay takes no percentage of independent-site subscription revenue in v1.",
    "Stripe eligible-business adapter is EH-051; provider policy router is EH-052."
  ]
};

export const STRIPE_POLICY: BillingPolicyDeclaration = {
  implementation: "stripe",
  supportedCurrencies: ["USD"],
  supportedIntervals: ["month", "year"],
  taxFeatures: ["stripe_tax_optional"],
  contentCategories: ["general_eligible_business"],
  regions: ["global_stripe_supported"],
  policyUrl: "https://stripe.com/legal/restricted-businesses",
  policyCheckedAt: null,
  notes: [
    "Creator-owned Stripe Billing/Checkout/Portal/webhooks (EH-051).",
    "Restricted / adult content must not be routed through Stripe (EH-052).",
    "Prefer restricted API keys (rk_) over secret keys (sk_) when supported.",
    "Never pass payment_method_types — use dynamic payment methods.",
    "Creator is the business the patron pays; Relay takes no % of independent-site subscription revenue in v1."
  ]
};

/** @deprecated Use STRIPE_POLICY */
export const STRIPE_POLICY_SHELL = STRIPE_POLICY;

function stubCapability(detail: string): BillingCapabilityMatrix {
  return {
    implementation: "stub",
    ready: false,
    sandbox: true,
    capabilities: {
      connectAccount: false,
      listProducts: false,
      mutateProducts: false,
      createCheckout: false,
      customerPortal: false,
      verifyWebhooks: false,
      normalizeLifecycle: true,
      sandboxMode: true,
      tax: false,
      migrationExport: false
    },
    detail
  };
}

function stripeCapability(
  ready: boolean,
  detail: string
): BillingCapabilityMatrix {
  return {
    implementation: "stripe",
    ready,
    sandbox: true,
    capabilities: {
      connectAccount: ready,
      listProducts: ready,
      mutateProducts: ready,
      createCheckout: ready,
      customerPortal: ready,
      verifyWebhooks: ready,
      normalizeLifecycle: true,
      sandboxMode: true,
      tax: false,
      migrationExport: ready
    },
    detail
  };
}

function configuredStripeEnvNames(env: SiteEnv): string[] {
  const out: string[] = [];
  for (const name of STRIPE_BILLING_ENV_NAMES) {
    const v = env[name];
    if (typeof v === "string" && v.trim() !== "" && !isPlaceholderSecret(v)) {
      out.push(name);
    }
  }
  return out;
}

export function resolveStripeSecretKey(env: SiteEnv = loadEnv()): string | null {
  const v = env.STRIPE_SECRET_KEY;
  if (typeof v !== "string" || !v.trim() || isPlaceholderSecret(v)) return null;
  return v.trim();
}

export function resolveStripeWebhookSecret(
  env: SiteEnv = loadEnv()
): string | null {
  const v = env.STRIPE_WEBHOOK_SECRET;
  if (typeof v !== "string" || !v.trim() || isPlaceholderSecret(v)) return null;
  return v.trim();
}

export function isStripeBillingConfigured(env: SiteEnv = loadEnv()): boolean {
  return Boolean(resolveStripeSecretKey(env) && resolveStripeWebhookSecret(env));
}

export type BillingReadinessOptions = {
  /** When true, treat Stripe as configured for capability (injected mock client). */
  clientInjected?: boolean;
};

/**
 * Report readiness for the active billing implementation.
 */
export function reportBillingReadiness(
  implementation: BillingImplementation = "stub",
  env: SiteEnv = loadEnv(),
  opts?: BillingReadinessOptions
): BillingReadinessReport {
  const configured = configuredStripeEnvNames(env);

  if (implementation === "stub") {
    return {
      implementation: "stub",
      ok: false,
      reason:
        "Billing adapter is a typed stub (EH-050 contract). Set ESCAPE_HATCH_BILLING_PROVIDER=stripe with creator Stripe credentials for EH-051.",
      sandbox: true,
      capability: stubCapability(
        "normalizeLifecycle available for unit tests; all money-path methods fail closed."
      ),
      policy: STUB_POLICY,
      requiredEnvNames: [...STRIPE_BILLING_ENV_NAMES],
      configuredEnvNames: configured
    };
  }

  const ready =
    Boolean(opts?.clientInjected) || isStripeBillingConfigured(env);

  if (ready) {
    return {
      implementation: "stripe",
      ok: true,
      reason: opts?.clientInjected
        ? "Stripe billing adapter ready via injected client (CI/sandbox). productionSafe remains false."
        : "Stripe secret + webhook secret configured for creator-owned Billing/Checkout/Portal. productionSafe remains false — Milestone 3 + EH-052 policy still open.",
      sandbox: true,
      capability: stripeCapability(
        true,
        "EH-051: Checkout Sessions, Customer Portal, signed webhooks, product/price CRUD, migration export."
      ),
      policy: STRIPE_POLICY,
      requiredEnvNames: [...STRIPE_BILLING_ENV_NAMES],
      configuredEnvNames: configured
    };
  }

  const hasPartial =
    configured.includes("STRIPE_SECRET_KEY") ||
    configured.includes("STRIPE_WEBHOOK_SECRET");

  return {
    implementation: "stripe",
    ok: false,
    reason: hasPartial
      ? "Stripe billing partially configured — both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required (non-placeholder)."
      : "Stripe billing not configured — set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET; money paths fail closed.",
    sandbox: true,
    capability: stripeCapability(
      false,
      "EH-051 adapter selected but credentials missing; Checkout/Portal/webhooks fail closed."
    ),
    policy: STRIPE_POLICY,
    requiredEnvNames: [...STRIPE_BILLING_ENV_NAMES],
    configuredEnvNames: configured
  };
}

export function getBillingCapabilityMatrix(
  implementation: BillingImplementation = "stub",
  env: SiteEnv = loadEnv(),
  opts?: BillingReadinessOptions
): BillingCapabilityMatrix {
  return reportBillingReadiness(implementation, env, opts).capability;
}

export function getBillingPolicyDeclaration(
  implementation: BillingImplementation = "stub"
): BillingPolicyDeclaration {
  return implementation === "stripe" ? STRIPE_POLICY : STUB_POLICY;
}
