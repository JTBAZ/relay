/**
 * @fileoverview Artist payout request tests (MB-12).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestPayout } from "../src/payouts/payout-service.js";
import { resetBillingConfigLogGateForTests } from "../src/billing/config.js";
import { resetStripeClientForTests } from "../src/billing/stripe-client.js";

vi.mock("../src/ledger/artist-ledger-service.js", () => ({
  appendArtistLedgerEntry: vi.fn(async () => ({
    balance: { creator_id: "c1", available_cents: 0, lifetime_cents: 2500 },
    entry: { id: "e1", entry_kind: "payout", amount_cents: -2500 },
    idempotent: false
  }))
}));

vi.mock("../src/billing/stripe-client.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/billing/stripe-client.js")>();
  return {
    ...mod,
    getStripeClient: vi.fn(async () => ({
      transfers: {
        create: vi.fn(async () => ({ id: "tr_1" }))
      }
    })),
    resetStripeClientForTests: mod.resetStripeClientForTests
  };
});

describe("payout-service", () => {
  afterEach(() => {
    resetBillingConfigLogGateForTests();
    resetStripeClientForTests();
    vi.clearAllMocks();
  });

  it("returns payouts_not_enabled when Connect incomplete", async () => {
    const prisma = {
      payoutAccount: {
        findUnique: vi.fn(async () => ({
          creatorId: "c1",
          payoutsEnabled: false,
          stripeConnectAccountId: "acct_x"
        }))
      },
      artistBalance: {
        findUnique: vi.fn(async () => ({ availableCents: 5000, lifetimeCents: 5000 }))
      }
    } as never;
    const result = await requestPayout(
      prisma,
      { creatorId: "c1" },
      {},
      { RELAY_FAN_PREMIUM_ENABLED: "1", RELAY_PAYOUT_THRESHOLD_CENTS: "2000" }
    );
    expect(result).toEqual({ ok: false, error: "payouts_not_enabled" });
  });

  it("returns below_threshold when available < threshold", async () => {
    const prisma = {
      payoutAccount: {
        findUnique: vi.fn(async () => ({
          creatorId: "c1",
          payoutsEnabled: true,
          stripeConnectAccountId: "acct_x"
        }))
      },
      artistBalance: {
        findUnique: vi.fn(async () => ({ availableCents: 500, lifetimeCents: 500 }))
      }
    } as never;
    const result = await requestPayout(
      prisma,
      { creatorId: "c1" },
      {},
      { RELAY_FAN_PREMIUM_ENABLED: "1", RELAY_PAYOUT_THRESHOLD_CENTS: "2000" }
    );
    expect(result).toEqual({ ok: false, error: "below_threshold" });
  });

  it("returns balance_not_positive when available <= 0", async () => {
    const prisma = {
      payoutAccount: {
        findUnique: vi.fn(async () => ({
          creatorId: "c1",
          payoutsEnabled: true,
          stripeConnectAccountId: "acct_x"
        }))
      },
      artistBalance: {
        findUnique: vi.fn(async () => ({ availableCents: 0, lifetimeCents: 0 }))
      }
    } as never;
    const result = await requestPayout(
      prisma,
      { creatorId: "c1" },
      {},
      { RELAY_FAN_PREMIUM_ENABLED: "1" }
    );
    expect(result).toEqual({ ok: false, error: "balance_not_positive" });
  });

  it("creates payout + transfer when enabled and above threshold", async () => {
    const prisma = {
      payoutAccount: {
        findUnique: vi.fn(async () => ({
          creatorId: "c1",
          payoutsEnabled: true,
          stripeConnectAccountId: "acct_connect"
        }))
      },
      artistBalance: {
        findUnique: vi.fn(async () => ({ availableCents: 2500, lifetimeCents: 2500 }))
      },
      artistPayout: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "payout_1",
          ...data
        })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data)
      }
    } as never;

    const result = await requestPayout(
      prisma,
      { creatorId: "c1" },
      {},
      {
        RELAY_FAN_PREMIUM_ENABLED: "1",
        RELAY_PAYOUT_THRESHOLD_CENTS: "2000",
        RELAY_BILLING_ENABLED: "1",
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec"
      }
    );
    expect(result).toEqual({
      ok: true,
      payout_id: "payout_1",
      amount_cents: 2500
    });
  });
});
