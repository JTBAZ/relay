/**
 * @fileoverview Webhook handler lifecycle tests (MB-2).
 */
import { PlatformRevenueEventKind, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetBillingConfigLogGateForTests } from "../src/billing/config.js";
import {
  generateStripeTestWebhookHeader,
  resetStripeClientForTests
} from "../src/billing/stripe-client.js";
import { createBillingWebhookHandler } from "../src/billing/webhook-router.js";

const WEBHOOK_SECRET = "whsec_test_mb2_handlers";
const PRICE_CORE = "price_studio_mb2";

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

describe("billing-webhook-handlers lifecycle", () => {
  afterEach(() => {
    resetBillingConfigLogGateForTests();
    resetStripeClientForTests();
  });

  it("subscription.updated syncs plan and duplicate delivery writes no second revenue event", async () => {
    const revenue: unknown[] = [];
    const webhookIds: string[] = [];
    const entitlements = new Map<string, Record<string, unknown>>();
    const subs = new Map<string, Record<string, unknown>>();

    const prisma = {
      billingWebhookEvent: {
        create: vi.fn(async (args: { data: { stripeEventId: string; eventType: string } }) => {
          if (webhookIds.includes(args.data.stripeEventId)) {
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
              code: "P2002",
              clientVersion: "test",
              meta: { target: ["stripe_event_id"] }
            });
          }
          webhookIds.push(args.data.stripeEventId);
          return args.data;
        }),
        delete: vi.fn(async () => ({}))
      },
      platformRevenueEvent: {
        create: vi.fn(async (args: { data: unknown }) => {
          revenue.push(args.data);
          return { id: `rev_${revenue.length}` };
        })
      },
      billingCustomer: { findFirst: vi.fn(async () => null) },
      planSubscription: {
        upsert: vi.fn(async (args: {
          where: { stripeSubscriptionId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const next = {
            id: `ps_${args.where.stripeSubscriptionId}`,
            ...args.create,
            ...args.update
          };
          subs.set(args.where.stripeSubscriptionId, next);
          return next;
        }),
        findFirst: vi.fn(async () => {
          for (const row of subs.values()) {
            if (row.status === "active" || row.status === "trialing") return row;
          }
          return null;
        }),
        findUnique: vi.fn(async () => null),
        update: vi.fn(async () => ({}))
      },
      account: {
        findFirst: vi.fn(async () => ({ id: "acct_1" })),
        findUnique: vi.fn(async () => ({ primaryRelayCreatorId: "creator_1" }))
      },
      creatorPlanEntitlement: {
        findUnique: vi.fn(async ({ where }: { where: { creatorId: string } }) =>
          entitlements.get(where.creatorId) ?? null
        ),
        upsert: vi.fn(async (args: {
          where: { creatorId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const next = { ...args.create, ...args.update };
          entitlements.set(args.where.creatorId, next);
          return next;
        }),
        delete: vi.fn(async ({ where }: { where: { creatorId: string } }) => {
          entitlements.delete(where.creatorId);
        })
      },
      usageEvent: { create: vi.fn(async () => ({})) }
    } as unknown as PrismaClient;

    const env = {
      RELAY_BILLING_ENABLED: "1",
      STRIPE_SECRET_KEY: "sk_test_mb2",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_PRICE_STUDIO_CORE: PRICE_CORE,
      STRIPE_PRICE_AUTOPOST: "price_auto_mb2",
      STRIPE_PRICE_GROWTH_ENGINE: "price_growth_mb2"
    };

    const now = Math.floor(Date.now() / 1000);
    const eventObj = {
      id: "evt_sub_updated_1",
      object: "event",
      api_version: "2026-06-24.dahlia",
      created: now,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_lifecycle_1",
          object: "subscription",
          customer: "cus_1",
          status: "active",
          current_period_start: now,
          current_period_end: now + 86400,
          cancel_at_period_end: false,
          items: {
            object: "list",
            data: [
              {
                id: "si_1",
                object: "subscription_item",
                price: { id: PRICE_CORE, object: "price" }
              }
            ],
            has_more: false,
            url: ""
          },
          metadata: {
            relay_account_id: "acct_1",
            relay_creator_id: "creator_1",
            creator_plan: "studio_core",
            scope: "creator"
          }
        },
        previous_attributes: {}
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null }
    };
    const payload = JSON.stringify(eventObj);
    const signature = await generateStripeTestWebhookHeader(payload, WEBHOOK_SECRET);
    const handler = createBillingWebhookHandler({ prisma, env });

    const first = mockRes();
    await handler(
      {
        body: Buffer.from(payload),
        header: (name: string) =>
          name.toLowerCase() === "stripe-signature" ? signature : undefined
      } as never,
      first as never
    );
    expect(first.statusCode).toBe(200);
    expect(subs.get("sub_lifecycle_1")?.creatorPlan).toBe("studio_core");
    expect(entitlements.get("creator_1")?.plan).toBe("studio_core");

    const second = mockRes();
    await handler(
      {
        body: Buffer.from(payload),
        header: (name: string) =>
          name.toLowerCase() === "stripe-signature" ? signature : undefined
      } as never,
      second as never
    );
    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
    // No price change → no upgrade revenue event; duplicate must not add rows either.
    expect(revenue).toHaveLength(0);
  });

  it("invoice.paid writes PlatformRevenueEvent and UsageEvent once", async () => {
    const revenue: Array<{ eventKind: string }> = [];
    const usage: unknown[] = [];
    const webhookIds: string[] = [];

    const prisma = {
      billingWebhookEvent: {
        create: vi.fn(async (args: { data: { stripeEventId: string } }) => {
          if (webhookIds.includes(args.data.stripeEventId)) {
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
              code: "P2002",
              clientVersion: "test"
            });
          }
          webhookIds.push(args.data.stripeEventId);
          return args.data;
        }),
        delete: vi.fn(async () => ({}))
      },
      platformRevenueEvent: {
        create: vi.fn(async (args: { data: { eventKind: string } }) => {
          revenue.push(args.data);
          return { id: `rev_${revenue.length}` };
        })
      },
      planSubscription: {
        findUnique: vi.fn(async () => ({
          accountId: "acct_1",
          stripeSubscriptionId: "sub_1"
        }))
      },
      account: {
        findUnique: vi.fn(async () => ({ primaryRelayCreatorId: "creator_1" }))
      },
      tenant: {
        findUnique: vi.fn(async () => null)
      },
      usageEvent: {
        create: vi.fn(async (args: unknown) => {
          usage.push(args);
          return {};
        })
      }
    } as unknown as PrismaClient;

    const env = {
      RELAY_BILLING_ENABLED: "1",
      STRIPE_SECRET_KEY: "sk_test_mb2",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET
    };

    const eventObj = {
      id: "evt_invoice_paid_1",
      object: "event",
      type: "invoice.paid",
      api_version: "2026-06-24.dahlia",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "in_1",
          object: "invoice",
          amount_paid: 1800,
          billing_reason: "subscription_create",
          parent: {
            subscription_details: { subscription: "sub_1" }
          }
        }
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null }
    };
    const payload = JSON.stringify(eventObj);
    const signature = await generateStripeTestWebhookHeader(payload, WEBHOOK_SECRET);
    const handler = createBillingWebhookHandler({ prisma, env });

    const res = mockRes();
    await handler(
      {
        body: Buffer.from(payload),
        header: (name: string) =>
          name.toLowerCase() === "stripe-signature" ? signature : undefined
      } as never,
      res as never
    );
    expect(res.statusCode).toBe(200);
    expect(revenue).toHaveLength(1);
    expect(revenue[0]?.eventKind).toBe(PlatformRevenueEventKind.subscription_created);
    // usage is scheduled async — allow a tick
    await new Promise((r) => setTimeout(r, 20));
    expect(usage.length).toBeGreaterThanOrEqual(1);

    const dup = mockRes();
    await handler(
      {
        body: Buffer.from(payload),
        header: (name: string) =>
          name.toLowerCase() === "stripe-signature" ? signature : undefined
      } as never,
      dup as never
    );
    expect(dup.body).toEqual({ received: true, duplicate: true });
    expect(revenue).toHaveLength(1);
  });
});
