/**
 * Checkout / portal helpers for `/tiers`, paywalls, and `/account` (EH-051).
 * Server-only — never treat client claims as entitlement truth.
 * EH-054 maps tiers to prices and adds duplicate-billing UX; these hooks are primitives.
 */

import type { BillingProvider } from "../adapters/types";
import { assertIndependentCheckoutAllowed } from "./policy";
import type {
  BillingCheckoutSession,
  BillingPortalSession,
  BillingResult
} from "./types";

export type StartCheckoutArgs = {
  billing: BillingProvider;
  priceId: string;
  siteId: string;
  successUrl: string;
  cancelUrl: string;
  authUserId?: string | null;
  customerId?: string | null;
  tierIds?: readonly string[];
  mode?: "hosted" | "embedded";
  /** Kit root for attestation file (tests). */
  kitDir?: string;
  /**
   * When true (default), EH-052 provider policy must allow Stripe.
   * Tests may set false only when exercising adapter isolation.
   */
  enforceProviderPolicy?: boolean;
};

export type StartPortalArgs = {
  billing: BillingProvider;
  customerId: string;
  returnUrl: string;
};

/**
 * Start independent Checkout for a mapped price.
 * EH-052 blocks Checkout when attestation routes away from Stripe.
 * EH-054 maps tiers and adds duplicate-billing UX.
 */
export async function startIndependentCheckout(
  args: StartCheckoutArgs
): Promise<BillingResult<BillingCheckoutSession>> {
  if (args.billing.implementation === "stub") {
    return {
      ok: false,
      reason:
        "billing_stub — set ESCAPE_HATCH_BILLING_PROVIDER=stripe with creator Stripe credentials (EH-051)"
    };
  }

  if (args.enforceProviderPolicy !== false) {
    const policy = assertIndependentCheckoutAllowed({
      siteId: args.siteId,
      kitDir: args.kitDir
    });
    if (!policy.ok) {
      return { ok: false, reason: policy.reason };
    }
  }

  return args.billing.createCheckoutSession({
    priceId: args.priceId,
    successUrl: args.successUrl,
    cancelUrl: args.cancelUrl,
    siteId: args.siteId,
    authUserId: args.authUserId,
    customerId: args.customerId,
    tierIds: args.tierIds,
    mode: args.mode ?? "hosted"
  });
}

/**
 * Open Customer Portal for subscription self-service (cancel / payment method).
 */
export async function startCustomerPortal(
  args: StartPortalArgs
): Promise<BillingResult<BillingPortalSession>> {
  if (args.billing.implementation === "stub") {
    return {
      ok: false,
      reason:
        "billing_stub — Customer Portal requires ESCAPE_HATCH_BILLING_PROVIDER=stripe (EH-051)"
    };
  }
  return args.billing.createCustomerPortalSession({
    customerId: args.customerId,
    returnUrl: args.returnUrl
  });
}
