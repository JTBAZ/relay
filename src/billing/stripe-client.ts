/**
 * @fileoverview Lazy Stripe client for Relay SaaS billing (MB-1).
 * @see docs/BILLING_SPINE_BUILD_PLAN.md
 *
 * Stripe is loaded via dynamic import so a disabled billing switch never
 * executes the Stripe package at API boot.
 */

import type Stripe from "stripe";
import {
  resolveBillingConfig,
  type BillingServiceConfig,
  type ResolvedBillingConfig
} from "./config.js";

type StripeCtor = typeof import("stripe").default;

let stripeModulePromise: Promise<StripeCtor> | null = null;
let stripeSingleton: Stripe | null = null;
let stripeSingletonKey: string | null = null;

async function loadStripeCtor(): Promise<StripeCtor> {
  if (!stripeModulePromise) {
    stripeModulePromise = import("stripe").then((m) => m.default);
  }
  return stripeModulePromise;
}

/**
 * Returns a Stripe client when billing is enabled; otherwise null.
 * Never throws for missing config — callers treat null as "billing off".
 */
export async function getStripeClient(
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<Stripe | null> {
  const cfg = resolveBillingConfig(overrides, env, () => undefined);
  if (!cfg.enabled || !cfg.secretKey) return null;

  if (stripeSingleton && stripeSingletonKey === cfg.secretKey) {
    return stripeSingleton;
  }

  const StripeCtor = await loadStripeCtor();
  stripeSingleton = new StripeCtor(cfg.secretKey, {
    typescript: true
  });
  stripeSingletonKey = cfg.secretKey;
  return stripeSingleton;
}

/** Sync-friendly config peek (no Stripe import). */
export function peekBillingConfig(
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedBillingConfig {
  return resolveBillingConfig(overrides, env, () => undefined);
}

/** Test helper — drop the lazy singleton. */
export function resetStripeClientForTests(): void {
  stripeSingleton = null;
  stripeSingletonKey = null;
  stripeModulePromise = null;
}

/**
 * Verify a Stripe webhook signature and parse the event.
 * Throws Stripe signature errors on failure (caller maps to HTTP 400).
 */
export async function constructStripeWebhookEvent(
  rawBody: Buffer | string,
  signatureHeader: string | string[] | undefined,
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<Stripe.Event> {
  const cfg = resolveBillingConfig(overrides, env, () => undefined);
  if (!cfg.enabled || !cfg.webhookSecret) {
    throw new Error("billing_disabled");
  }
  const sig = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!sig || typeof sig !== "string") {
    throw new Error("missing_stripe_signature");
  }
  const StripeCtor = await loadStripeCtor();
  return StripeCtor.webhooks.constructEvent(rawBody, sig, cfg.webhookSecret);
}

/** Test helper — generate a signed Stripe webhook header for unit tests. */
export async function generateStripeTestWebhookHeader(
  payload: string,
  secret: string
): Promise<string> {
  const StripeCtor = await loadStripeCtor();
  return StripeCtor.webhooks.generateTestHeaderString({ payload, secret });
}
