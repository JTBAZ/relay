/**
 * @fileoverview Fan plan Tip grants + beta retirement (MB-9).
 */
import { FanPlan } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  grantTipsForFanPlanInvoice,
  shouldGrantTipsOnFanInvoice
} from "../src/billing/fan-plan-grant-service.js";
import { runTipGrantOnce, tipGrantRepeatEveryMsFromEnv } from "../src/tips/tip-grant-worker.js";

vi.mock("../src/ledger/tip-ledger-service.js", () => ({
  grantTips: vi.fn(async (args: {
    accountId: string;
    tips: number;
    rolloverCap?: number;
    periodKey: string;
    idempotencyKey: string;
  }) => ({
    wallet: {
      account_id: args.accountId,
      granted_balance: args.tips,
      purchased_balance: 0
    },
    entries: [{ id: "e1", entry_kind: "grant", tips: args.tips, bucket: "granted" }],
    idempotent: false
  })),
  purchaseTips: vi.fn(async (args: { accountId: string; tips: number }) => ({
    wallet: {
      account_id: args.accountId,
      granted_balance: 0,
      purchased_balance: args.tips
    },
    entries: [],
    idempotent: false
  }))
}));

import { grantTips, purchaseTips } from "../src/ledger/tip-ledger-service.js";
import { handleBillingWebhookEvent } from "../src/billing/webhook-handlers.js";
import type Stripe from "stripe";

describe("fan-plan-grants", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shouldGrantTipsOnFanInvoice only on create/cycle", () => {
    expect(shouldGrantTipsOnFanInvoice("subscription_create")).toBe(true);
    expect(shouldGrantTipsOnFanInvoice("subscription_cycle")).toBe(true);
    expect(shouldGrantTipsOnFanInvoice("subscription_update")).toBe(false);
    expect(shouldGrantTipsOnFanInvoice(null)).toBe(false);
  });

  it("supporter grant is 5 tips with rollover cap 10", async () => {
    const prisma = {} as never;
    await grantTipsForFanPlanInvoice(prisma, {
      accountId: "acct_1",
      fanPlan: FanPlan.supporter,
      periodKey: "2026-07",
      invoiceId: "in_1"
    });
    expect(grantTips).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        accountId: "acct_1",
        tips: 5,
        rolloverCap: 10,
        periodKey: "2026-07",
        idempotencyKey: "fan_grant:acct_1:2026-07"
      })
    );
  });

  it("curator grant is 15 tips with rollover cap 30", async () => {
    const prisma = {} as never;
    await grantTipsForFanPlanInvoice(prisma, {
      accountId: "acct_1",
      fanPlan: FanPlan.curator,
      periodKey: "2026-08",
      invoiceId: "in_2"
    });
    expect(grantTips).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        tips: 15,
        rolloverCap: 30
      })
    );
  });

  it("mid-cycle upgrade invoice does not grant tips", async () => {
    const revenue: unknown[] = [];
    const prisma = {
      platformRevenueEvent: {
        create: vi.fn(async (args: { data: unknown }) => {
          revenue.push(args.data);
          return { id: `rev_${revenue.length}` };
        })
      },
      planSubscription: {
        findUnique: vi.fn(async () => ({
          accountId: "acct_fan",
          scope: "fan",
          fanPlan: FanPlan.curator,
          creatorPlan: null
        })),
        upsert: vi.fn(async () => ({
          id: "ps_1",
          accountId: "acct_fan",
          scope: "fan",
          fanPlan: FanPlan.curator
        }))
      },
      account: {
        findUnique: vi.fn(async () => ({ primaryRelayCreatorId: null })),
        findFirst: vi.fn(async () => ({ id: "acct_fan" }))
      },
      billingCustomer: { findFirst: vi.fn(async () => null) },
      creatorPlanEntitlement: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({}))
      }
    } as never;

    const invoice = {
      id: "in_upgrade",
      amount_paid: 999,
      billing_reason: "subscription_update",
      period_start: Math.floor(Date.UTC(2026, 6, 1) / 1000),
      parent: {
        subscription_details: { subscription: "sub_fan_1" }
      }
    } as unknown as Stripe.Invoice;

    await handleBillingWebhookEvent(
      {
        prisma,
        env: {
          RELAY_BILLING_ENABLED: "1",
          STRIPE_SECRET_KEY: "sk_test",
          STRIPE_WEBHOOK_SECRET: "whsec",
          STRIPE_PRICE_CURATOR: "price_curator"
        },
        billingOverrides: {
          enabled: true,
          secretKey: "sk_test",
          webhookSecret: "whsec",
          priceCurator: "price_curator"
        },
        log: () => undefined
      },
      {
        id: "evt_upgrade",
        type: "invoice.paid",
        data: { object: invoice }
      } as Stripe.Event
    );

    expect(grantTips).not.toHaveBeenCalled();
  });

  it("reload pack checkout grants +10 purchased; duplicate is idempotent key", async () => {
    const prisma = {
      platformRevenueEvent: {
        create: vi.fn(async () => ({ id: "rev_1" }))
      }
    } as never;

    const session = {
      id: "cs_reload_dup",
      mode: "payment",
      amount_total: 500,
      metadata: {
        relay_account_id: "acct_fan",
        reload_pack: "1",
        scope: "fan"
      },
      client_reference_id: "acct_fan"
    } as unknown as Stripe.Checkout.Session;

    const event = {
      id: "evt_reload",
      type: "checkout.session.completed",
      data: { object: session }
    } as Stripe.Event;

    await handleBillingWebhookEvent(
      { prisma, log: () => undefined },
      event
    );
    await handleBillingWebhookEvent(
      { prisma, log: () => undefined },
      event
    );

    expect(purchaseTips).toHaveBeenCalledTimes(2);
    expect(purchaseTips).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        accountId: "acct_fan",
        tips: 10,
        stripeRef: "cs_reload_dup",
        idempotencyKey: "purchase:reload:cs_reload_dup"
      })
    );
  });

  it("beta grant worker skips when fan premium enabled", async () => {
    const prisma = {
      tenantMembership: {
        findMany: vi.fn(async () => [{ accountId: "a1" }])
      }
    } as never;

    const result = await runTipGrantOnce(prisma, {
      env: { RELAY_FAN_PREMIUM_ENABLED: "1", RELAY_TIPS_BETA: "1" }
    });
    expect(result.skipped_reason).toBe("fan_premium_enabled");
    expect(result.grants_applied).toBe(0);
    expect(grantTips).not.toHaveBeenCalled();
  });

  it("tipGrantRepeatEveryMsFromEnv is null when fan premium on", () => {
    expect(
      tipGrantRepeatEveryMsFromEnv({
        RELAY_TIPS_BETA: "1",
        RELAY_FAN_PREMIUM_ENABLED: "1"
      })
    ).toBeNull();
  });
});
