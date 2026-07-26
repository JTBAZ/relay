/**
 * @fileoverview Artist Tip earnings → Stripe invoice bill-credit waterfall (MB-11).
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 *
 * Order of operations (frozen): Stripe customer-balance credit MUST succeed before
 * writing ArtistLedgerEntry(bill_credit). Never write the ledger row without stripeRef.
 */

import {
  ArtistLedgerEntryKind,
  SubscriptionStatus,
  type PrismaClient
} from "@prisma/client";
import type Stripe from "stripe";
import { isFanPremiumEnabled } from "../billing/fan-plan-config.js";
import { tipPeriodKeyUtc } from "../tips/config.js";
import { appendArtistLedgerEntry } from "./artist-ledger-service.js";

export type SettleCreatorResult =
  | {
      status: "credited";
      creator_id: string;
      credit_cents: number;
      stripe_ref: string;
      period_key: string;
      idempotent: boolean;
    }
  | {
      status: "skipped";
      creator_id: string;
      reason:
        | "fan_premium_disabled"
        | "no_plan"
        | "balance_not_positive"
        | "no_billing_customer"
        | "no_upcoming_invoice"
        | "invoice_zero"
        | "stripe_unavailable";
    };

export type SettleCreatorDeps = {
  prisma: PrismaClient;
  /** Injected Stripe client (tests) or null when billing off. */
  stripe: Stripe | null;
  env?: NodeJS.ProcessEnv;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
  /** Override "now" for period key / sweep tests. */
  now?: Date;
};

function periodKeyForSubscription(currentPeriodEnd: Date, now: Date): string {
  return tipPeriodKeyUtc(
    currentPeriodEnd.getTime() <= now.getTime() ? currentPeriodEnd : now
  );
}

/**
 * Settle one creator: min(available, upcoming invoice) as Stripe customer balance credit.
 */
export async function settleCreatorOnce(
  deps: SettleCreatorDeps,
  creatorId: string
): Promise<SettleCreatorResult> {
  const id = creatorId.trim();
  const env = deps.env ?? process.env;
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? new Date();

  if (!isFanPremiumEnabled(env)) {
    return { status: "skipped", creator_id: id, reason: "fan_premium_disabled" };
  }

  const account = await deps.prisma.account.findFirst({
    where: { primaryRelayCreatorId: id },
    select: { id: true }
  });
  if (!account) {
    return { status: "skipped", creator_id: id, reason: "no_plan" };
  }

  const sub = await deps.prisma.planSubscription.findFirst({
    where: {
      accountId: account.id,
      scope: "creator",
      status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] }
    },
    orderBy: { updatedAt: "desc" }
  });
  if (!sub) {
    return { status: "skipped", creator_id: id, reason: "no_plan" };
  }

  const balance = await deps.prisma.artistBalance.findUnique({
    where: { creatorId: id }
  });
  const available = balance?.availableCents ?? 0;
  if (available <= 0) {
    return { status: "skipped", creator_id: id, reason: "balance_not_positive" };
  }

  const billingCustomer = await deps.prisma.billingCustomer.findUnique({
    where: { accountId: account.id }
  });
  if (!billingCustomer?.stripeCustomerId) {
    return { status: "skipped", creator_id: id, reason: "no_billing_customer" };
  }

  if (!deps.stripe) {
    log("settlement: stripe unavailable — no ledger write", { creatorId: id });
    return { status: "skipped", creator_id: id, reason: "stripe_unavailable" };
  }

  const periodKey = periodKeyForSubscription(sub.currentPeriodEnd, now);
  const idempotencyKey = `bill_credit:${id}:${periodKey}`;

  const existing = await deps.prisma.artistLedgerEntry.findUnique({
    where: { idempotencyKey }
  });
  if (existing) {
    return {
      status: "credited",
      creator_id: id,
      credit_cents: Math.abs(existing.amountCents),
      stripe_ref: existing.stripeRef ?? "",
      period_key: periodKey,
      idempotent: true
    };
  }

  let upcoming: { amount_due?: number | null };
  try {
    const invoicesApi = deps.stripe.invoices as {
      retrieveUpcoming?: (params: { customer: string }) => Promise<{ amount_due?: number | null }>;
      createPreview?: (params: { customer: string }) => Promise<{ amount_due?: number | null }>;
    };
    if (typeof invoicesApi.retrieveUpcoming === "function") {
      upcoming = await invoicesApi.retrieveUpcoming({
        customer: billingCustomer.stripeCustomerId
      });
    } else if (typeof invoicesApi.createPreview === "function") {
      upcoming = await invoicesApi.createPreview({
        customer: billingCustomer.stripeCustomerId
      });
    } else {
      return { status: "skipped", creator_id: id, reason: "stripe_unavailable" };
    }
  } catch (err) {
    log("settlement: upcoming invoice failed", {
      creatorId: id,
      error: err instanceof Error ? err.message : String(err)
    });
    return { status: "skipped", creator_id: id, reason: "no_upcoming_invoice" };
  }

  const invoiceAmount = Math.max(0, upcoming.amount_due ?? 0);
  if (invoiceAmount <= 0) {
    return { status: "skipped", creator_id: id, reason: "invoice_zero" };
  }

  const credit = Math.min(available, invoiceAmount);
  if (credit <= 0) {
    return { status: "skipped", creator_id: id, reason: "invoice_zero" };
  }

  let balanceTxn: Stripe.CustomerBalanceTransaction;
  try {
    balanceTxn = await deps.stripe.customers.createBalanceTransaction(
      billingCustomer.stripeCustomerId,
      {
        amount: -credit,
        currency: "usd",
        description: `Relay Tip earnings bill credit (${periodKey})`,
        metadata: {
          relay_creator_id: id,
          period_key: periodKey,
          settlement: "bill_credit"
        }
      },
      { idempotencyKey }
    );
  } catch (err) {
    log("settlement: createBalanceTransaction failed — no ledger write", {
      creatorId: id,
      credit,
      error: err instanceof Error ? err.message : String(err)
    });
    return { status: "skipped", creator_id: id, reason: "stripe_unavailable" };
  }

  const result = await appendArtistLedgerEntry(deps.prisma, {
    creatorId: id,
    entryKind: ArtistLedgerEntryKind.bill_credit,
    amountCents: -credit,
    idempotencyKey,
    stripeRef: balanceTxn.id
  });

  return {
    status: "credited",
    creator_id: id,
    credit_cents: credit,
    stripe_ref: balanceTxn.id,
    period_key: periodKey,
    idempotent: result.idempotent
  };
}

