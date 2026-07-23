/**
 * Escape Hatch EH-042 — Relay billing entitlement for managed Patreon connector.
 */

export type {
  ManagedVerifyAddonSku,
  ManagedVerifyAddonProduct,
  ManagedVerifyBillingState,
  ManagedVerifyBillingRecord,
  ManagedVerifyBillingGateResult,
  ManagedVerifyCancellationCopy,
  ManagedVerifyBillingWebhookEvent,
  ManagedVerifyBillingWebhookApplyResult
} from "./types.js";
export { MANAGED_VERIFY_ADDON_SKU } from "./types.js";
export {
  DEFAULT_MANAGED_VERIFY_MONTHLY_CENTS,
  DEFAULT_MANAGED_VERIFY_GRACE_DAYS,
  isManagedVerifyBillingEnabled,
  resolveManagedVerifyBillingConfig,
  buildAddonProduct,
  type ManagedVerifyBillingResolvedConfig
} from "./config.js";
export {
  ISSUANCE_ALLOWED_STATES,
  allowsManagedVerifyIssuance,
  computeLastServiceDateIso,
  refreshBillingStateForNow,
  gateManagedVerifyIssuance,
  mapStripeSubscriptionStatus
} from "./entitlement.js";
export {
  createMemoryManagedVerifyBillingStore,
  type ManagedVerifyBillingStore
} from "./store.js";
export {
  normalizeManagedVerifyBillingWebhook,
  applyManagedVerifyBillingWebhook
} from "./webhook.js";
export {
  verifyManagedVerifyBillingWebhookSignature,
  mintTestWebhookSignature
} from "./webhook-signature.js";
export { buildCancellationCopy, buildStaleWarning } from "./cancellation-copy.js";
export {
  createManagedVerifyBillingService,
  type ManagedVerifyBillingService,
  type CreateManagedVerifyBillingServiceArgs
} from "./service.js";
export {
  registerManagedVerifyBillingRoutes,
  createManagedVerifyBillingWebhookHandler,
  type RegisterManagedVerifyBillingRoutesDeps
} from "./routes.js";
