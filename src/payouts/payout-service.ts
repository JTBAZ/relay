/**
 * @fileoverview Artist-initiated Connect cash payouts (MB-12).
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import { ArtistLedgerEntryKind, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { payoutThresholdCents } from "../billing/artist-payout-config.js";
import { isFanPremiumEnabled } from "../billing/fan-plan-config.js";
import { getStripeClient } from "../billing/stripe-client.js";
import type { BillingServiceConfig } from "../billing/config.js";
import { appendArtistLedgerEntry } from "../ledger/artist-ledger-service.js";

export type RequestPayoutResult =
  | { ok: true; payout_id: string; amount_cents: number }
  | {
      ok: false;
      error: "below_threshold" | "payouts_not_enabled" | "balance_not_positive" | "fan_premium_disabled" | "billing_disabled" | "transfer_failed";
    };

export async function requestPayout(
  prisma: PrismaClient,
  args: { creatorId: string },
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<RequestPayoutResult> {
  if (!isFanPremiumEnabled(env)) {
    return { ok: false, error: "fan_premium_disabled" };
  }
  const creatorId = args.creatorId.trim();
  const threshold = payoutThresholdCents(env);

  const payoutAccount = await prisma.payoutAccount.findUnique({
    where: { creatorId }
  });
  if (!payoutAccount?.payoutsEnabled) {
    return { ok: false, error: "payouts_not_enabled" };
  }

  const balance = await prisma.artistBalance.findUnique({ where: { creatorId } });
  const available = balance?.availableCents ?? 0;
  if (available <= 0) {
    return { ok: false, error: "balance_not_positive" };
  }
  if (available < threshold) {
    return { ok: false, error: "below_threshold" };
  }

  const stripe = await getStripeClient(overrides, env);
  if (!stripe) {
    return { ok: false, error: "billing_disabled" };
  }

  const amountCents = available;
  const payout = await prisma.artistPayout.create({
    data: {
      creatorId,
      amountCents,
      status: "requested"
    }
  });

  await appendArtistLedgerEntry(prisma, {
    creatorId,
    entryKind: ArtistLedgerEntryKind.payout,
    amountCents: -amountCents,
    payoutId: payout.id,
    idempotencyKey: `payout:${payout.id}`
  });

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination: payoutAccount.stripeConnectAccountId,
        metadata: {
          relay_creator_id: creatorId,
          artist_payout_id: payout.id
        }
      },
      { idempotencyKey: `transfer:payout:${payout.id}` }
    );
    await prisma.artistPayout.update({
      where: { id: payout.id },
      data: { status: "in_transit", stripeTransferId: transfer.id }
    });
    return { ok: true, payout_id: payout.id, amount_cents: amountCents };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await appendArtistLedgerEntry(prisma, {
      creatorId,
      entryKind: ArtistLedgerEntryKind.adjust,
      amountCents,
      payoutId: payout.id,
      idempotencyKey: `payout_restore:${payout.id}`,
      stripeRef: `transfer_failed:${payout.id}`
    });
    await prisma.artistPayout.update({
      where: { id: payout.id },
      data: { status: "failed", failureReason: reason.slice(0, 500) }
    });
    return { ok: false, error: "transfer_failed" };
  }
}

export async function markPayoutSettled(
  prisma: PrismaClient,
  stripeTransferId: string
): Promise<void> {
  const row = await prisma.artistPayout.findFirst({
    where: { stripeTransferId }
  });
  if (!row || row.status === "settled") return;
  await prisma.artistPayout.update({
    where: { id: row.id },
    data: { status: "settled", settledAt: new Date() }
  });
}

export async function markPayoutFailedFromTransfer(
  prisma: PrismaClient,
  stripeTransferId: string,
  failureReason: string
): Promise<void> {
  const row = await prisma.artistPayout.findFirst({
    where: { stripeTransferId }
  });
  if (!row || row.status === "failed" || row.status === "settled") return;

  await appendArtistLedgerEntry(prisma, {
    creatorId: row.creatorId,
    entryKind: ArtistLedgerEntryKind.adjust,
    amountCents: row.amountCents,
    payoutId: row.id,
    idempotencyKey: `payout_restore_wh:${row.id}`,
    stripeRef: stripeTransferId
  });
  await prisma.artistPayout.update({
    where: { id: row.id },
    data: {
      status: "failed",
      failureReason: failureReason.slice(0, 500)
    }
  });
}

export async function listCreatorPayouts(
  prisma: PrismaClient,
  creatorId: string
): Promise<
  Array<{
    payout_id: string;
    amount_cents: number;
    status: string;
    requested_at: string;
    settled_at: string | null;
    failure_reason: string | null;
  }>
> {
  const rows = await prisma.artistPayout.findMany({
    where: { creatorId: creatorId.trim() },
    orderBy: { requestedAt: "desc" },
    take: 50
  });
  return rows.map((r) => ({
    payout_id: r.id,
    amount_cents: r.amountCents,
    status: r.status,
    requested_at: r.requestedAt.toISOString(),
    settled_at: r.settledAt?.toISOString() ?? null,
    failure_reason: r.failureReason
  }));
}

export type { Stripe };
