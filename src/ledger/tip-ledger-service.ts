/**
 * @fileoverview Tip ledger — sole writer for TipLedgerEntry + TipWallet (master map invariant 3).
 * @see docs/TIP_BETA_BUILD_PLAN.md
 */

import {
  PlatformRevenueEventKind,
  PlatformRevenueSourceLabel,
  TipEntryKind,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { scheduleUsageEvent } from "../usage/usage-events.js";
import { resolveTipsBetaConfig } from "../tips/config.js";

export class InsufficientTipsError extends Error {
  public readonly code = "insufficient_tips" as const;
  public constructor(message = "Insufficient Tips") {
    super(message);
    this.name = "InsufficientTipsError";
  }
}

export type TipWalletWire = {
  account_id: string;
  granted_balance: number;
  purchased_balance: number;
};

export type TipLedgerMutationResult = {
  wallet: TipWalletWire;
  entries: Array<{ id: string; entry_kind: TipEntryKind; tips: number; bucket: string }>;
  idempotent: boolean;
};

type Tx = Prisma.TransactionClient;

async function ensureWallet(tx: Tx, accountId: string): Promise<{
  accountId: string;
  grantedBalance: number;
  purchasedBalance: number;
}> {
  return tx.tipWallet.upsert({
    where: { accountId },
    create: { accountId, grantedBalance: 0, purchasedBalance: 0 },
    update: {}
  });
}

function wireWallet(row: {
  accountId: string;
  grantedBalance: number;
  purchasedBalance: number;
}): TipWalletWire {
  return {
    account_id: row.accountId,
    granted_balance: row.grantedBalance,
    purchased_balance: row.purchasedBalance
  };
}

async function findByIdempotency(
  tx: Tx,
  idempotencyKey: string
): Promise<TipLedgerMutationResult | null> {
  const existing = await tx.tipLedgerEntry.findUnique({
    where: { idempotencyKey }
  });
  if (!existing) return null;
  const wallet = await ensureWallet(tx, existing.accountId);
  return {
    wallet: wireWallet(wallet),
    entries: [
      {
        id: existing.id,
        entry_kind: existing.entryKind,
        tips: existing.tips,
        bucket: existing.bucket
      }
    ],
    idempotent: true
  };
}

async function applyDelta(
  tx: Tx,
  accountId: string,
  bucket: "granted" | "purchased",
  delta: number
): Promise<TipWalletWire> {
  const wallet = await ensureWallet(tx, accountId);
  const nextGranted =
    bucket === "granted" ? wallet.grantedBalance + delta : wallet.grantedBalance;
  const nextPurchased =
    bucket === "purchased" ? wallet.purchasedBalance + delta : wallet.purchasedBalance;
  if (nextGranted < 0 || nextPurchased < 0) {
    throw new InsufficientTipsError();
  }
  const updated = await tx.tipWallet.update({
    where: { accountId },
    data: {
      grantedBalance: nextGranted,
      purchasedBalance: nextPurchased
    }
  });
  return wireWallet(updated);
}

function emitGrantUsage(prisma: PrismaClient, accountId: string, tips: number): void {
  scheduleUsageEvent(prisma, {
    relayCreatorId: null,
    metric: "tips.granted",
    quantity: tips,
    meta: { account_id: accountId }
  });
}

function emitSpendUsage(
  prisma: PrismaClient,
  args: { accountId: string; creatorId?: string | null; tips: number }
): void {
  scheduleUsageEvent(prisma, {
    relayCreatorId: args.creatorId ?? null,
    metric: "tips.spent",
    quantity: args.tips,
    meta: { account_id: args.accountId }
  });
}

/**
 * Grant Tips into the granted bucket, applying the rollover cap at grant time.
 * Cap defaults to 2 × beta monthly grant; paid fan plans pass `rolloverCap` explicitly.
 */
export async function grantTips(
  prisma: PrismaClient,
  args: {
    accountId: string;
    tips: number;
    periodKey: string;
    idempotencyKey: string;
    /** When set, overrides 2 × beta monthly grant. */
    rolloverCap?: number;
  }
): Promise<TipLedgerMutationResult> {
  const accountId = args.accountId.trim();
  const tips = Math.floor(args.tips);
  if (!accountId || tips <= 0) {
    throw new Error("grantTips requires accountId and positive tips");
  }
  const monthly = resolveTipsBetaConfig().monthlyGrant;
  const cap =
    typeof args.rolloverCap === "number" && Number.isFinite(args.rolloverCap)
      ? Math.max(0, Math.floor(args.rolloverCap))
      : monthly * 2;

  return prisma.$transaction(async (tx) => {
    const prior = await findByIdempotency(tx, args.idempotencyKey);
    if (prior) return prior;

    const existingGrant = await tx.tipLedgerEntry.findFirst({
      where: {
        accountId,
        entryKind: TipEntryKind.grant,
        periodKey: args.periodKey
      }
    });
    if (existingGrant) {
      const wallet = await ensureWallet(tx, accountId);
      return {
        wallet: wireWallet(wallet),
        entries: [
          {
            id: existingGrant.id,
            entry_kind: existingGrant.entryKind,
            tips: existingGrant.tips,
            bucket: existingGrant.bucket
          }
        ],
        idempotent: true
      };
    }

    const wallet = await ensureWallet(tx, accountId);
    const entries: TipLedgerMutationResult["entries"] = [];

    const grantFull = await tx.tipLedgerEntry.create({
      data: {
        accountId,
        entryKind: TipEntryKind.grant,
        tips,
        bucket: "granted",
        periodKey: args.periodKey,
        idempotencyKey: args.idempotencyKey
      }
    });
    entries.push({
      id: grantFull.id,
      entry_kind: TipEntryKind.grant,
      tips,
      bucket: "granted"
    });

    let nextGranted = wallet.grantedBalance + tips;
    if (nextGranted > cap) {
      const trim = nextGranted - cap;
      const expireRow = await tx.tipLedgerEntry.create({
        data: {
          accountId,
          entryKind: TipEntryKind.expire,
          tips: -trim,
          bucket: "granted",
          periodKey: null,
          idempotencyKey: `${args.idempotencyKey}:expire`
        }
      });
      entries.push({
        id: expireRow.id,
        entry_kind: TipEntryKind.expire,
        tips: -trim,
        bucket: "granted"
      });
      nextGranted = cap;
    }

    const updated = await tx.tipWallet.update({
      where: { accountId },
      data: { grantedBalance: nextGranted }
    });

    await tx.platformRevenueEvent.create({
      data: {
        eventKind: PlatformRevenueEventKind.tip_grant,
        sourceLabel: PlatformRevenueSourceLabel.relay_native,
        provider: "tips_beta",
        occurredAt: new Date(),
        amountCents: null,
        payload: {
          account_id: accountId,
          tips,
          period_key: args.periodKey,
          granted_balance: nextGranted
        }
      }
    });

    emitGrantUsage(prisma, accountId, tips);

    return { wallet: wireWallet(updated), entries, idempotent: false };
  });
}

/**
 * Purchase Tips into the purchased bucket (Reload Pack). Never expires / never capped by rollover.
 */
export async function purchaseTips(
  prisma: PrismaClient,
  args: {
    accountId: string;
    tips: number;
    stripeRef: string;
    idempotencyKey: string;
  }
): Promise<TipLedgerMutationResult> {
  const accountId = args.accountId.trim();
  const tips = Math.floor(args.tips);
  const stripeRef = args.stripeRef.trim();
  if (!accountId || tips <= 0 || !stripeRef) {
    throw new Error("purchaseTips requires accountId, positive tips, and stripeRef");
  }

  return prisma.$transaction(async (tx) => {
    const prior = await findByIdempotency(tx, args.idempotencyKey);
    if (prior) return prior;

    const entry = await tx.tipLedgerEntry.create({
      data: {
        accountId,
        entryKind: TipEntryKind.purchase,
        tips,
        bucket: "purchased",
        stripeRef,
        periodKey: null,
        idempotencyKey: args.idempotencyKey
      }
    });
    const wallet = await applyDelta(tx, accountId, "purchased", tips);

    await tx.platformRevenueEvent.create({
      data: {
        eventKind: PlatformRevenueEventKind.tip_purchase,
        sourceLabel: PlatformRevenueSourceLabel.relay_native,
        provider: "stripe",
        occurredAt: new Date(),
        checkoutId: stripeRef,
        amountCents: null,
        payload: {
          account_id: accountId,
          tips,
          stripe_ref: stripeRef
        }
      }
    });

    scheduleUsageEvent(prisma, {
      relayCreatorId: null,
      metric: "tips.purchased",
      quantity: tips,
      meta: { account_id: accountId, stripe_ref: stripeRef }
    });

    return {
      wallet,
      entries: [
        {
          id: entry.id,
          entry_kind: TipEntryKind.purchase,
          tips,
          bucket: "purchased"
        }
      ],
      idempotent: false
    };
  });
}

/**
 * Spend one Tip (granted first, then purchased) against an open reveal.
 * Pass `tx` to compose inside a larger transaction (reveal + spend).
 */
export async function spendTip(
  prisma: PrismaClient,
  args: {
    accountId: string;
    revealId: string;
    idempotencyKey: string;
    /** For usage attribution (creator tenant). */
    creatorId?: string | null;
    tips?: number;
  },
  txClient?: Tx
): Promise<TipLedgerMutationResult> {
  const accountId = args.accountId.trim();
  const tips = Math.floor(args.tips ?? 1);
  if (!accountId || tips <= 0) {
    throw new Error("spendTip requires accountId and positive tips");
  }

  const run = async (tx: Tx): Promise<TipLedgerMutationResult> => {
    const prior = await findByIdempotency(tx, args.idempotencyKey);
    if (prior) return prior;

    const wallet = await ensureWallet(tx, accountId);
    const total = wallet.grantedBalance + wallet.purchasedBalance;
    if (total < tips) {
      throw new InsufficientTipsError();
    }

    let remaining = tips;
    const entries: TipLedgerMutationResult["entries"] = [];
    let grantedBalance = wallet.grantedBalance;
    let purchasedBalance = wallet.purchasedBalance;

    if (grantedBalance > 0 && remaining > 0) {
      const fromGranted = Math.min(grantedBalance, remaining);
      const row = await tx.tipLedgerEntry.create({
        data: {
          accountId,
          entryKind: TipEntryKind.spend,
          tips: -fromGranted,
          bucket: "granted",
          revealId: args.revealId,
          idempotencyKey:
            fromGranted === tips
              ? args.idempotencyKey
              : `${args.idempotencyKey}:granted`
        }
      });
      entries.push({
        id: row.id,
        entry_kind: TipEntryKind.spend,
        tips: -fromGranted,
        bucket: "granted"
      });
      grantedBalance -= fromGranted;
      remaining -= fromGranted;
    }

    if (remaining > 0) {
      const row = await tx.tipLedgerEntry.create({
        data: {
          accountId,
          entryKind: TipEntryKind.spend,
          tips: -remaining,
          bucket: "purchased",
          revealId: args.revealId,
          idempotencyKey:
            entries.length === 0 ? args.idempotencyKey : `${args.idempotencyKey}:purchased`
        }
      });
      entries.push({
        id: row.id,
        entry_kind: TipEntryKind.spend,
        tips: -remaining,
        bucket: "purchased"
      });
      purchasedBalance -= remaining;
      remaining = 0;
    }

    const updated = await tx.tipWallet.update({
      where: { accountId },
      data: { grantedBalance, purchasedBalance }
    });

    await tx.platformRevenueEvent.create({
      data: {
        eventKind: PlatformRevenueEventKind.tip_spend,
        sourceLabel: PlatformRevenueSourceLabel.relay_native,
        provider: "tips_beta",
        occurredAt: new Date(),
        creatorId: args.creatorId ?? null,
        amountCents: null,
        payload: {
          account_id: accountId,
          reveal_id: args.revealId,
          tips
        }
      }
    });

    return { wallet: wireWallet(updated), entries, idempotent: false };
  };

  const result = txClient ? await run(txClient) : await prisma.$transaction(run);
  if (!result.idempotent) {
    emitSpendUsage(prisma, {
      accountId,
      creatorId: args.creatorId,
      tips
    });
  }
  return result;
}

/**
 * Operator adjustment (audited by caller via PlatformOperatorAccessAudit).
 */
export async function adjustTips(
  prisma: PrismaClient,
  args: {
    accountId: string;
    tips: number;
    bucket: "granted" | "purchased";
    reason: string;
    operatorAccountId: string | null;
    idempotencyKey: string;
  }
): Promise<TipLedgerMutationResult> {
  const accountId = args.accountId.trim();
  const tips = Math.trunc(args.tips);
  if (!accountId || tips === 0) {
    throw new Error("adjustTips requires accountId and non-zero tips");
  }

  return prisma.$transaction(async (tx) => {
    const prior = await findByIdempotency(tx, args.idempotencyKey);
    if (prior) return prior;

    const row = await tx.tipLedgerEntry.create({
      data: {
        accountId,
        entryKind: TipEntryKind.adjust,
        tips,
        bucket: args.bucket,
        idempotencyKey: args.idempotencyKey,
        periodKey: null
      }
    });

    const wallet = await applyDelta(tx, accountId, args.bucket, tips);

    await tx.platformOperatorAccessAudit.create({
      data: {
        action: "tip_adjust",
        outcome: "allowed",
        reason: args.reason.slice(0, 500),
        accountId: args.operatorAccountId,
        route: "tip-ledger-service.adjustTips",
        method: "INTERNAL"
      }
    });

    return {
      wallet,
      entries: [
        {
          id: row.id,
          entry_kind: TipEntryKind.adjust,
          tips,
          bucket: args.bucket
        }
      ],
      idempotent: false
    };
  });
}

/**
 * Claw back unspent Tips from a Stripe refund/dispute (MB-12).
 * Caps at current bucket balance — spent Tips stay spent.
 */
export async function clawbackTips(
  prisma: PrismaClient,
  args: {
    accountId: string;
    tips: number;
    bucket: "granted" | "purchased";
    stripeRef: string;
    idempotencyKey: string;
  }
): Promise<TipLedgerMutationResult> {
  const accountId = args.accountId.trim();
  const requested = Math.floor(args.tips);
  if (!accountId || requested <= 0) {
    throw new Error("clawbackTips requires accountId and positive tips");
  }

  return prisma.$transaction(async (tx) => {
    const prior = await findByIdempotency(tx, args.idempotencyKey);
    if (prior) return prior;

    const wallet = await ensureWallet(tx, accountId);
    const available =
      args.bucket === "granted" ? wallet.grantedBalance : wallet.purchasedBalance;
    const claw = Math.min(available, requested);
    if (claw <= 0) {
      return {
        wallet: wireWallet(wallet),
        entries: [],
        idempotent: false
      };
    }

    const row = await tx.tipLedgerEntry.create({
      data: {
        accountId,
        entryKind: TipEntryKind.clawback,
        tips: -claw,
        bucket: args.bucket,
        stripeRef: args.stripeRef,
        idempotencyKey: args.idempotencyKey,
        periodKey: null
      }
    });
    const updated = await applyDelta(tx, accountId, args.bucket, -claw);

    await tx.platformRevenueEvent.create({
      data: {
        eventKind: PlatformRevenueEventKind.refund_issued,
        sourceLabel: PlatformRevenueSourceLabel.relay_native,
        provider: "stripe",
        occurredAt: new Date(),
        checkoutId: args.stripeRef,
        payload: {
          account_id: accountId,
          tips: -claw,
          bucket: args.bucket,
          requested_tips: requested
        }
      }
    });

    return {
      wallet: updated,
      entries: [
        {
          id: row.id,
          entry_kind: TipEntryKind.clawback,
          tips: -claw,
          bucket: args.bucket
        }
      ],
      idempotent: false
    };
  });
}

export async function getWallet(
  prisma: PrismaClient,
  accountId: string
): Promise<TipWalletWire> {
  const row = await prisma.tipWallet.findUnique({
    where: { accountId: accountId.trim() }
  });
  if (!row) {
    return { account_id: accountId.trim(), granted_balance: 0, purchased_balance: 0 };
  }
  return wireWallet(row);
}

/** Recompute wallet from ledger entries (oracle / safety net). */
export async function recomputeWallet(
  prisma: PrismaClient,
  accountId: string
): Promise<TipWalletWire> {
  const id = accountId.trim();
  const entries = await prisma.tipLedgerEntry.findMany({
    where: { accountId: id },
    select: { tips: true, bucket: true }
  });
  let granted = 0;
  let purchased = 0;
  for (const e of entries) {
    if (e.bucket === "purchased") purchased += e.tips;
    else granted += e.tips;
  }
  const row = await prisma.tipWallet.upsert({
    where: { accountId: id },
    create: { accountId: id, grantedBalance: granted, purchasedBalance: purchased },
    update: { grantedBalance: granted, purchasedBalance: purchased }
  });
  return wireWallet(row);
}
