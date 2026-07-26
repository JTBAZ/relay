/**
 * Preview-only billing entitlement sink for webhook ingress (EH-051).
 * Process-local memory — not durable multi-instance storage.
 */

import type { BillingProvider } from "../adapters/types";
import {
  rememberBillingCustomerLink,
  type BillingCustomerMapStore
} from "./customer-map";
import {
  applyBillingEntitlementEvent,
  createMemoryBillingEntitlementStore,
  type ApplyBillingEntitlementResult,
  type BillingEntitlementStore
} from "./entitlement";
import type { NormalizedBillingLifecycleEvent } from "./types";

const previewStore = createMemoryBillingEntitlementStore();

export function getPreviewBillingEntitlementStore(): BillingEntitlementStore & {
  seenEventIds: Set<string>;
} {
  return previewStore;
}

export type ProcessVerifiedBillingWebhookResult =
  | {
      ok: true;
      event: NormalizedBillingLifecycleEvent;
      entitlement: ApplyBillingEntitlementResult | null;
    }
  | { ok: false; reason: string; httpStatus: number };

/**
 * verify → normalize → optional entitlement apply (when authUserId known).
 * Caller must pass raw body + signature; this never trusts client JSON alone.
 */
export async function processVerifiedBillingWebhook(args: {
  billing: BillingProvider;
  rawBody: string | Buffer;
  signatureHeader: string | null;
  store?: BillingEntitlementStore & { seenEventIds?: Set<string> };
  /** Optional override; defaults to process-local preview customer map. */
  customerMap?: BillingCustomerMapStore;
}): Promise<ProcessVerifiedBillingWebhookResult> {
  const verify = await args.billing.verifyWebhookSignature({
    rawBody: args.rawBody,
    signatureHeader: args.signatureHeader
  });
  if (!verify.ok) {
    return {
      ok: false,
      reason: verify.reason,
      httpStatus: verify.reason === "webhook_secret_required" ? 503 : 400
    };
  }

  let parsed: unknown;
  try {
    const text =
      typeof args.rawBody === "string"
        ? args.rawBody
        : args.rawBody.toString("utf8");
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, reason: "invalid_json", httpStatus: 400 };
  }

  const normalized = args.billing.normalizeWebhookEvent({
    rawBody: args.rawBody,
    signatureHeader: args.signatureHeader,
    parsed,
    signatureVerified: true
  });
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason, httpStatus: 400 };
  }

  const store = args.store ?? previewStore;

  // Bind Stripe customer → auth user for portal (EH-051 IDOR remediation).
  if (
    normalized.event.siteId &&
    normalized.event.authUserId &&
    normalized.event.customerId
  ) {
    await rememberBillingCustomerLink({
      siteId: normalized.event.siteId,
      authUserId: normalized.event.authUserId,
      customerId: normalized.event.customerId,
      store: args.customerMap
    });
  }

  let entitlement: ApplyBillingEntitlementResult | null = null;
  if (normalized.event.authUserId) {
    entitlement = await applyBillingEntitlementEvent({
      lifecycle: normalized.event,
      store,
      seenEventIds: store.seenEventIds
    });
  } else if (store.seenEventIds) {
    // Still record idempotency for events without an auth user (checkout without client_reference_id).
    store.seenEventIds.add(normalized.event.id);
  }

  return { ok: true, event: normalized.event, entitlement };
}
