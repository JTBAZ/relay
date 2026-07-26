/**
 * @fileoverview Bill-credit settlement fixture matrix (MB-11).
 */
import { ArtistLedgerEntryKind, SubscriptionStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  settleCreatorOnce,
  settlementRepeatEveryMsFromEnv
} from "../src/ledger/settlement-service.js";

function mockPrisma(opts: {
  hasPlan?: boolean;
  availableCents?: number;
  existingBillCredit?: { amountCents: number; stripeRef: string } | null;
}) {
  const hasPlan = opts.hasPlan !== false;
  const available = opts.availableCents ?? 100;
  const entries: Array<Record<string, unknown>> = [];
  if (opts.existingBillCredit) {
    entries.push({
      idempotencyKey: "bill_credit:c1:2026-07",
      amountCents: -opts.existingBillCredit.amountCents,
      stripeRef: opts.existingBillCredit.stripeRef,
      entryKind: ArtistLedgerEntryKind.bill_credit
    });
  }

  const prisma = {
    account: {
      findFirst: vi.fn(async () => (hasPlan ? { id: "acct_1" } : null))
    },
    planSubscription: {
      findFirst: vi.fn(async () =>
        hasPlan
          ? {
              accountId: "acct_1",
              scope: "creator",
              status: SubscriptionStatus.active,
              currentPeriodEnd: new Date("2026-07-31T00:00:00.000Z")
            }
          : null
      )
    },
    artistBalance: {
      findUnique: vi.fn(async () =>
        available === undefined
          ? null
          : { creatorId: "c1", availableCents: available, lifetimeCents: available }
      ),
      upsert: vi.fn(async ({ where }: { where: { creatorId: string } }) => ({
        creatorId: where.creatorId,
        availableCents: available,
        lifetimeCents: Math.max(available, 0)
      })),
      update: vi.fn(async ({ data }: { data: { availableCents: number; lifetimeCents: number } }) => ({
        creatorId: "c1",
        ...data
      }))
    },
    billingCustomer: {
      findUnique: vi.fn(async () =>
        hasPlan ? { accountId: "acct_1", stripeCustomerId: "cus_1" } : null
      )
    },
    artistLedgerEntry: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ale_${entries.length + 1}`, ...data };
        entries.push(row);
        return row;
      })
    },
    platformRevenueEvent: {
      create: vi.fn(async () => ({ id: "rev_1" }))
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
  };

  return { prisma: prisma as never, entries };
}

describe("settlement-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("settlementRepeatEveryMsFromEnv is null when fan premium off", () => {
    expect(settlementRepeatEveryMsFromEnv({})).toBeNull();
  });

  it("skips when no paid plan", async () => {
    const { prisma } = mockPrisma({ hasPlan: false, availableCents: 500 });
    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: {} as never,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );
    expect(result).toMatchObject({ status: "skipped", reason: "no_plan" });
  });

  it("skips when balance not positive", async () => {
    const { prisma } = mockPrisma({ availableCents: 0 });
    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: {} as never,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );
    expect(result).toMatchObject({ status: "skipped", reason: "balance_not_positive" });
  });

  it("skips negative balance", async () => {
    const { prisma } = mockPrisma({ availableCents: -10 });
    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: {} as never,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );
    expect(result).toMatchObject({ status: "skipped", reason: "balance_not_positive" });
  });

  it("credits min(available, invoice) and writes ledger after Stripe success", async () => {
    const { prisma, entries } = mockPrisma({ availableCents: 100 });
    const createBalanceTransaction = vi.fn(async () => ({ id: "cbtxn_1" }));
    const retrieveUpcoming = vi.fn(async () => ({ amount_due: 1800 }));
    const stripe = {
      invoices: { retrieveUpcoming },
      customers: { createBalanceTransaction }
    };

    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: stripe as never,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );

    expect(result.status).toBe("credited");
    if (result.status === "credited") {
      expect(result.credit_cents).toBe(100);
      expect(result.stripe_ref).toBe("cbtxn_1");
    }
    expect(createBalanceTransaction).toHaveBeenCalledWith(
      "cus_1",
      expect.objectContaining({ amount: -100, currency: "usd" }),
      expect.objectContaining({ idempotencyKey: "bill_credit:c1:2026-07" })
    );
    expect(entries.some((e) => e.entryKind === ArtistLedgerEntryKind.bill_credit)).toBe(true);
  });

  it("caps credit at invoice when balance > invoice", async () => {
    const { prisma } = mockPrisma({ availableCents: 5000 });
    const createBalanceTransaction = vi.fn(async () => ({ id: "cbtxn_cap" }));
    const stripe = {
      invoices: { retrieveUpcoming: vi.fn(async () => ({ amount_due: 1800 })) },
      customers: { createBalanceTransaction }
    };
    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: stripe as never,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );
    expect(result).toMatchObject({ status: "credited", credit_cents: 1800 });
    expect(createBalanceTransaction).toHaveBeenCalledWith(
      "cus_1",
      expect.objectContaining({ amount: -1800 }),
      expect.anything()
    );
  });

  it("credits full invoice when balance equals invoice", async () => {
    const { prisma } = mockPrisma({ availableCents: 1800 });
    const stripe = {
      invoices: { retrieveUpcoming: vi.fn(async () => ({ amount_due: 1800 })) },
      customers: {
        createBalanceTransaction: vi.fn(async () => ({ id: "cbtxn_eq" }))
      }
    };
    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: stripe as never,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );
    expect(result).toMatchObject({ status: "credited", credit_cents: 1800 });
  });

  it("skips when invoice amount is zero", async () => {
    const { prisma } = mockPrisma({ availableCents: 100 });
    const stripe = {
      invoices: { retrieveUpcoming: vi.fn(async () => ({ amount_due: 0 })) },
      customers: { createBalanceTransaction: vi.fn() }
    };
    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: stripe as never,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );
    expect(result).toMatchObject({ status: "skipped", reason: "invoice_zero" });
    expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
  });

  it("re-run is idempotent — no second Stripe balance txn", async () => {
    const { prisma } = mockPrisma({
      availableCents: 100,
      existingBillCredit: { amountCents: 100, stripeRef: "cbtxn_prior" }
    });
    const createBalanceTransaction = vi.fn();
    const stripe = {
      invoices: { retrieveUpcoming: vi.fn(async () => ({ amount_due: 1800 })) },
      customers: { createBalanceTransaction }
    };
    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: stripe as never,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );
    expect(result).toMatchObject({
      status: "credited",
      idempotent: true,
      stripe_ref: "cbtxn_prior"
    });
    expect(createBalanceTransaction).not.toHaveBeenCalled();
  });

  it("Stripe failure writes no ledger entry", async () => {
    const { prisma, entries } = mockPrisma({ availableCents: 100 });
    const stripe = {
      invoices: { retrieveUpcoming: vi.fn(async () => ({ amount_due: 1800 })) },
      customers: {
        createBalanceTransaction: vi.fn(async () => {
          throw new Error("stripe_down");
        })
      }
    };
    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: stripe as never,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );
    expect(result).toMatchObject({ status: "skipped", reason: "stripe_unavailable" });
    expect(entries.filter((e) => e.entryKind === ArtistLedgerEntryKind.bill_credit)).toHaveLength(
      0
    );
  });

  it("null stripe client skips without ledger write", async () => {
    const { prisma, entries } = mockPrisma({ availableCents: 100 });
    const result = await settleCreatorOnce(
      {
        prisma,
        stripe: null,
        env: { RELAY_FAN_PREMIUM_ENABLED: "1" },
        now: new Date("2026-07-16T00:00:00.000Z")
      },
      "c1"
    );
    expect(result).toMatchObject({ status: "skipped", reason: "stripe_unavailable" });
    expect(entries).toHaveLength(0);
  });
});
