/**
 * @fileoverview Stripe Checkout + Billing Portal for creator SaaS plans (MB-2).
 * @see docs/BILLING_SPINE_BUILD_PLAN.md
 */

import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import {
  resolveBillingConfig,
  type BillingServiceConfig,
  type ResolvedBillingConfig
} from "./config.js";
import {
  isCreatorPlanId,
  priceIdForCreatorPlan,
  priceIdForFanPlan,
  type CreatorPlanId,
  type PaidFanPlanId
} from "./plan-price-map.js";
import { getStripeClient } from "./stripe-client.js";
import { isFanPremiumEnabled } from "./fan-plan-config.js";

export type CreateCreatorCheckoutInput = {
  accountId: string;
  creatorId: string;
  plan: CreatorPlanId;
  /** Absolute success URL; falls back to portal return URL + ?checkout=success */
  successUrl?: string;
  cancelUrl?: string;
};

export type CreateCreatorCheckoutResult =
  | { ok: true; checkout_url: string; session_id: string }
  | { ok: false; error: string };

export type CreatePortalResult =
  | { ok: true; portal_url: string }
  | { ok: false; error: string };

async function ensureBillingCustomer(
  prisma: PrismaClient,
  stripe: Stripe,
  accountId: string
): Promise<{ stripeCustomerId: string }> {
  const existing = await prisma.billingCustomer.findUnique({
    where: { accountId }
  });
  if (existing) {
    return { stripeCustomerId: existing.stripeCustomerId };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { emailNorm: true, id: true }
  });

  const customer = await stripe.customers.create({
    email: account?.emailNorm ?? undefined,
    metadata: { relay_account_id: accountId }
  });

  await prisma.billingCustomer.create({
    data: {
      accountId,
      stripeCustomerId: customer.id,
      livemode: customer.livemode === true
    }
  });

  return { stripeCustomerId: customer.id };
}

function defaultReturnUrls(cfg: ResolvedBillingConfig): {
  success: string;
  cancel: string;
  portal: string;
} {
  const base =
    cfg.portalReturnUrl?.replace(/\/$/, "") ||
    "http://localhost:3000/studio/settings/billing";
  return {
    success: `${base}?checkout=success`,
    cancel: `${base}?checkout=cancel`,
    portal: base
  };
}

export async function createCreatorCheckoutSession(
  prisma: PrismaClient,
  input: CreateCreatorCheckoutInput,
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<CreateCreatorCheckoutResult> {
  const cfg = resolveBillingConfig(overrides, env, () => undefined);
  if (!cfg.enabled) {
    return { ok: false, error: "billing_disabled" };
  }
  if (!isCreatorPlanId(input.plan)) {
    return { ok: false, error: "invalid_plan" };
  }
  const priceId = priceIdForCreatorPlan(input.plan, cfg);
  if (!priceId) {
    return { ok: false, error: "price_not_configured" };
  }

  const stripe = await getStripeClient(overrides, env);
  if (!stripe) {
    return { ok: false, error: "billing_disabled" };
  }

  const { stripeCustomerId } = await ensureBillingCustomer(
    prisma,
    stripe,
    input.accountId
  );
  const urls = defaultReturnUrls(cfg);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl ?? urls.success,
    cancel_url: input.cancelUrl ?? urls.cancel,
    client_reference_id: input.accountId,
    metadata: {
      relay_account_id: input.accountId,
      relay_creator_id: input.creatorId,
      creator_plan: input.plan,
      scope: "creator"
    },
    subscription_data: {
      metadata: {
        relay_account_id: input.accountId,
        relay_creator_id: input.creatorId,
        creator_plan: input.plan,
        scope: "creator"
      }
    }
  });

  if (!session.url) {
    return { ok: false, error: "checkout_url_missing" };
  }
  return { ok: true, checkout_url: session.url, session_id: session.id };
}