export type SettlementCycleResult = {
  cycle_started_at: string;
  creators_scanned: number;
  credited: number;
  skipped: number;
  results: SettleCreatorResult[];
};

/**
 * Daily sweep: creator-scope subs whose billing anchor is due (±1 day window).
 */
export async function runSettlementOnce(
  deps: Omit<SettleCreatorDeps, "now"> & { now?: Date; creatorId?: string }
): Promise<SettlementCycleResult> {
  const now = deps.now ?? new Date();
  const log = deps.log ?? (() => undefined);
  const env = deps.env ?? process.env;

  if (!isFanPremiumEnabled(env)) {
    return {
      cycle_started_at: now.toISOString(),
      creators_scanned: 0,
      credited: 0,
      skipped: 0,
      results: []
    };
  }

  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let creatorIds: string[] = [];

  if (deps.creatorId?.trim()) {
    creatorIds = [deps.creatorId.trim()];
  } else {
    const subs = await deps.prisma.planSubscription.findMany({
      where: {
        scope: "creator",
        status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] },
        currentPeriodEnd: { gte: windowStart, lte: windowEnd }
      },
      select: { accountId: true },
      take: 2000
    });
    const accountIds = [...new Set(subs.map((s) => s.accountId))];
    if (accountIds.length > 0) {
      const accounts = await deps.prisma.account.findMany({
        where: { id: { in: accountIds }, primaryRelayCreatorId: { not: null } },
        select: { primaryRelayCreatorId: true }
      });
      const seen = new Set<string>();
      for (const a of accounts) {
        const cid = a.primaryRelayCreatorId?.trim();
        if (cid && !seen.has(cid)) {
          seen.add(cid);
          creatorIds.push(cid);
        }
      }
    }
  }

  const results: SettleCreatorResult[] = [];
  let credited = 0;
  let skipped = 0;

  for (const creatorId of creatorIds) {
    try {
      const result = await settleCreatorOnce(
        { ...deps, now, env, log },
        creatorId
      );
      results.push(result);
      if (result.status === "credited" && !result.idempotent) credited += 1;
      else skipped += 1;
    } catch (err) {
      log("settlement: creator failed", {
        creatorId,
        error: err instanceof Error ? err.message : String(err)
      });
      skipped += 1;
    }
  }

  return {
    cycle_started_at: now.toISOString(),
    creators_scanned: creatorIds.length,
    credited,
    skipped,
    results
  };
}

export const DEFAULT_SETTLEMENT_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MIN_SETTLEMENT_INTERVAL_MS = 60_000;

export function settlementRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  if (!isFanPremiumEnabled(env)) return null;
  const raw = env.RELAY_SETTLEMENT_INTERVAL_MS?.trim();
  if (raw === "0" || raw === "off") return null;
  if (!raw) return DEFAULT_SETTLEMENT_INTERVAL_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_SETTLEMENT_INTERVAL_MS) {
    return DEFAULT_SETTLEMENT_INTERVAL_MS;
  }
  return n;
}
