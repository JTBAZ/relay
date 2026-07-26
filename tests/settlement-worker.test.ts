/**
 * @fileoverview Settlement worker sweep tests (MB-11).
 */
import { SubscriptionStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  runSettlementOnce,
  settlementRepeatEveryMsFromEnv
} from "../src/ledger/settlement-service.js";

vi.mock("../src/ledger/artist-ledger-service.js", () => ({
  appendArtistLedgerEntry: vi.fn(async () => ({
    balance: { creator_id: "c1", available_cents: 0, lifetime_cents: 100 },
    entry: { id: "e1", entry_kind: "bill_credit", amount_cents: -100 },
    idempotent: false
  }))
}));

describe("settlement-worker", () => {
  it("settlementRepeatEveryMsFromEnv returns daily default when premium on", () => {
    expect(
      settlementRepeatEveryMsFromEnv({ RELAY_FAN_PREMIUM_ENABLED: "1" })
    ).toBe(24 * 60 * 60 * 1000);
  });

  it("runSettlementOnce scans due creators and settles", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const prisma = {
      planSubscription: {
        findMany: vi.fn(async () => [{ accountId: "acct_1" }]),
        findFirst: vi.fn(async () => ({
          accountId: "acct_1",
          scope: "creator",
          status: SubscriptionStatus.active,
          currentPeriodEnd: now
        }))
      },
      account: {
        findMany: vi.fn(async () => [{ primaryRelayCreatorId: "c1" }]),
        findFirst: vi.fn(async () => ({ id: "acct_1" }))
      },
      artistBalance: {
        findUnique: vi.fn(async () => ({
          creatorId: "c1",
          availableCents: 50,
          lifetimeCents: 50
        }))
      },
      billingCustomer: {
        findUnique: vi.fn(async () => ({
          accountId: "acct_1",
          stripeCustomerId: "cus_1"
        }))
      },
      artistLedgerEntry: {
        findUnique: vi.fn(async () => null)
      }
    } as never;

    const createBalanceTransaction = vi.fn(async () => ({ id: "cbtxn_w" }));
    const stripe = {
      invoices: { retrieveUpcoming: vi.fn(async () => ({ amount_due: 1800 })) },
      customers: { createBalanceTransaction }
    };

    const cycle = await runSettlementOnce({
      prisma,
      stripe: stripe as never,
      env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
      now
    });

    expect(cycle.creators_scanned).toBe(1);
    expect(cycle.credited).toBe(1);
    expect(createBalanceTransaction).toHaveBeenCalled();
  });

  it("runSettlementOnce no-ops when premium off", async () => {
    const prisma = {
      planSubscription: { findMany: vi.fn(async () => [{ accountId: "a" }]) }
    } as never;
    const cycle = await runSettlementOnce({
      prisma,
      stripe: null,
      env: { RELAY_FAN_PREMIUM_ENABLED: "0" }
    });
    expect(cycle.creators_scanned).toBe(0);
    expect(prisma.planSubscription.findMany).not.toHaveBeenCalled();
  });
});
