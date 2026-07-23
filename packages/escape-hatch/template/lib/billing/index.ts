/**
 * Independent-site billing (EH-050 contract + EH-051 Stripe adapter).
 *
 * Default adapter is stub. Set ESCAPE_HATCH_BILLING_PROVIDER=stripe for the
 * creator-owned Stripe Billing/Checkout/Portal/webhook adapter.
 * Entitlement service consumes normalized events only — never provider payloads.
 */

export type {
  BillingAccountConnection,
  BillingCapabilityFlags,
  BillingCapabilityMatrix,
  BillingCheckoutSession,
  BillingEntitlementEvent,
  BillingEntitlementEventKind,
  BillingImplementation,
  BillingInterval,
  BillingLifecycleEventType,
  BillingMigrationMapping,
  BillingPolicyDeclaration,
  BillingPortalSession,
  BillingPrice,
  BillingProduct,
  BillingReadinessReport,
  BillingResult,
  BillingResultFail,
  BillingResultOk,
  BillingSubscriptionStatus,
  BillingWebhookEnvelope,
  NormalizedBillingLifecycleEvent,
  NormalizeWebhookResult
} from "./types";

export { BILLING_NOT_IMPLEMENTED } from "./types";

export {
  defaultBillingWebhookMapper,
  normalizeWebhookEvent,
  unsignedEnvelopeFromParsed,
  verifiedEnvelopeFromParsed,
  type BillingWebhookMapper,
  type NormalizeWebhookOptions
} from "./normalize";

export {
  applyBillingEntitlementEvent,
  buildBillingEntitlementSnapshot,
  createMemoryBillingEntitlementStore,
  entitlementEventToSnapshot,
  lifecycleToEntitlementEvent,
  type ApplyBillingEntitlementArgs,
  type ApplyBillingEntitlementResult,
  type BillingEntitlementStore
} from "./entitlement";

export {
  getBillingCapabilityMatrix,
  getBillingPolicyDeclaration,
  isStripeBillingConfigured,
  reportBillingReadiness,
  resolveStripeSecretKey,
  resolveStripeWebhookSecret,
  STRIPE_BILLING_ENV_NAMES,
  STRIPE_POLICY,
  STRIPE_POLICY_SHELL,
  STUB_POLICY
} from "./readiness";

export { createStubBillingProvider } from "./stub";
export {
  createMemoryStripeBillingClient,
  createStripeBillingProvider,
  createStripeBillingShell,
  mintStripeWebhookSignature,
  verifyStripeWebhookSignature,
  wrapStripeSdk
} from "./stripe";

export {
  startCustomerPortal,
  startIndependentCheckout,
  type StartCheckoutArgs,
  type StartPortalArgs
} from "./hooks";

export {
  createMemoryBillingCustomerMap,
  getPreviewBillingCustomerMap,
  rememberBillingCustomerLink,
  resolveCheckoutCustomerId,
  resolvePortalCustomerId,
  type BillingCustomerLink,
  type BillingCustomerMapStore,
  type ResolveCheckoutCustomerResult,
  type ResolvePortalCustomerResult
} from "./customer-map";

export {
  getPreviewBillingEntitlementStore,
  processVerifiedBillingWebhook,
  type ProcessVerifiedBillingWebhookResult
} from "./webhook-process";
