/**
 * @fileoverview Stripe Connect Express onboarding for artist cash payouts (MB-12).
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { isFanPremiumEnabled } from "../billing/fan-plan-config.js";
import {
  resolveBillingConfig,
  type BillingServiceConfig
} from "../billing/config.js";
import { getStripeClient } from "../billing/stripe-client.js";

export type ConnectOnboardResult =
  | { ok: true; onboarding_url: string; payout_account_id: string }
  | {
      ok: false;
      error:
        | "fan_premium_disabled"
        | "billing_disabled"
        | "account_missing"
        | "onboarding_url_missing";
    };

function defaultConnectReturnUrls(env: NodeJS.ProcessEnv): {
  returnUrl: string;
  refreshUrl: string;
} {
  const base =
    env.RELAY_CONNECT_RETURN_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000/studio/earnings";
  return {
    returnUrl: `${base}?connect=return`,
    refreshUrl: `${base}?connect=refresh`
  };
}

export async function startConnectOnboarding(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    email?: string | null;
    country?: string;
  },
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<ConnectOnboardResult> {
  if (!isFanPremiumEnabled(env)) {
    return { ok: false, error: "fan_premium_disabled" };
  }
  const cfg = resolveBillingConfig(overrides, env, () => undefined);
  if (!cfg.enabled) {
    return { ok: false, error: "billing_disabled" };
  }
  const stripe = await getStripeClient(overrides, env);
  if (!stripe) {
    return { ok: false, error: "billing_disabled" };
  }

  const creatorId = args.creatorId.trim();
  const account = await prisma.account.findFirst({
    where: { primaryRelayCreatorId: creatorId },
    select: { id: true, emailNorm: true }
  });
  if (!account) {
    return { ok: false, error: "account_missing" };
  }

  let payout = await prisma.payoutAccount.findUnique({ where: { creatorId } });
  if (!payout) {
    const created = await stripe.accounts.create({
      type: "express",
      country: (args.country ?? "US").toUpperCase(),
      email: args.email?.trim() || account.emailNorm || undefined,
      capabilities: { transfers: { requested: true } },
      metadata: { relay_creator_id: creatorId }
    });
    payout = await prisma.payoutAccount.create({
      data: {
        creatorId,
        stripeConnectAccountId: created.id,
        onboardingStatus: "pending",
        payoutsEnabled: false
      }
    });
  }

  const urls = defaultConnectReturnUrls(env);
  const link = await stripe.accountLinks.create({
    account: payout.stripeConnectAccountId,
    refresh_url: urls.refreshUrl,
    return_url: urls.returnUrl,
    type: "account_onboarding"
  });
  if (!link.url) {
    return { ok: false, error: "onboarding_url_missing" };
  }
  return {
    ok: true,
    onboarding_url: link.url,
    payout_account_id: payout.creatorId
  };
}

/** Sync PayoutAccount from Stripe account.updated webhook. */
export async function syncPayoutAccountFromStripe(
  prisma: PrismaClient,
  stripeAccount: Stripe.Account
): Promise<void> {
  const connectId = stripeAccount.id;
  const existing = await prisma.payoutAccount.findFirst({
    where: { stripeConnectAccountId: connectId }
  });
  if (!existing) return;

  const payoutsEnabled = stripeAccount.payouts_enabled === true;
  const detailsSubmitted = stripeAccount.details_submitted === true;
  let onboardingStatus = existing.onboardingStatus;
  if (payoutsEnabled && detailsSubmitted) onboardingStatus = "complete";
  else if (stripeAccount.requirements?.disabled_reason) onboardingStatus = "restricted";
  else if (!detailsSubmitted) onboardingStatus = "pending";

  await prisma.payoutAccount.update({
    where: { creatorId: existing.creatorId },
    data: { payoutsEnabled, onboardingStatus }
  });
}
