/**
 * @fileoverview Tip ledger service property + rollover tests (MB-5).
 */
import { TipEntryKind } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adjustTips,
  getWallet,
  grantTips,
  InsufficientTipsError,
  recomputeWallet,
  spendTip
} from "../src/ledger/tip-ledger-service.js";

type Entry = {
  id: string;
  accountId: string;
  entryKind: TipEntryKind;
  tips: number;
  bucket: string;
  revealId: string | null;
  periodKey: string | null;
  idempotencyKey: string;
};

function createMemoryPrisma() {
  const entries: Entry[] = [];
  const wallets = new Map<string, { grantedBalance: number; purchasedBalance: number }>();
  const revenue: unknown[] = [];
  const audits: unknown[] = [];
  let idSeq = 0;
  const nextId = () => `id_${++idSeq}`;

  const api = {
    tipLedgerEntry: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null
      ),
      findFirst: vi.fn(
        async ({
          where
        }: {
          where: { accountId: string; entryKind: TipEntryKind; periodKey: string };
        }) =>
          entries.find(
            (e) =>
              e.accountId === where.accountId &&
              e.entryKind === where.entryKind &&
              e.periodKey === where.periodKey
          ) ?? null
      ),
      findMany: vi.fn(async ({ where }: { where: { accountId: string } }) =>
        entries.filter((e) => e.accountId === where.accountId)
      ),
      create: vi.fn(async ({ data }: { data: Omit<Entry, "id"> & { id?: string } }) => {
        if (entries.some((e) => e.idempotencyKey === data.idempotencyKey)) {
          const err = new Error("Unique constraint") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row: Entry = {
          id: data.id ?? nextId(),
          accountId: data.accountId,
          entryKind: data.entryKind,
          tips: data.tips,
          bucket: data.bucket,
          revealId: data.revealId ?? null,
          periodKey: data.periodKey ?? null,
          idempotencyKey: data.idempotencyKey
        };
        entries.push(row);
        return row;
      })
    },
    tipWallet: {
      findUnique: vi.fn(async ({ where }: { where: { accountId: string } }) => {
        const w = wallets.get(where.accountId);
        if (!w) return null;
        return { accountId: where.accountId, ...w };
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update
        }: {
          where: { accountId: string };
          create: { accountId: string; grantedBalance: number; purchasedBalance: number };
          update: Partial<{ grantedBalance: number; purchasedBalance: number }>;
        }) => {
          const existing = wallets.get(where.accountId);
          if (!existing) {
            wallets.set(where.accountId, {
              grantedBalance: create.grantedBalance,
              purchasedBalance: create.purchasedBalance
            });
          } else if (Object.keys(update).length > 0) {
            wallets.set(where.accountId, {
              grantedBalance: update.grantedBalance ?? existing.grantedBalance,
              purchasedBalance: update.purchasedBalance ?? existing.purchasedBalance
            });
          }
          const w = wallets.get(where.accountId)!;
          return { accountId: where.accountId, ...w };
        }
      ),
      update: vi.fn(
        async ({
          where,
          data
        }: {
          where: { accountId: string };
          data: { grantedBalance: number; purchasedBalance?: number };
        }) => {
          const existing = wallets.get(where.accountId) ?? {
            grantedBalance: 0,
            purchasedBalance: 0
          };
          const next = {
            grantedBalance: data.grantedBalance,
            purchasedBalance:
              data.purchasedBalance !== undefined
                ? data.purchasedBalance
                : existing.purchasedBalance
          };
          wallets.set(where.accountId, next);
          return { accountId: where.accountId, ...next };
        }
      )
    },
    platformRevenueEvent: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        revenue.push(data);
        return data;
      })
    },
    platformOperatorAccessAudit: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        audits.push(data);
        return data;
      })
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(api)),
    _entries: entries,
    _wallets: wallets
  };

  return api as unknown as ReturnType<typeof Object.assign> & {
    _entries: Entry[];
    _wallets: Map<string, { grantedBalance: number; purchasedBalance: number }>;
  } & Parameters<typeof grantTips>[0];
}

