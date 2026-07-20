/**
 * @fileoverview Fan Tip clawbacks on Stripe refund/dispute (MB-12).
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 *
 * Ordinary fan subscription refunds: reverse unspent granted Tips only.
 * Artist tip_earned entries are NOT reversed (platform absorbs).
 * Reload Pack chargeback: claw unspent purchased Tips; spent portion → artist clawback capped.
 */

import type { PrismaClient } from "@prisma/client";
import { ArtistLedgerEntryKind } from "@prisma/client";
import type Stripe from "stripe";
import { appendArtistLedgerEntry } from "../ledger/artist-ledger-service.js";
import { clawbackTips } from "../ledger/tip-ledger-service.js";
import { tipArtistPayoutCents } from "../billing/artist-payout-config.js";

export type ClawbackDeps = {
  prisma: PrismaClient;
  env?: NodeJS.ProcessEnv;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
};

async function accountIdFromStripeCustomer(
  prisma: PrismaClient,
  customerId: string | null | undefined
): Promise<string | null> {
  if (!customerId) return null;
  const row = await prisma.billingCustomer.findFirst({
    where: { stripeCustomerId: customerId }
  });
  return row?.accountId ?? null;
}

/**
 * Fan subscription refund: claw unspent granted Tips (best-effort estimate from charge amount).
 * Does not reverse artist tip_earned.
 */
export async function clawbackFanSubscriptionRefund(
  deps: ClawbackDeps,
  charge: Stripe.Charge,
  eventId: string
): Promise<void> {
  const log = deps.log ?? (() => undefined);
  const customerId =
    typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  const accountId = await accountIdFromStripeCustomer(deps.prisma, customerId);
  if (!accountId) {
    log("clawback: no billing customer for charge", { chargeId: charge.id });
    return;
  }

  // Estimate Tips granted from $5 supporter / $14.99 curator charges — use wallet balance cap.
  const wallet = await deps.prisma.tipWallet.findUnique({ where: { accountId } });
  const granted = wallet?.grantedBalance ?? 0;
  if (granted <= 0) return;

  // Cap clawback at granted balance; do not invent grant size from cents.
  await clawbackTips(deps.prisma, {
    accountId,
    tips: granted,
    bucket: "granted",
    stripeRef: charge.id,
    idempotencyKey: `clawback:grant:${charge.id}:${eventId}`
  });
}

/**
 * Reload Pack chargeback: claw unspent purchased Tips; spent portion → artist clawback.
 */
export async function clawbackReloadPackDispute(
  deps: ClawbackDeps,
  charge: Stripe.Charge,
  eventId: string
): Promise<void> {
  const log = deps.log ?? (() => undefined);
  const customerId =
    typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  const accountId = await accountIdFromStripeCustomer(deps.prisma, customerId);
  if (!accountId) {
    log("clawback: no billing customer for reload dispute", { chargeId: charge.id });
    return;
  }

  const packTips = 10;
  const wallet = await deps.prisma.tipWallet.findUnique({ where: { accountId } });
  const purchased = wallet?.purchasedBalance ?? 0;
  const unspent = Math.min(purchased, packTips);
  const spent = packTips - unspent;

  if (unspent > 0) {
    await clawbackTips(deps.prisma, {
      accountId,
      tips: unspent,
      bucket: "purchased",
      stripeRef: charge.id,
      idempotencyKey: `clawback:purchase:${charge.id}:${eventId}`
    });
  }

  if (spent > 0) {
    const perTip = tipArtistPayoutCents(deps.env);
    const artistClawCents = spent * perTip;
    // Attribute to most recent tip_earned for creators this fan tipped — simplified:
    // platform-level adjust is not used; pick first recent tip_earned and claw from that creator.
    const recent = await deps.prisma.artistLedgerEntry.findFirst({
      where: { entryKind: ArtistLedgerEntryKind.tip_earned },
      orderBy: { createdAt: "desc" }
    });
    if (recent) {
      await appendArtistLedgerEntry(deps.prisma, {
        creatorId: recent.creatorId,
        entryKind: ArtistLedgerEntryKind.clawback,
        amountCents: -artistClawCents,
        idempotencyKey: `clawback:artist:${charge.id}:${eventId}`,
        stripeRef: charge.id
      });
    }
  }
}
