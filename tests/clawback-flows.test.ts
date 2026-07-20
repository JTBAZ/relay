/**
 * @fileoverview Tip clawback flow tests (MB-12).
 */
import { TipEntryKind } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { clawbackTips } from "../src/ledger/tip-ledger-service.js";
import { clawbackFanSubscriptionRefund } from "../src/payouts/clawback-service.js";
import type Stripe from "stripe";

describe("clawback-flows", () => {
  it("clawbackTips caps at wallet balance and is idempotent", async () => {
    const entries: Array<Record<string, unknown>> = [];
    let wallet = { grantedBalance: 3, purchasedBalance: 0 };
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      tipLedgerEntry: {
        findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
          entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `e_${entries.length + 1}`, ...data };
          entries.push(row);
          return row;
        })
      },
      tipWallet: {
        upsert: vi.fn(async () => ({ accountId: "a1", ...wallet })),
        update: vi.fn(async ({ data }: { data: typeof wallet }) => {
          wallet = { ...wallet, ...data };
          return { accountId: "a1", ...wallet };
        })
      },
      platformRevenueEvent: { create: vi.fn(async () => ({})) }
    } as never;

    const first = await clawbackTips(prisma, {
      accountId: "a1",
      tips: 10,
      bucket: "granted",
      stripeRef: "ch_1",
      idempotencyKey: "claw:1"
    });
    expect(first.entries[0]?.tips).toBe(-3);
    expect(first.wallet.granted_balance).toBe(0);

    const second = await clawbackTips(prisma, {
      accountId: "a1",
      tips: 10,
      bucket: "granted",
      stripeRef: "ch_1",
      idempotencyKey: "claw:1"
    });
    expect(second.idempotent).toBe(true);
  });

  it("fan subscription refund claws granted Tips only — no artist entry", async () => {
    const artistCreates = vi.fn();
    const tipCreates: Array<Record<string, unknown>> = [];
    let wallet = { grantedBalance: 5, purchasedBalance: 2 };
    const prisma = {
      billingCustomer: {
        findFirst: vi.fn(async () => ({ accountId: "a1", stripeCustomerId: "cus_1" }))
      },
      tipWallet: {
        findUnique: vi.fn(async () => ({ accountId: "a1", ...wallet })),
        upsert: vi.fn(async () => ({ accountId: "a1", ...wallet })),
        update: vi.fn(async ({ data }: { data: typeof wallet }) => {
          wallet = { ...wallet, ...data };
          return { accountId: "a1", ...wallet };
        })
      },
      tipLedgerEntry: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          tipCreates.push(data);
          return { id: "tle_1", ...data };
        })
      },
      artistLedgerEntry: { create: artistCreates },
      platformRevenueEvent: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
    } as never;

    await clawbackFanSubscriptionRefund(
      { prisma },
      {
        id: "ch_sub",
        customer: "cus_1",
        metadata: {}
      } as Stripe.Charge,
      "evt_1"
    );

    expect(tipCreates.some((e) => e.entryKind === TipEntryKind.clawback)).toBe(true);
    expect(tipCreates[0]?.bucket).toBe("granted");
    expect(artistCreates).not.toHaveBeenCalled();
  });
});
