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
  resolveNowPaymentsApiKey,
  resolveNowPaymentsIpnSecret,
  resolveStripeSecretKey,
  resolveStripeWebhookSecret,
  NOWPAYMENTS_BILLING_ENV_NAMES,
  NOWPAYMENTS_POLICY,
  STRIPE_BILLING_ENV_NAMES,
  STRIPE_POLICY,
  STRIPE_POLICY_SHELL,
  STUB_POLICY,
  isNowPaymentsBillingConfigured
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
  createMemoryNowPaymentsClient,
  createNowPaymentsBillingProvider
} from "./nowpayments";

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

export {
  assertIndependentCheckoutAllowed,
  CONTENT_ATTESTATION_CONTRACT,
  CONTENT_ATTESTATION_FILENAME,
  CONTENT_USE_CATEGORY_LABELS,
  emptyContentUseAttestation,
  evaluateSiteProviderPolicy,
  getBillingPolicyRow,
  getProviderPolicyRow,
  isAttestationComplete,
  isContentUseCategory,
  listMatrixSummary,
  loadContentUseAttestation,
  PROVIDER_POLICY_MATRIX,
  PROVIDER_POLICY_MATRIX_CONTRACT,
  routeProviderPolicy,
  saveContentUseAttestation,
  type BillingRecipe,
  type BillingRecipeId,
  type CheckoutCapableProvider,
  type ContentUseAttestation,
  type ContentUseCategory,
  type PolicyRouteDecision,
  type ProviderPolicyRow
} from "./policy";

export {
  BILLING_TIER_MAP_CONTRACT,
  BILLING_TIER_MAP_FILENAME,
  emptyBillingTierMap,
  getMappedPriceId,
  getTierMapEntry,
  loadBillingTierMap,
  saveBillingTierMap,
  type BillingTierMapDocument,
  type BillingTierMapEntry
} from "./tier-map";

export {
  assertNoDuplicateBilling,
  buildConversionSubjectFromSummary,
  loadPolicyForSite,
  resolveTierConversionAction,
  type ConversionAction,
  type ConversionActionKind,
  type ConversionSubject
} from "./conversion";

export {
  buildTierCatalogCards,
  type TierCatalogCard
} from "./catalog";

export {
  runBillingTierPreflight,
  type BillingPreflightCheck,
  type BillingPreflightReport
} from "./preflight";
