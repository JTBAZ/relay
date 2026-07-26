/**
 * Checkout / portal helpers for `/tiers`, paywalls, and `/account` (EH-051 / EH-054).
 * Server-only — never treat client claims as entitlement truth.
 */

import type { BillingProvider } from "../adapters/types";
import type { CloneTierRule } from "../contracts";
import {
  assertNoDuplicateBilling,
  type ConversionSubject
} from "./conversion";
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
  /** Kit root for attestation / map files (tests). */
  kitDir?: string;
  /**
   * When true (default), EH-052/053 provider policy must allow this provider.
   * Tests may set false only when exercising adapter isolation.
   */
  enforceProviderPolicy?: boolean;
  /**
   * EH-054 duplicate-billing guard. When tier + subject provided, block
   * Checkout if equivalent access already exists.
   */
  duplicateGuard?: {
    tier: CloneTierRule;
    catalog: readonly CloneTierRule[];
    subject: ConversionSubject;
  };
};

export type StartPortalArgs = {
  billing: BillingProvider;
  customerId: string;
  returnUrl: string;
};

/**
 * Start independent Checkout for a mapped price.
 * EH-052/053 blocks Checkout unless attestation offers this provider's recipe.
 * EH-054 adds duplicate-billing safeguards when guard context is supplied.
 */
export async function startIndependentCheckout(
  args: StartCheckoutArgs
): Promise<BillingResult<BillingCheckoutSession>> {
  if (args.billing.implementation === "stub") {
    return {
      ok: false,
      reason:
        "billing_stub — set ESCAPE_HATCH_BILLING_PROVIDER=stripe or nowpayments with creator credentials (EH-051/053)"
    };
  }

  if (args.enforceProviderPolicy !== false) {
    const policy = assertIndependentCheckoutAllowed({
      siteId: args.siteId,
      kitDir: args.kitDir,
      implementation: args.billing.implementation
    });
    if (!policy.ok) {
      return { ok: false, reason: policy.reason };
    }
  }

  if (args.duplicateGuard) {
    const dup = assertNoDuplicateBilling(args.duplicateGuard);
    if (!dup.ok) {
      return { ok: false, reason: dup.reason };
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
 * NOWPayments has no Stripe-style portal — adapter fails closed with an honest reason.
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
