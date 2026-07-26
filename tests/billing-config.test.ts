/**
 * @fileoverview Unit tests for Relay SaaS billing config (MB-1).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  isBillingEnabled,
  resetBillingConfigLogGateForTests,
  resolveBillingConfig
} from "../src/billing/config.js";

describe("billing-config", () => {
  afterEach(() => {
    resetBillingConfigLogGateForTests();
  });

  it("is disabled by default when RELAY_BILLING_ENABLED is unset", () => {
    const cfg = resolveBillingConfig({}, {});
    expect(cfg.enabled).toBe(false);
    expect(cfg.requestedEnabled).toBe(false);
    expect(isBillingEnabled({}, {})).toBe(false);
  });

  it("treats missing Stripe secrets as disabled even when switch is on", () => {
    const logs: string[] = [];
    const cfg = resolveBillingConfig(
      { enabled: true },
      { RELAY_BILLING_ENABLED: "1" },
      (msg) => logs.push(msg)
    );
    expect(cfg.requestedEnabled).toBe(true);
    expect(cfg.enabled).toBe(false);
    expect(cfg.disabledReason).toBe("missing_stripe_secrets");
    expect(logs.length).toBe(1);
  });

  it("enables when switch + secret key + webhook secret are present", () => {
    const cfg = resolveBillingConfig(
      {},
      {
        RELAY_BILLING_ENABLED: "true",
        STRIPE_SECRET_KEY: "sk_test_abc",
        STRIPE_WEBHOOK_SECRET: "whsec_abc"
      },
      () => undefined
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.secretKey).toBe("sk_test_abc");
    expect(cfg.webhookSecret).toBe("whsec_abc");
    expect(cfg.disabledReason).toBeNull();
  });

  it("reads price IDs and portal return URL from env without hardcoding amounts", () => {
    const cfg = resolveBillingConfig(
      {},
      {
        RELAY_BILLING_ENABLED: "1",
        STRIPE_SECRET_KEY: "sk_test_x",
        STRIPE_WEBHOOK_SECRET: "whsec_x",
        STRIPE_PRICE_STUDIO_CORE: "price_studio",
        STRIPE_PRICE_AUTOPOST: "price_auto",
        STRIPE_PRICE_GROWTH_ENGINE: "price_growth",
        RELAY_BILLING_PORTAL_RETURN_URL: "http://localhost:3000/studio/settings/billing"
      },
      () => undefined
    );
    expect(cfg.priceStudioCore).toBe("price_studio");
    expect(cfg.priceAutopost).toBe("price_auto");
    expect(cfg.priceGrowthEngine).toBe("price_growth");
    expect(cfg.portalReturnUrl).toContain("/studio/settings/billing");
  });

  it("logs missing secrets only once across repeated resolves", () => {
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);
    resolveBillingConfig({ enabled: true }, {}, log);
    resolveBillingConfig({ enabled: true }, {}, log);
    expect(logs.length).toBe(1);
  });
});
