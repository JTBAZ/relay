/**
 * @fileoverview Relay SaaS billing config (Stripe) — Phase 1 MB-1.
 * @see docs/BILLING_SPINE_BUILD_PLAN.md
 *
 * Billing is OFF by default. Missing keys while "enabled" → treat as disabled
 * (never throw at boot; mirrors src/ai/config.ts posture).
 */

export type BillingServiceConfig = {
  enabled?: boolean;
  secretKey?: string;
  webhookSecret?: string;
  priceStudioCore?: string;
  priceAutopost?: string;
  priceGrowthEngine?: string;
  priceSupporter?: string;
  priceCurator?: string;
  priceReloadPack?: string;
  portalReturnUrl?: string;
  fanPortalReturnUrl?: string;
};

export type ResolvedBillingConfig = {
  /** True only when the master switch is on AND required Stripe secrets are present. */
  enabled: boolean;
  /** Master switch as requested (may be true even when secrets are missing). */
  requestedEnabled: boolean;
  /** Why billing was forced off despite requestedEnabled (null when healthy or never requested). */
  disabledReason: string | null;
  secretKey: string | null;
  webhookSecret: string | null;
  priceStudioCore: string | null;
  priceAutopost: string | null;
  priceGrowthEngine: string | null;
  priceSupporter: string | null;
  priceCurator: string | null;
  priceReloadPack: string | null;
  portalReturnUrl: string | null;
  fanPortalReturnUrl: string | null;
};

function envTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

let missingKeysLogged = false;

/**
 * Resolve billing config from overrides + env.
 * Side effect: logs once when enabled is requested but secrets are missing.
 */
export function resolveBillingConfig(
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string, ctx?: Record<string, unknown>) => void = console.warn
): ResolvedBillingConfig {
  const requestedEnabled =
    typeof overrides.enabled === "boolean"
      ? overrides.enabled
      : envTruthy(env.RELAY_BILLING_ENABLED);

  const secretKey = firstNonEmpty(overrides.secretKey, env.STRIPE_SECRET_KEY);
  const webhookSecret = firstNonEmpty(overrides.webhookSecret, env.STRIPE_WEBHOOK_SECRET);
  const priceStudioCore = firstNonEmpty(
    overrides.priceStudioCore,
    env.STRIPE_PRICE_STUDIO_CORE
  );
  const priceAutopost = firstNonEmpty(overrides.priceAutopost, env.STRIPE_PRICE_AUTOPOST);
  const priceGrowthEngine = firstNonEmpty(
    overrides.priceGrowthEngine,
    env.STRIPE_PRICE_GROWTH_ENGINE
  );
  const priceSupporter = firstNonEmpty(overrides.priceSupporter, env.STRIPE_PRICE_SUPPORTER);
  const priceCurator = firstNonEmpty(overrides.priceCurator, env.STRIPE_PRICE_CURATOR);
  const priceReloadPack = firstNonEmpty(
    overrides.priceReloadPack,
    env.STRIPE_PRICE_RELOAD_PACK
  );
  const portalReturnUrl = firstNonEmpty(
    overrides.portalReturnUrl,
    env.RELAY_BILLING_PORTAL_RETURN_URL
  );
  const fanPortalReturnUrl = firstNonEmpty(
    overrides.fanPortalReturnUrl,
    env.RELAY_FAN_BILLING_PORTAL_RETURN_URL,
    "http://localhost:3000/plans"
  );

  let disabledReason: string | null = null;
  let enabled = requestedEnabled;
  if (requestedEnabled) {
    if (!secretKey || !webhookSecret) {
      enabled = false;
      disabledReason = "missing_stripe_secrets";
      if (!missingKeysLogged) {
        missingKeysLogged = true;
        log(
          "relay-billing: RELAY_BILLING_ENABLED but STRIPE_SECRET_KEY and/or STRIPE_WEBHOOK_SECRET missing — treating as disabled",
          { hasSecretKey: Boolean(secretKey), hasWebhookSecret: Boolean(webhookSecret) }
        );
      }
    }
  }

  return {
    enabled,
    requestedEnabled,
    disabledReason,
    secretKey,
    webhookSecret,
    priceStudioCore,
    priceAutopost,
    priceGrowthEngine,
    priceSupporter,
    priceCurator,
    priceReloadPack,
    portalReturnUrl,
    fanPortalReturnUrl
  };
}

/** Test helper — reset one-shot missing-keys log. */
export function resetBillingConfigLogGateForTests(): void {
  missingKeysLogged = false;
}

export function isBillingEnabled(
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return resolveBillingConfig(overrides, env, () => undefined).enabled;
}
