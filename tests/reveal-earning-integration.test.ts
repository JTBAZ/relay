/**
 * @fileoverview Reveal + artist tip_earned same-transaction integration (MB-10).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revealPost } from "../src/tips/reveal-service.js";

vi.mock("../src/tips/tip-eligibility.js", () => ({
  resolveTipEligibility: vi.fn(async () => ({
    eligible: true,
    reasons: [],
    promo_slot_id: "slot1",
    creator_id: "cr1"
  }))
}));

import { resolveTipEligibility } from "../src/tips/tip-eligibility.js";

function createIntegratedPrisma(opts?: { failArtistEarn?: boolean }) {
  const reveals: Array<Record<string, unknown>> = [];
  const tipEntries: Array<Record<string, unknown>> = [];
  const artistEntries: Array<Record<string, unknown>> = [];
  let wallet = { grantedBalance: 3, purchasedBalance: 0 };
  let artistBalance = { availableCents: 0, lifetimeCents: 0 };
  let idSeq = 0;
  let txDepth = 0;

  const api: Record<string, unknown> = {
    tipReveal: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        reveals.find(
          (r) =>
            r.patronAccountId === where.patronAccountId &&
            r.postId === where.postId &&
            r.closedAt == null
        ) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `rev_${++idSeq}`, closedAt: null, ...data };
        reveals.push(row);
        return row;
      })
    },
    tipLedgerEntry: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        tipEntries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `tle_${++idSeq}`, ...data };
        tipEntries.push(row);
        return row;
      })
    },
    tipWallet: {
      upsert: vi.fn(async ({ where }: { where: { accountId: string } }) => ({
        accountId: where.accountId,
        ...wallet
      })),
      update: vi.fn(async ({ data }: { data: typeof wallet }) => {
        wallet = { ...wallet, ...data };
        return { accountId: "acc1", ...wallet };
      })
    },
    artistLedgerEntry: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        artistEntries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (opts?.failArtistEarn) {
          throw new Error("artist_earn_injected_failure");
        }
        const row = { id: `ale_${++idSeq}`, ...data };
        artistEntries.push(row);
        return row;
      })
    },
    artistBalance: {
      upsert: vi.fn(async ({ where }: { where: { creatorId: string } }) => ({
        creatorId: where.creatorId,
        ...artistBalance
      })),
      update: vi.fn(async ({ data }: { data: typeof artistBalance }) => {
        artistBalance = { ...artistBalance, ...data };
        return { creatorId: "cr1", ...artistBalance };
      })
    },
    platformRevenueEvent: { create: vi.fn(async () => ({})) },
    mediaAsset: { findMany: vi.fn(async () => [{ id: "m1" }]) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      txDepth += 1;
      const snapshot = {
        reveals: reveals.length,
        tipEntries: tipEntries.length,
        artistEntries: artistEntries.length,
        wallet: { ...wallet },
        artistBalance: { ...artistBalance }
      };
      try {
        return await fn(api);
      } catch (err) {
        // Simulate rollback of in-tx mutations
        reveals.length = snapshot.reveals;
        tipEntries.length = snapshot.tipEntries;
        artistEntries.length = snapshot.artistEntries;
        wallet = snapshot.wallet;
        artistBalance = snapshot.artistBalance;
        throw err;
      } finally {
        txDepth -= 1;
      }
    }),
    _tipEntries: tipEntries,
    _artistEntries: artistEntries,
    _reveals: reveals,
    getWallet: () => wallet,
    getArtistBalance: () => artistBalance,
    getTxDepth: () => txDepth
  };
  return api as never;
}

describe("reveal-earning-integration", () => {
  beforeEach(() => {
    vi.mocked(resolveTipEligibility).mockResolvedValue({
      eligible: true,
      reasons: [],
      promo_slot_id: "slot1",
      creator_id: "cr1"
    });
    process.env.RELAY_TIP_ARTIST_PAYOUT_CENTS = "33";
    process.env.RELAY_TIPS_REVEAL_WINDOW_DAYS = "14";
  });

  it("one reveal → one spend + one tip_earned", async () => {
    const prisma = createIntegratedPrisma();
    await revealPost(prisma, {
      patronAccountId: "acc1",
      postId: "post1",
      surface: "discover",
      now: new Date("2026-07-16T00:00:00.000Z")
    });
    const tipSpends = (
      prisma as { _tipEntries: Array<{ entryKind: string }> }
    )._tipEntries.filter((e) => e.entryKind === "spend");
    const artistEarns = (
      prisma as { _artistEntries: Array<{ entryKind: string; amountCents: number }> }
    )._artistEntries.filter((e) => e.entryKind === "tip_earned");
    expect(tipSpends).toHaveLength(1);
    expect(artistEarns).toHaveLength(1);
    expect(artistEarns[0]?.amountCents).toBe(33);
    expect(
      (prisma as { getArtistBalance: () => { availableCents: number } }).getArtistBalance()
        .availableCents
    ).toBe(33);
  });

  it("artist earn failure rolls back fan spend", async () => {
    const prisma = createIntegratedPrisma({ failArtistEarn: true });
    await expect(
      revealPost(prisma, {
        patronAccountId: "acc1",
        postId: "post1",
        surface: "discover",
        now: new Date("2026-07-16T00:00:00.000Z")
      })
    ).rejects.toThrow(/artist_earn_injected_failure/);

    expect((prisma as { _tipEntries: unknown[] })._tipEntries).toHaveLength(0);
    expect((prisma as { _artistEntries: unknown[] })._artistEntries).toHaveLength(0);
    expect((prisma as { _reveals: unknown[] })._reveals).toHaveLength(0);
    expect(
      (prisma as { getWallet: () => { grantedBalance: number } }).getWallet().grantedBalance
    ).toBe(3);
  });
});
