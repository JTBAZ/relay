/**
 * @fileoverview Unit tests for subscription sync + entitlement snapshot (MB-2).
 */
import { CreatorPlan, SubscriptionStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { syncSubscriptionFromStripe } from "../src/billing/subscription-sync.js";

const PRICE_CORE = "price_studio_test";
const PRICE_AUTO = "price_autopost_test";

function stripeSub(overrides: Partial<Stripe.Subscription> & { id: string }): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    object: "subscription",
    customer: "cus_test",
    status: "active",
    current_period_start: now,
    current_period_end: now + 30 * 24 * 3600,
    cancel_at_period_end: false,
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          price: { id: PRICE_CORE, object: "price" } as Stripe.Price
        } as Stripe.SubscriptionItem
      ],
      has_more: false,
      url: ""
    },
    metadata: {
      relay_account_id: "acct_1",
      relay_creator_id: "creator_1",
      creator_plan: "studio_core",
      scope: "creator"
    },
    ...overrides
  } as Stripe.Subscription;
}

function mockPrisma(state: {
  subs: Map<string, Record<string, unknown>>;
  entitlements: Map<string, Record<string, unknown>>;
}) {
  return {
    billingCustomer: {
      findFirst: vi.fn(async () => null)
    },
    planSubscription: {
      upsert: vi.fn(async (args: {
        where: { stripeSubscriptionId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const id = args.where.stripeSubscriptionId;
        const prev = state.subs.get(id);
        const next = { id: prev?.id ?? `ps_${id}`, ...args.create, ...args.update };
        state.subs.set(id, next);
        return next;
      }),
      findFirst: vi.fn(async (args: {
        where: { accountId: string; scope: string; status?: { in: SubscriptionStatus[] } };
      }) => {
        for (const row of state.subs.values()) {
          if (row.accountId !== args.where.accountId) continue;
          if (row.scope !== args.where.scope) continue;
          if (args.where.status?.in && !args.where.status.in.includes(row.status as SubscriptionStatus)) {
            continue;
          }
          return row;
        }
        return null;
      }),
      findUnique: vi.fn(async () => null)
    },
    account: {
      findFirst: vi.fn(async () => ({ id: "acct_1" })),
      findUnique: vi.fn(async () => ({ primaryRelayCreatorId: "creator_1" }))
    },
    creatorPlanEntitlement: {
      findUnique: vi.fn(async ({ where }: { where: { creatorId: string } }) =>
        state.entitlements.get(where.creatorId) ?? null
      ),
      upsert: vi.fn(async (args: {
        where: { creatorId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const next = { ...args.create, ...args.update };
        state.entitlements.set(args.where.creatorId, next);
        return next;
      }),
      delete: vi.fn(async ({ where }: { where: { creatorId: string } }) => {
        state.entitlements.delete(where.creatorId);
      })
    }
  } as unknown as PrismaClient;
}

describe("billing-subscription-sync", () => {
  const env = {
    RELAY_BILLING_ENABLED: "1",
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
    STRIPE_PRICE_STUDIO_CORE: PRICE_CORE,
    STRIPE_PRICE_AUTOPOST: PRICE_AUTO,
    STRIPE_PRICE_GROWTH_ENGINE: "price_growth_test"
  };

  it("subscribe → PlanSubscription active + entitlement studio_core", async () => {
    const state = {
      subs: new Map<string, Record<string, unknown>>(),
      entitlements: new Map<string, Record<string, unknown>>()
    };
    const prisma = mockPrisma(state);
    const result = await syncSubscriptionFromStripe(
      prisma,
      stripeSub({ id: "sub_new" }),
      {},
      env
    );
    expect(result?.status).toBe(SubscriptionStatus.active);
    expect(result?.plan).toBe(CreatorPlan.studio_core);
    expect(state.entitlements.get("creator_1")?.plan).toBe(CreatorPlan.studio_core);
    expect(state.entitlements.get("creator_1")?.source).toBe("stripe");
  });

  it("upgrade price → entitlement autopost", async () => {
    const state = {
      subs: new Map<string, Record<string, unknown>>(),
      entitlements: new Map<string, Record<string, unknown>>()
    };
    const prisma = mockPrisma(state);
    await syncSubscriptionFromStripe(prisma, stripeSub({ id: "sub_up" }), {}, env);
    await syncSubscriptionFromStripe(
      prisma,
      stripeSub({
        id: "sub_up",
        items: {
          object: "list",
          data: [
            {
              id: "si_1",
              object: "subscription_item",
              price: { id: PRICE_AUTO, object: "price" } as Stripe.Price
            } as Stripe.SubscriptionItem
          ],
          has_more: false,
          url: ""
        },
        metadata: {
          relay_account_id: "acct_1",
          relay_creator_id: "creator_1",
          creator_plan: "autopost",
          scope: "creator"
        }
      }),
      {},
      env
    );
    expect(state.subs.get("sub_up")?.creatorPlan).toBe(CreatorPlan.autopost);
    expect(state.entitlements.get("creator_1")?.plan).toBe(CreatorPlan.autopost);
  });

  it("cancel → status canceled and entitlement falls back to null", async () => {
    const state = {
      subs: new Map<string, Record<string, unknown>>(),
      entitlements: new Map<string, Record<string, unknown>>()
    };
    const prisma = mockPrisma(state);
    await syncSubscriptionFromStripe(prisma, stripeSub({ id: "sub_c" }), {}, env);
    expect(state.entitlements.has("creator_1")).toBe(true);

    // After cancel, findFirst for active/trialing returns null → entitlement deleted.
    const result = await syncSubscriptionFromStripe(
      prisma,
      stripeSub({ id: "sub_c", status: "canceled" }),
      {},
      env
    );
    expect(result?.status).toBe(SubscriptionStatus.canceled);
    expect(state.entitlements.has("creator_1")).toBe(false);
  });
});