describe("tip-ledger-service", () => {
  beforeEach(() => {
    process.env.RELAY_TIPS_BETA_MONTHLY_GRANT = "3";
  });

  it("grant + spend + adjust leaves wallet equal to recomputeWallet", async () => {
    const prisma = createMemoryPrisma();
    await grantTips(prisma, {
      accountId: "acc1",
      tips: 3,
      periodKey: "2026-07",
      idempotencyKey: "g1"
    });
    await spendTip(prisma, {
      accountId: "acc1",
      revealId: "r1",
      idempotencyKey: "s1",
      tips: 1
    });
    await adjustTips(prisma, {
      accountId: "acc1",
      tips: 2,
      bucket: "purchased",
      reason: "test",
      operatorAccountId: "ops",
      idempotencyKey: "a1"
    });
    const live = await getWallet(prisma, "acc1");
    const recomputed = await recomputeWallet(prisma, "acc1");
    expect(live).toEqual(recomputed);
    expect(live.granted_balance).toBe(2);
    expect(live.purchased_balance).toBe(2);
  });

  it("rollover cap: grant at cap writes grant + expire and balance stays at cap", async () => {
    const prisma = createMemoryPrisma();
    await grantTips(prisma, {
      accountId: "acc1",
      tips: 3,
      periodKey: "2026-06",
      idempotencyKey: "g0"
    });
    // Manually top to cap (6) via adjust
    await adjustTips(prisma, {
      accountId: "acc1",
      tips: 3,
      bucket: "granted",
      reason: "top",
      operatorAccountId: null,
      idempotencyKey: "top"
    });
    expect((await getWallet(prisma, "acc1")).granted_balance).toBe(6);

    const result = await grantTips(prisma, {
      accountId: "acc1",
      tips: 3,
      periodKey: "2026-07",
      idempotencyKey: "g1"
    });
    expect(result.wallet.granted_balance).toBe(6);
    expect(result.entries.some((e) => e.entry_kind === TipEntryKind.expire)).toBe(true);
    expect(result.entries.some((e) => e.entry_kind === TipEntryKind.grant && e.tips === 3)).toBe(
      true
    );
  });

  it("duplicate grant for same period is idempotent", async () => {
    const prisma = createMemoryPrisma();
    const a = await grantTips(prisma, {
      accountId: "acc1",
      tips: 3,
      periodKey: "2026-07",
      idempotencyKey: "g1"
    });
    const b = await grantTips(prisma, {
      accountId: "acc1",
      tips: 3,
      periodKey: "2026-07",
      idempotencyKey: "g1-dup"
    });
    expect(a.idempotent).toBe(false);
    expect(b.idempotent).toBe(true);
    expect((await getWallet(prisma, "acc1")).granted_balance).toBe(3);
  });

  it("duplicate spend idempotencyKey is a no-op", async () => {
    const prisma = createMemoryPrisma();
    await grantTips(prisma, {
      accountId: "acc1",
      tips: 3,
      periodKey: "2026-07",
      idempotencyKey: "g1"
    });
    await spendTip(prisma, {
      accountId: "acc1",
      revealId: "r1",
      idempotencyKey: "s1"
    });
    await spendTip(prisma, {
      accountId: "acc1",
      revealId: "r1",
      idempotencyKey: "s1"
    });
    expect((await getWallet(prisma, "acc1")).granted_balance).toBe(2);
  });

  it("spend at zero balance throws InsufficientTipsError", async () => {
    const prisma = createMemoryPrisma();
    await expect(
      spendTip(prisma, { accountId: "acc1", revealId: "r1", idempotencyKey: "s1" })
    ).rejects.toBeInstanceOf(InsufficientTipsError);
  });
});