export async function createPortalSession(
  prisma: PrismaClient,
  input: { accountId: string; returnUrl?: string },
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<CreatePortalResult> {
  const cfg = resolveBillingConfig(overrides, env, () => undefined);
  if (!cfg.enabled) {
    return { ok: false, error: "billing_disabled" };
  }
  const stripe = await getStripeClient(overrides, env);
  if (!stripe) {
    return { ok: false, error: "billing_disabled" };
  }

  const customer = await prisma.billingCustomer.findUnique({
    where: { accountId: input.accountId }
  });
  if (!customer) {
    return { ok: false, error: "no_billing_customer" };
  }

  const urls = defaultReturnUrls(cfg);
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: input.returnUrl ?? urls.portal
  });
  return { ok: true, portal_url: session.url };
}

function defaultFanReturnUrls(cfg: ResolvedBillingConfig): {
  success: string;
  cancel: string;
  portal: string;
} {
  const base =
    cfg.fanPortalReturnUrl?.replace(/\/$/, "") ||
    "http://localhost:3000/plans";
  return {
    success: `${base}?checkout=success`,
    cancel: `${base}?checkout=cancel`,
    portal: base
  };
}

export type CreateFanCheckoutInput = {
  accountId: string;
  plan: PaidFanPlanId;
  successUrl?: string;
  cancelUrl?: string;
};

export async function createFanCheckoutSession(
  prisma: PrismaClient,
  input: CreateFanCheckoutInput,
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<CreateCreatorCheckoutResult> {
  if (!isFanPremiumEnabled(env)) {
    return { ok: false, error: "fan_premium_disabled" };
  }
  const cfg = resolveBillingConfig(overrides, env, () => undefined);
  if (!cfg.enabled) {
    return { ok: false, error: "billing_disabled" };
  }
  const priceId = priceIdForFanPlan(input.plan, cfg);
  if (!priceId) {
    return { ok: false, error: "price_not_configured" };
  }

  const stripe = await getStripeClient(overrides, env);
  if (!stripe) {
    return { ok: false, error: "billing_disabled" };
  }

  const { stripeCustomerId } = await ensureBillingCustomer(
    prisma,
    stripe,
    input.accountId
  );
  const urls = defaultFanReturnUrls(cfg);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl ?? urls.success,
    cancel_url: input.cancelUrl ?? urls.cancel,
    client_reference_id: input.accountId,
    metadata: {
      relay_account_id: input.accountId,
      fan_plan: input.plan,
      scope: "fan"
    },
    subscription_data: {
      metadata: {
        relay_account_id: input.accountId,
        fan_plan: input.plan,
        scope: "fan"
      }
    }
  });

  if (!session.url) {
    return { ok: false, error: "checkout_url_missing" };
  }
  return { ok: true, checkout_url: session.url, session_id: session.id };
}

export type CreateReloadPackCheckoutInput = {
  accountId: string;
  successUrl?: string;
  cancelUrl?: string;
};

export async function createReloadPackCheckoutSession(
  prisma: PrismaClient,
  input: CreateReloadPackCheckoutInput,
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<CreateCreatorCheckoutResult> {
  if (!isFanPremiumEnabled(env)) {
    return { ok: false, error: "fan_premium_disabled" };
  }
  const cfg = resolveBillingConfig(overrides, env, () => undefined);
  if (!cfg.enabled) {
    return { ok: false, error: "billing_disabled" };
  }
  const priceId = cfg.priceReloadPack;
  if (!priceId) {
    return { ok: false, error: "price_not_configured" };
  }

  const stripe = await getStripeClient(overrides, env);
  if (!stripe) {
    return { ok: false, error: "billing_disabled" };
  }

  const { stripeCustomerId } = await ensureBillingCustomer(
    prisma,
    stripe,
    input.accountId
  );
  const urls = defaultFanReturnUrls(cfg);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl ?? urls.success,
    cancel_url: input.cancelUrl ?? urls.cancel,
    client_reference_id: input.accountId,
    metadata: {
      relay_account_id: input.accountId,
      reload_pack: "1",
      scope: "fan"
    }
  });

  if (!session.url) {
    return { ok: false, error: "checkout_url_missing" };
  }
  return { ok: true, checkout_url: session.url, session_id: session.id };
}
