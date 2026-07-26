/**
 * Entitlement evaluation contracts (EH-032).
 * Server-only authorization — never trust client-passed "I am entitled".
 *
 * AccessLevel / TierMatchMode are duplicated here so this module does not
 * depend on the fill-template-embedded `lib/contracts.ts` (absent in the
 * package template tree until generation).
 */

import type { EntitlementSource, SiteMembershipRole } from "../identity/types";

export type AccessLevel = "public" | "member_only" | "tier_gated";
export type TierMatchMode = "exact" | "tier_or_higher";

/** Why access was allowed or denied. */
export type AccessReasonCode =
  | "public_resource"
  | "staff_override"
  | "entitlement_grant"
  | "soft_persona_preview"
  | "anonymous_denied"
  | "missing_credentials"
  | "no_entitlement"
  | "entitlement_expired"
  | "entitlement_revoked"
  | "entitlement_stale"
  | "tier_insufficient"
  | "unknown_resource"
  | "provider_invalid"
  | "soft_persona_blocked"
  | "unpublished_resource";

export type IdentityProviderKind = "none" | "supabase" | "portable" | "invalid";

/**
 * Subject under evaluation. Soft persona is preview-only and must be rejected
 * when supabase/portable identity is configured.
 */
export type AccessSubject =
  | {
      kind: "anonymous";
    }
  | {
      kind: "member";
      userId: string;
      provider: "supabase" | "portable";
      role: SiteMembershipRole | null;
      siteId: string | null;
    }
  | {
      kind: "staff";
      userId: string;
      provider: "supabase" | "portable";
      role: "admin" | "operator";
      siteId: string;
    }
  | {
      kind: "soft_persona";
      personaId: string;
      /** Demo tier ids — authoritative only when provider is none. */
      tierIds: readonly string[];
    };

/** Resource being gated. */
export type AccessResource =
  | {
      type: "post";
      id: string;
      siteId: string;
      accessLevel: AccessLevel;
      tierIds: readonly string[];
      matchMode?: TierMatchMode;
      publishedAt: string | null;
    }
  | {
      type: "media";
      id: string;
      siteId: string;
      accessLevel: AccessLevel;
      tierIds: readonly string[];
      matchMode?: TierMatchMode;
    }
  | {
      type: "tier_minimum";
      siteId: string;
      /** Required gate tier ids (exact or tier-or-higher via catalog). */
      tierIds: readonly string[];
      matchMode?: TierMatchMode;
    }
  | {
      type: "admin_surface";
      siteId: string;
      /** Optional label for audit (e.g. posts inventory). */
      surface?: string;
    };

export type EntitlementGrantStatus = "active" | "expired" | "revoked" | "stale";

/**
 * One verified grant source. Secrets (password hashes, session tokens, service
 * role) must never appear here.
 */
export type EntitlementGrant = {
  source: EntitlementSource | "staff" | "soft_persona";
  tierIds: readonly string[];
  status: EntitlementGrantStatus;
  observedAt: string | null;
  staleAfter: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: string | null;
};

export type AccessEvaluation = {
  allowed: boolean;
  reason: AccessReasonCode;
  /** Human-readable detail; safe for logs/UX (no secrets). */
  detail: string;
  grants: readonly EntitlementGrant[];
  evaluatedAt: string;
  /**
   * True when an otherwise-active grant is past stale_after.
   * Premium paths hard-deny when stale; UI may show degraded copy.
   */
  stale: boolean;
  /** Provider mode observed during evaluation. */
  provider: IdentityProviderKind;
};

export type EvaluateAccessInput = {
  subject: AccessSubject;
  resource: AccessResource;
  /**
   * Grant rows to merge (memberships / snapshots / manual).
   * Soft-persona subjects ignore these unless provider is none (then persona tiers apply).
   */
  grants?: readonly EntitlementGrant[];
  /**
   * Optional tier catalog for paid/floor/ordering semantics.
   * Keys are tier ids.
   */
  tierCatalog?: Record<
    string,
    { amount_cents?: number | null; title?: string; currency?: string }
  >;
  /** Clock override for tests. */
  nowMs?: number;
  /**
   * When true (default for premium), stale grants do not authorize.
   * Public resources ignore this.
   */
  failClosedOnStale?: boolean;
  /** Identity provider mode — required for soft-persona honesty. */
  provider: IdentityProviderKind;
};

export type FreshnessPolicy = {
  /** Soft UI warning after this age even if stale_after is null (ms). */
  warnAfterMs: number;
  /** Hard deny for premium when stale_after passed (always for fail-closed). */
  hardDenyWhenStale: boolean;
  /** Default stale_after offset from observed_at when writing grants (ms). */
  defaultStaleAfterBySource: Readonly<
    Record<EntitlementSource, number | null>
  >;
};
