/**
 * Configurable monthly add-on product + feature flag for EH-042.
 */

import {
  MANAGED_VERIFY_ADDON_SKU,
  type ManagedVerifyAddonProduct
} from "./types.js";

function envTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function envFalsy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/** Default monthly price ($29) until measured operating costs exist (docs/06). */
export const DEFAULT_MANAGED_VERIFY_MONTHLY_CENTS = 2900;

/** Default grace after cancel / failed payment (days). */
export const DEFAULT_MANAGED_VERIFY_GRACE_DAYS = 7;

export type ManagedVerifyBillingResolvedConfig = {
  /**
   * Feature flag / kill switch.
   * When false, managed connector entitlement is denied (fail closed).
   * Unset defaults to **true** for in-process unit tests; production should set explicitly.
   */
  enabled: boolean;
  product: ManagedVerifyAddonProduct;
  graceDays: number;
  /**
   * Webhook signing secret. When `signatureRequired` and missing/placeholder → fail closed.
   */
  webhookSecret: string | null;
  /**
   * When true (default if secret env is set, or ESCAPE_HATCH_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED=1),
   * missing/invalid signatures are rejected.
   */
  signatureRequired: boolean;
};

const COST_COVERAGE_NOTES = [
  "Patreon OAuth / token refresh volume",
  "Signing and key infrastructure",
  "Monitoring and incident response",
  "Support contacts and migration assistance",
  "Privacy / compliance overhead",
  "Billing processing and bad-debt reserve",
  "Margin reserve for provider API changes"
];

/**
 * Feature flag: ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED.
 * Explicit 0/false/off denies connector entitlement.
 * Unset → enabled (test-friendly); operators should set in production.
 */
export function isManagedVerifyBillingEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw =
    env.ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED ??
    env.RELAY_MANAGED_VERIFY_BILLING_ENABLED;
  if (raw === undefined) return true;
  if (envFalsy(raw)) return false;
  return true;
}

function isPlaceholderSecret(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes("changeme") ||
    lower.includes("replace_me") ||
    lower.includes("your_") ||
    lower === "todo" ||
    lower === "xxx" ||
    lower === "whsec_test" ||
    raw.length < 16
  );
}

export function resolveManagedVerifyBillingConfig(
  env: NodeJS.ProcessEnv = process.env
): ManagedVerifyBillingResolvedConfig {
  const enabled = isManagedVerifyBillingEnabled(env);
  const monthlyPriceCents = parsePositiveInt(
    env.ESCAPE_HATCH_MANAGED_VERIFY_PRICE_CENTS ??
      env.RELAY_MANAGED_VERIFY_PRICE_CENTS,
    DEFAULT_MANAGED_VERIFY_MONTHLY_CENTS
  );
  const graceDays = parsePositiveInt(
    env.ESCAPE_HATCH_MANAGED_VERIFY_GRACE_DAYS ??
      env.RELAY_MANAGED_VERIFY_GRACE_DAYS,
    DEFAULT_MANAGED_VERIFY_GRACE_DAYS
  );
  const stripePriceId = firstNonEmpty(
    env.ESCAPE_HATCH_MANAGED_VERIFY_STRIPE_PRICE_ID,
    env.STRIPE_PRICE_MANAGED_PATREON_CONNECTOR,
    env.RELAY_MANAGED_VERIFY_STRIPE_PRICE_ID
  );
  const webhookSecretRaw = firstNonEmpty(
    env.ESCAPE_HATCH_MANAGED_VERIFY_BILLING_WEBHOOK_SECRET,
    env.RELAY_MANAGED_VERIFY_BILLING_WEBHOOK_SECRET
  );
  const webhookSecret =
    webhookSecretRaw && !isPlaceholderSecret(webhookSecretRaw)
      ? webhookSecretRaw
      : null;

  /**
   * Fail closed by default (EH-042 security): unsigned webhooks are rejected
   * unless an explicit unsigned-dev opt-in is set.
   * - ESCAPE_HATCH_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED=0|false|off → allow unsigned (tests/dev only)
   * - ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ALLOW_UNSIGNED=1 → allow unsigned when no secret
   * Otherwise signatureRequired is always true.
   */
  const allowUnsigned =
    envFalsy(
      env.ESCAPE_HATCH_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED ??
        env.RELAY_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED
    ) ||
    envTruthy(
      env.ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ALLOW_UNSIGNED ??
        env.RELAY_MANAGED_VERIFY_BILLING_ALLOW_UNSIGNED
    );
  const signatureRequired = !allowUnsigned;

  return {
    enabled,
    product: {
      sku: MANAGED_VERIFY_ADDON_SKU,
      displayName: "Relay managed Patreon connector",
      monthlyPriceCents,
      currency: "USD",
      stripePriceId,
      costCoverageNotes: [...COST_COVERAGE_NOTES]
    },
    graceDays,
    webhookSecret,
    signatureRequired
  };
}

export function buildAddonProduct(
  env: NodeJS.ProcessEnv = process.env
): ManagedVerifyAddonProduct {
  return resolveManagedVerifyBillingConfig(env).product;
}
