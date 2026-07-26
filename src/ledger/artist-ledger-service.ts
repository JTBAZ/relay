/**
 * @fileoverview Artist earnings ledger — sole writer for ArtistLedgerEntry + ArtistBalance.
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md (MB-10)
 */

import {
  ArtistLedgerEntryKind,
  PlatformRevenueEventKind,
  PlatformRevenueSourceLabel,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { tipArtistPayoutCents } from "../billing/artist-payout-config.js";

export type ArtistBalanceWire = {
  creator_id: string;
  available_cents: number;
  lifetime_cents: number;
};

export type ArtistLedgerMutationResult = {
  balance: ArtistBalanceWire;
  entry: {
    id: string;
    entry_kind: ArtistLedgerEntryKind;
    amount_cents: number;
  };
  idempotent: boolean;
};

type Tx = Prisma.TransactionClient;

async function ensureBalance(tx: Tx, creatorId: string): Promise<{
  creatorId: string;
  availableCents: number;
  lifetimeCents: number;
}> {
  return tx.artistBalance.upsert({
    where: { creatorId },
    create: { creatorId, availableCents: 0, lifetimeCents: 0 },
    update: {}
  });
}

function wireBalance(row: {
  creatorId: string;
  availableCents: number;
  lifetimeCents: number;
}): ArtistBalanceWire {
  return {
    creator_id: row.creatorId,
    available_cents: row.availableCents,
    lifetime_cents: row.lifetimeCents
  };
}

async function findByIdempotency(
  tx: Tx,
  idempotencyKey: string
): Promise<ArtistLedgerMutationResult | null> {
  const existing = await tx.artistLedgerEntry.findUnique({
    where: { idempotencyKey }
  });
  if (!existing) return null;
  const balance = await ensureBalance(tx, existing.creatorId);
  return {
    balance: wireBalance(balance),
    entry: {
      id: existing.id,
      entry_kind: existing.entryKind,
      amount_cents: existing.amountCents
    },
    idempotent: true
  };
}

function revenueKindFor(
  entryKind: ArtistLedgerEntryKind
): PlatformRevenueEventKind {
  switch (entryKind) {
    case ArtistLedgerEntryKind.bill_credit:
      return PlatformRevenueEventKind.bill_credit_applied;
    case ArtistLedgerEntryKind.payout:
      return PlatformRevenueEventKind.payout_requested;
    case ArtistLedgerEntryKind.tip_earned:
    case ArtistLedgerEntryKind.clawback:
    case ArtistLedgerEntryKind.adjust:
    default:
      return PlatformRevenueEventKind.tip_spend;
  }
}

/**
 * Append an artist ledger entry and update the balance cache in one transaction.
 * Pass `tx` to compose inside a larger transaction (e.g. reveal + spend + earn).
 */
export async function appendArtistLedgerEntry(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    entryKind: ArtistLedgerEntryKind;
    amountCents: number;
    idempotencyKey: string;
    revealId?: string | null;
    payoutId?: string | null;
    stripeRef?: string | null;
  },
  txClient?: Tx
): Promise<ArtistLedgerMutationResult> {
  const creatorId = args.creatorId.trim();
  const amountCents = Math.trunc(args.amountCents);
  if (!creatorId || !args.idempotencyKey.trim()) {
    throw new Error("appendArtistLedgerEntry requires creatorId and idempotencyKey");
  }

  const run = async (tx: Tx): Promise<ArtistLedgerMutationResult> => {
    const prior = await findByIdempotency(tx, args.idempotencyKey);
    if (prior) return prior;

    const balance = await ensureBalance(tx, creatorId);
    const nextAvailable = balance.availableCents + amountCents;
    const nextLifetime =
      amountCents > 0
        ? balance.lifetimeCents + amountCents
        : balance.lifetimeCents;

    const entry = await tx.artistLedgerEntry.create({
      data: {
        creatorId,
        entryKind: args.entryKind,
        amountCents,
        revealId: args.revealId ?? null,
        payoutId: args.payoutId ?? null,
        stripeRef: args.stripeRef ?? null,
        idempotencyKey: args.idempotencyKey
      }
    });

    const updated = await tx.artistBalance.update({
      where: { creatorId },
      data: {
        availableCents: nextAvailable,
        lifetimeCents: nextLifetime
      }
    });

    await tx.platformRevenueEvent.create({
      data: {
        eventKind: revenueKindFor(args.entryKind),
        sourceLabel: PlatformRevenueSourceLabel.relay_native,
        provider: "fan_premium",
        occurredAt: new Date(),
        creatorId,
        amountCents: Math.abs(amountCents),
        payload: {
          artist_entry_kind: args.entryKind,
          reveal_id: args.revealId ?? null,
          payout_id: args.payoutId ?? null,
          stripe_ref: args.stripeRef ?? null,
          available_cents: nextAvailable,
          lifetime_cents: nextLifetime
        }
      }
    });

    return {
      balance: wireBalance(updated),
      entry: {
        id: entry.id,
        entry_kind: entry.entryKind,
        amount_cents: entry.amountCents
      },
      idempotent: false
    };
  };

  if (txClient) return run(txClient);
  return prisma.$transaction(run);
}

