/**
 * @fileoverview Artist ledger unit tests (MB-10).
 */
import { ArtistLedgerEntryKind } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  appendArtistLedgerEntry,
  recomputeArtistBalance,
  recordTipEarned
} from "../src/ledger/artist-ledger-service.js";

function mockPrisma(entries: Array<Record<string, unknown>> = []) {
  const balances = new Map<string, { availableCents: number; lifetimeCents: number }>();
  const revenue: unknown[] = [];

  const tx = {
    artistLedgerEntry: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ale_${entries.length + 1}`, ...data };
        entries.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: { creatorId: string } }) =>
        entries.filter((e) => e.creatorId === where.creatorId)
      )
    },
    artistBalance: {
      upsert: vi.fn(async (args: {
        where: { creatorId: string };
        create: { availableCents: number; lifetimeCents: number; creatorId: string };
        update: Record<string, unknown>;
      }) => {
        const existing = balances.get(args.where.creatorId);
        if (!existing) {
          balances.set(args.where.creatorId, {
            availableCents: args.create.availableCents,
            lifetimeCents: args.create.lifetimeCents
          });
          return {
            creatorId: args.where.creatorId,
            availableCents: args.create.availableCents,
            lifetimeCents: args.create.lifetimeCents
          };
        }
        return {
          creatorId: args.where.creatorId,
          availableCents: existing.availableCents,
          lifetimeCents: existing.lifetimeCents
        };
      }),
      update: vi.fn(async (args: {
        where: { creatorId: string };
        data: { availableCents: number; lifetimeCents: number };
      }) => {
        balances.set(args.where.creatorId, {
          availableCents: args.data.availableCents,
          lifetimeCents: args.data.lifetimeCents
        });
        return {
          creatorId: args.where.creatorId,
          ...args.data
        };
      })
    },
    platformRevenueEvent: {
      create: vi.fn(async (args: { data: unknown }) => {
        revenue.push(args.data);
        return { id: `rev_${revenue.length}` };
      })
    }
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    artistLedgerEntry: tx.artistLedgerEntry,
    artistBalance: tx.artistBalance,
    platformRevenueEvent: tx.platformRevenueEvent
  };

  return { prisma: prisma as never, entries, balances, revenue, tx };
}

describe("artist-ledger-service", () => {
  it("recordTipEarned credits +33 and is idempotent per reveal", async () => {
    const { prisma, balances, revenue } = mockPrisma();
    const first = await recordTipEarned(prisma, {
      creatorId: "c1",
      revealId: "rev_1",
      amountCents: 33
    });
    expect(first.idempotent).toBe(false);
    expect(first.balance.available_cents).toBe(33);
    expect(first.balance.lifetime_cents).toBe(33);
    expect(revenue).toHaveLength(1);

    const second = await recordTipEarned(prisma, {
      creatorId: "c1",
      revealId: "rev_1",
      amountCents: 33
    });
    expect(second.idempotent).toBe(true);
    expect(balances.get("c1")?.availableCents).toBe(33);
  });

  it("recomputeArtistBalance matches cache after earn + clawback", async () => {
    const { prisma, entries } = mockPrisma([
      {
        id: "1",
        creatorId: "c1",
        entryKind: ArtistLedgerEntryKind.tip_earned,
        amountCents: 33,
        idempotencyKey: "a"
      },
      {
        id: "2",
        creatorId: "c1",
        entryKind: ArtistLedgerEntryKind.tip_earned,
        amountCents: 33,
        idempotencyKey: "b"
      },
      {
        id: "3",
        creatorId: "c1",
        entryKind: ArtistLedgerEntryKind.clawback,
        amountCents: -33,
        idempotencyKey: "c"
      }
    ]);

    const wire = await recomputeArtistBalance(prisma, "c1");
    expect(wire.available_cents).toBe(33);
    expect(wire.lifetime_cents).toBe(66);
    expect(entries).toHaveLength(3);
  });

  it("appendArtistLedgerEntry bill_credit reduces available", async () => {
    const { prisma } = mockPrisma();
    await recordTipEarned(prisma, { creatorId: "c1", revealId: "r1", amountCents: 100 });
    const credit = await appendArtistLedgerEntry(prisma, {
      creatorId: "c1",
      entryKind: ArtistLedgerEntryKind.bill_credit,
      amountCents: -40,
      idempotencyKey: "bill:c1:2026-07",
      stripeRef: "cbtxn_1"
    });
    expect(credit.balance.available_cents).toBe(60);
    expect(credit.balance.lifetime_cents).toBe(100);
  });
});
