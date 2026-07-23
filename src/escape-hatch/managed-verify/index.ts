/**
 * Escape Hatch EH-041 — Relay-managed Patreon verification (public surface).
 * EH-042 billing gate is optional via createManagedVerifyService({ billingGate }).
 */

export type {
  ManagedVerifyAssertionClaims,
  ManagedVerifyHealth,
  ManagedVerifyJwks,
  ManagedVerifyKeyPair,
  ManagedVerifyMetricsSnapshot,
  ManagedVerifySiteRecord,
  EntitlementObservation
} from "./types.js";
export {
  MANAGED_VERIFY_ALG,
  DEFAULT_ASSERTION_TTL_SEC,
  KEY_ROTATION_GRACE_MS
} from "./types.js";
export {
  generateManagedVerifyKeyPair,
  createManagedVerifyKeyRing,
  type ManagedVerifyKeyRing
} from "./keys.js";
export {
  issueManagedVerifyAssertion,
  verifyManagedVerifyAssertion,
  tamperAssertionPayload
} from "./assertion.js";
export {
  createMemorySiteRegistry,
  createMemoryReplayStore,
  mintAssertionJti,
  type ManagedVerifySiteRegistry,
  type ManagedVerifyReplayStore
} from "./registry.js";
export {
  createManagedVerifyMetrics,
  isManagedVerifyEnabled,
  resolveManagedVerifyOperatorToken,
  buildManagedVerifyHealth,
  noteProviderFailure,
  noteTokenRefreshHook
} from "./metrics.js";
export {
  createManagedVerifyService,
  mintManagedVerifyNonce,
  type ManagedVerifyService,
  type CreateManagedVerifyServiceArgs,
  type ManagedVerifyBillingGate
} from "./service.js";
export { registerManagedVerifyRoutes } from "./routes.js";