/** Credit artist for one Tip spent on a reveal (atlas $0.33 default). */
export async function recordTipEarned(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    revealId: string;
    amountCents?: number;
    env?: NodeJS.ProcessEnv;
  },
  txClient?: Tx
): Promise<ArtistLedgerMutationResult> {
  const cents = args.amountCents ?? tipArtistPayoutCents(args.env);
  return appendArtistLedgerEntry(
    prisma,
    {
      creatorId: args.creatorId,
      entryKind: ArtistLedgerEntryKind.tip_earned,
      amountCents: cents,
      revealId: args.revealId,
      idempotencyKey: `tip_earned:${args.revealId}`
    },
    txClient
  );
}

/** Recompute available + lifetime from the append-only ledger (oracle). */
export async function recomputeArtistBalance(
  prisma: PrismaClient,
  creatorId: string
): Promise<ArtistBalanceWire> {
  const id = creatorId.trim();
  const entries = await prisma.artistLedgerEntry.findMany({
    where: { creatorId: id },
    select: { amountCents: true, entryKind: true }
  });
  let available = 0;
  let lifetime = 0;
  for (const e of entries) {
    available += e.amountCents;
    if (e.amountCents > 0 && e.entryKind === ArtistLedgerEntryKind.tip_earned) {
      lifetime += e.amountCents;
    } else if (e.amountCents > 0 && e.entryKind === ArtistLedgerEntryKind.adjust) {
      lifetime += e.amountCents;
    }
  }
  const updated = await prisma.artistBalance.upsert({
    where: { creatorId: id },
    create: { creatorId: id, availableCents: available, lifetimeCents: lifetime },
    update: { availableCents: available, lifetimeCents: lifetime }
  });
  return wireBalance(updated);
}

export async function getArtistBalance(
  prisma: PrismaClient,
  creatorId: string
): Promise<ArtistBalanceWire> {
  const id = creatorId.trim();
  const row = await prisma.artistBalance.upsert({
    where: { creatorId: id },
    create: { creatorId: id, availableCents: 0, lifetimeCents: 0 },
    update: {}
  });
  return wireBalance(row);
}

export type CreatorEarningsWire = {
  available_cents: number;
  lifetime_cents: number;
  this_month: { tips: number; earned_cents: number };
  bill_credits: Array<{
    id: string;
    amount_cents: number;
    stripe_ref: string | null;
    created_at: string;
  }>;
  entries: Array<{
    id: string;
    entry_kind: ArtistLedgerEntryKind;
    amount_cents: number;
    reveal_id: string | null;
    created_at: string;
  }>;
};

export async function getCreatorEarningsWire(
  prisma: PrismaClient,
  creatorId: string,
  options: { now?: Date; entryLimit?: number } = {}
): Promise<CreatorEarningsWire> {
  const id = creatorId.trim();
  const now = options.now ?? new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const balance = await prisma.artistBalance.findUnique({ where: { creatorId: id } });
  const available = balance?.availableCents ?? 0;
  const lifetime = balance?.lifetimeCents ?? 0;

  const thisMonthEarned = await prisma.artistLedgerEntry.findMany({
    where: {
      creatorId: id,
      entryKind: ArtistLedgerEntryKind.tip_earned,
      createdAt: { gte: monthStart }
    },
    select: { amountCents: true }
  });
  const earnedCents = thisMonthEarned.reduce((s, e) => s + e.amountCents, 0);
  const tips = thisMonthEarned.length;

  const billCredits = await prisma.artistLedgerEntry.findMany({
    where: { creatorId: id, entryKind: ArtistLedgerEntryKind.bill_credit },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  const entries = await prisma.artistLedgerEntry.findMany({
    where: { creatorId: id },
    orderBy: { createdAt: "desc" },
    take: options.entryLimit ?? 50
  });

  return {
    available_cents: available,
    lifetime_cents: lifetime,
    this_month: { tips, earned_cents: earnedCents },
    bill_credits: billCredits.map((b) => ({
      id: b.id,
      amount_cents: b.amountCents,
      stripe_ref: b.stripeRef,
      created_at: b.createdAt.toISOString()
    })),
    entries: entries.map((e) => ({
      id: e.id,
      entry_kind: e.entryKind,
      amount_cents: e.amountCents,
      reveal_id: e.revealId,
      created_at: e.createdAt.toISOString()
    }))
  };
}
