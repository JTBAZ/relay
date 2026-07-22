/**
 * Entitlement evaluation / grant-merge service (EH-032).
 * Server-only — do not import from client components.
 *
 * Complements Path A (Supabase) and Path B (portable) RLS; does not replace them.
 * Soft persona grants are local_preview only. productionSafe remains false until
 * EH-033 private media delivery.
 */

export type {
  AccessEvaluation,
  AccessReasonCode,
  AccessResource,
  AccessSubject,
  EntitlementGrant,
  EntitlementGrantStatus,
  EvaluateAccessInput,
  FreshnessPolicy,
  IdentityProviderKind
} from "./types";

export {
  DEFAULT_FRESHNESS_POLICY,
  computeDefaultStaleAfter,
  isGrantExpired,
  isGrantRevoked,
  isGrantStale,
  isTimestampPast,
  resolveGrantStatus,
  shouldWarnFreshness
} from "./freshness";

export { grantFromSnapshot, mergeEntitlementGrants } from "./merge";
export type { MergedGrants } from "./merge";

export { evaluateAccess, subjectFromSession } from "./evaluate";

export { userMeetsResourceGate } from "./gate";
export type { GateTierEntry } from "./gate";

export {
  evaluateAdminSurfaceAccess,
  evaluateCurrentAccess,
  evaluatePostAccess,
  resolveAccessSubject
} from "./server";
