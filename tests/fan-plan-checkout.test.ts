/**
 * @fileoverview Fan plan checkout service tests (MB-9).
 */
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetBillingConfigLogGateForTests } from "../src/billing/config.js";
import {
  createFanCheckoutSession,
  createReloadPackCheckoutSession
} from "../src/billing/checkout-service.js";
import { resetStripeClientForTests } from "../src/billing/stripe-client.js";
import { fanPlanParams, isPaidFanPlanId, RELOAD_PACK_TIPS } from "../src/billing/fan-plan-config.js";
import { priceIdForFanPlan } from "../src/billing/plan-price-map.js";
import { resolveBillingConfig } from "../src/billing/config.js";

describe("fan-plan-checkout", () => {
  afterEach(() => {
    resetBillingConfigLogGateForTests();
    resetStripeClientForTests();
    vi.restoreAllMocks();
  });

  it("returns fan_premium_disabled when switch is off", async () => {
    const prisma = {} as PrismaClient;
    const result = await createFanCheckoutSession(
      prisma,
      { accountId: "a1", plan: "supporter" },
      { enabled: true, secretKey: "sk_test", webhookSecret: "whsec" },
      { RELAY_FAN_PREMIUM_ENABLED: "0" }
    );
    expect(result).toEqual({ ok: false, error: "fan_premium_disabled" });
  });

  it("returns price_not_configured when supporter price missing", async () => {
    const prisma = {
      billingCustomer: { findUnique: vi.fn(async () => null) },
      account: { findUnique: vi.fn(async () => ({ emailNorm: "a@b.co", id: "a1" })) }
    } as unknown as PrismaClient;

    const result = await createFanCheckoutSession(
      prisma,
      { accountId: "a1", plan: "supporter" },
      {
        enabled: true,
        secretKey: "sk_test_x",
        webhookSecret: "whsec_x"
      },
      { RELAY_FAN_PREMIUM_ENABLED: "1" }
    );
    expect(result).toEqual({ ok: false, error: "price_not_configured" });
  });

  it("maps fan price IDs from config (no hardcoded amounts)", () => {
    const cfg = resolveBillingConfig(
      {
        enabled: true,
        secretKey: "sk",
        webhookSecret: "wh",
        priceSupporter: "price_sup_env",
        priceCurator: "price_cur_env",
        priceReloadPack: "price_reload_env"
      },
      {},
      () => undefined
    );
    expect(priceIdForFanPlan("supporter", cfg)).toBe("price_sup_env");
    expect(priceIdForFanPlan("curator", cfg)).toBe("price_cur_env");
    expect(cfg.priceReloadPack).toBe("price_reload_env");
    expect(isPaidFanPlanId("supporter")).toBe(true);
    expect(RELOAD_PACK_TIPS).toBe(10);
  });

  it("fan plan params match atlas allowances and caps", () => {
    expect(fanPlanParams("supporter")).toMatchObject({
      monthlyTips: 5,
      rolloverCap: 10,
      revealWindowDays: 14
    });
    expect(fanPlanParams("curator")).toMatchObject({
      monthlyTips: 15,
      rolloverCap: 30,
      revealWindowDays: 30
    });
    expect(fanPlanParams("free").monthlyTips).toBe(0);
  });

  it("reload pack returns fan_premium_disabled when off", async () => {
    const result = await createReloadPackCheckoutSession(
      {} as PrismaClient,
      { accountId: "a1" },
      { enabled: true, secretKey: "sk", webhookSecret: "wh" },
      {}
    );
    expect(result).toEqual({ ok: false, error: "fan_premium_disabled" });
  });

  it("reload pack returns price_not_configured when price missing", async () => {
    const result = await createReloadPackCheckoutSession(
      {
        billingCustomer: { findUnique: vi.fn(async () => null) }
      } as unknown as PrismaClient,
      { accountId: "a1" },
      {
        enabled: true,
        secretKey: "sk_test_x",
        webhookSecret: "whsec_x"
      },
      { RELAY_FAN_PREMIUM_ENABLED: "1" }
    );
    expect(result).toEqual({ ok: false, error: "price_not_configured" });
  });
});
