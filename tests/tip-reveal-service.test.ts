/**
 * @fileoverview Tip reveal service tests (MB-5).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsufficientTipsError } from "../src/ledger/tip-ledger-service.js";
import { revealPost, TipNotEligibleError } from "../src/tips/reveal-service.js";

vi.mock("../src/tips/tip-eligibility.js", () => ({
  resolveTipEligibility: vi.fn(async () => ({
    eligible: true,
    reasons: [],
    promo_slot_id: "slot1",
    creator_id: "cr1"
  }))
}));

import { resolveTipEligibility } from "../src/tips/tip-eligibility.js";

function createRevealPrisma(opts?: { balance?: number; failArtistEarn?: boolean }) {
  const balance = opts?.balance ?? 1;
  const reveals: Array<Record<string, unknown>> = [];
  const entries: Array<Record<string, unknown>> = [];
  const artistEntries: Array<Record<string, unknown>> = [];
  let wallet = { grantedBalance: balance, purchasedBalance: 0 };
  let artistBalance = { availableCents: 0, lifetimeCents: 0 };
  let idSeq = 0;

  const api = {
    tipReveal: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          reveals.find(
            (r) =>
              r.patronAccountId === where.patronAccountId &&
              r.postId === where.postId &&
              r.closedAt == null
          ) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `rev_${++idSeq}`, closedAt: null, ...data };
        reveals.push(row);
        return row;
      }),
      delete: vi.fn(async () => undefined)
    },
    tipLedgerEntry: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `le_${++idSeq}`, ...data };
        entries.push(row);
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
      }),
      findUnique: vi.fn(async () => ({ accountId: "acc1", ...wallet }))
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
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(api)),
    _reveals: reveals,
    _entries: entries,
    _artistEntries: artistEntries,
    getWallet: () => wallet,
    getArtistBalance: () => artistBalance
  };
  return api as never;
}

describe("tip-reveal-service", () => {
  beforeEach(() => {
    vi.mocked(resolveTipEligibility).mockResolvedValue({
      eligible: true,
      reasons: [],
      promo_slot_id: "slot1",
      creator_id: "cr1"
    });
    process.env.RELAY_TIPS_REVEAL_WINDOW_DAYS = "14";
  });

  it("creates reveal and spends one tip", async () => {
    const prisma = createRevealPrisma({ balance: 2 });
    const result = await revealPost(prisma, {
      patronAccountId: "acc1",
      postId: "post1",
      surface: "discover",
      now: new Date("2026-07-16T00:00:00.000Z")
    });
    expect(result.reused).toBe(false);
    expect(result.reveal_id).toBeTruthy();
    expect(result.media.media_ids).toEqual(["m1"]);
    expect((prisma as { getWallet: () => { grantedBalance: number } }).getWallet().grantedBalance).toBe(
      1
    );
  });

  it("rejects spend when tip_eligible was toggled off (spend-time re-check)", async () => {
    vi.mocked(resolveTipEligibility).mockResolvedValue({
      eligible: false,
      reasons: ["disabled"],
      promo_slot_id: "slot1",
      creator_id: "cr1"
    });
    const prisma = createRevealPrisma({ balance: 3 });
    await expect(
      revealPost(prisma, {
        patronAccountId: "acc1",
        postId: "post1",
        surface: "discover"
      })
    ).rejects.toBeInstanceOf(TipNotEligibleError);
  });

  it("returns existing open reveal without second spend", async () => {
    const prisma = createRevealPrisma({ balance: 1 });
    const first = await revealPost(prisma, {
      patronAccountId: "acc1",
      postId: "post1",
      surface: "discover",
      now: new Date("2026-07-16T00:00:00.000Z")
    });
    const second = await revealPost(prisma, {
      patronAccountId: "acc1",
      postId: "post1",
      surface: "discover",
      now: new Date("2026-07-16T01:00:00.000Z")
    });
    expect(second.reveal_id).toBe(first.reveal_id);
    expect(second.reused).toBe(true);
    expect((prisma as { getWallet: () => { grantedBalance: number } }).getWallet().grantedBalance).toBe(
      0
    );
  });

  it("throws TipNotEligibleError when eligibility fails", async () => {
    vi.mocked(resolveTipEligibility).mockResolvedValue({
      eligible: false,
      reasons: ["mature"],
      promo_slot_id: null,
      creator_id: "cr1"
    });
    const prisma = createRevealPrisma({ balance: 1 });
    await expect(
      revealPost(prisma, { patronAccountId: "acc1", postId: "post1", surface: "discover" })
    ).rejects.toBeInstanceOf(TipNotEligibleError);
  });

  it("throws InsufficientTipsError at zero balance", async () => {
    const prisma = createRevealPrisma({ balance: 0 });
    await expect(
      revealPost(prisma, { patronAccountId: "acc1", postId: "post1", surface: "discover" })
    ).rejects.toBeInstanceOf(InsufficientTipsError);
  });
});
