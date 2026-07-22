/**
 * Server-side entitlement evaluator (EH-032).
 * Fail closed: unknown resource / missing credentials when provider configured → deny.
 * Soft persona never elevates when supabase/portable is configured.
 */

import { isStaffRole } from "../identity/types";
import { userMeetsResourceGate } from "./gate";
import { mergeEntitlementGrants } from "./merge";
import type {
  AccessEvaluation,
  AccessReasonCode,
  AccessResource,
  AccessSubject,
  EntitlementGrant,
  EvaluateAccessInput,
  IdentityProviderKind
} from "./types";

function isoNow(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function result(
  partial: Omit<AccessEvaluation, "evaluatedAt"> & { nowMs: number }
): AccessEvaluation {
  const { nowMs, ...rest } = partial;
  return {
    ...rest,
    evaluatedAt: isoNow(nowMs)
  };
}

function isPremiumAccessLevel(level: string): boolean {
  return level === "member_only" || level === "tier_gated";
}

function resourceGate(
  resource: AccessResource
): {
  level: "public" | "member_only" | "tier_gated";
  tierIds: readonly string[];
  matchMode?: "exact" | "tier_or_higher";
  publishedAt?: string | null;
} | null {
  if (resource.type === "admin_surface") return null;
  if (resource.type === "tier_minimum") {
    return {
      level: "tier_gated",
      tierIds: resource.tierIds,
      matchMode: resource.matchMode
    };
  }
  if (resource.type === "post") {
    return {
      level: resource.accessLevel,
      tierIds: resource.tierIds,
      matchMode: resource.matchMode,
      publishedAt: resource.publishedAt
    };
  }
  return {
    level: resource.accessLevel,
    tierIds: resource.tierIds,
    matchMode: resource.matchMode
  };
}

function providerConfigured(provider: IdentityProviderKind): boolean {
  return provider === "supabase" || provider === "portable";
}

/**
 * Pure evaluator — no I/O. Callers load grants/session then invoke this.
 */
export function evaluateAccess(input: EvaluateAccessInput): AccessEvaluation {
  const nowMs = input.nowMs ?? Date.now();
  const provider = input.provider;
  const failClosedOnStale = input.failClosedOnStale !== false;
  const grantsIn = input.grants ?? [];
  const subject = input.subject;
  const resource = input.resource;

  if (provider === "invalid") {
    return result({
      allowed: false,
      reason: "provider_invalid",
      detail: "Unknown identity provider — fail closed.",
      grants: [],
      stale: false,
      provider,
      nowMs
    });
  }

  // Soft persona must never elevate when a real provider is configured.
  if (subject.kind === "soft_persona" && providerConfigured(provider)) {
    return result({
      allowed: false,
      reason: "soft_persona_blocked",
      detail:
        "Soft demo personas are not entitlements when supabase/portable identity is configured.",
      grants: [],
      stale: false,
      provider,
      nowMs
    });
  }

  // Admin surfaces: staff only (local_preview handled by admin-access, not here).
  if (resource.type === "admin_surface") {
    if (subject.kind === "staff") {
      const staffGrant: EntitlementGrant = {
        source: "staff",
        tierIds: [],
        status: "active",
        observedAt: isoNow(nowMs),
        staleAfter: null,
        expiresAt: null,
        revokedAt: null,
        reason: `staff:${subject.role}`
      };
      return result({
        allowed: true,
        reason: "staff_override",
        detail: `Staff ${subject.role} may access admin surface.`,
        grants: [staffGrant],
        stale: false,
        provider,
        nowMs
      });
    }
    if (
      subject.kind === "member" &&
      isStaffRole(subject.role) &&
      subject.siteId === resource.siteId
    ) {
      const staffGrant: EntitlementGrant = {
        source: "staff",
        tierIds: [],
        status: "active",
        observedAt: isoNow(nowMs),
        staleAfter: null,
        expiresAt: null,
        revokedAt: null,
        reason: `staff:${subject.role}`
      };
      return result({
        allowed: true,
        reason: "staff_override",
        detail: `Staff ${subject.role} may access admin surface.`,
        grants: [staffGrant],
        stale: false,
        provider,
        nowMs
      });
    }
    if (subject.kind === "anonymous") {
      return result({
        allowed: false,
        reason: "missing_credentials",
        detail: "Sign in required for admin surfaces.",
        grants: [],
        stale: false,
        provider,
        nowMs
      });
    }
    if (subject.kind === "soft_persona") {
      return result({
        allowed: false,
        reason: "soft_persona_blocked",
        detail: "Soft personas never authorize admin surfaces.",
        grants: [],
        stale: false,
        provider,
        nowMs
      });
    }
    return result({
      allowed: false,
      reason: "missing_credentials",
      detail: "Staff membership required for admin surfaces.",
      grants: [],
      stale: false,
      provider,
      nowMs
    });
  }

  const gate = resourceGate(resource);
  if (!gate) {
    return result({
      allowed: false,
      reason: "unknown_resource",
      detail: "Unknown resource type — fail closed.",
      grants: [],
      stale: false,
      provider,
      nowMs
    });
  }

  // Unpublished posts: deny non-staff (staff handled below).
  if (
    resource.type === "post" &&
    (resource.publishedAt == null || resource.publishedAt === "")
  ) {
    const staffOk =
      subject.kind === "staff" ||
      (subject.kind === "member" &&
        isStaffRole(subject.role) &&
        subject.siteId === resource.siteId);
    if (staffOk) {
      return result({
        allowed: true,
        reason: "staff_override",
        detail: "Staff may read unpublished post metadata.",
        grants: [
          {
            source: "staff",
            tierIds: [],
            status: "active",
            observedAt: isoNow(nowMs),
            staleAfter: null,
            expiresAt: null,
            revokedAt: null,
            reason: "staff:unpublished"
          }
        ],
        stale: false,
        provider,
        nowMs
      });
    }
    return result({
      allowed: false,
      reason: "unpublished_resource",
      detail: "Unpublished posts are not visitor-visible.",
      grants: [],
      stale: false,
      provider,
      nowMs
    });
  }

  // Public resources: always allow (bytes still may leak via public/media until EH-033).
  if (gate.level === "public") {
    return result({
      allowed: true,
      reason: "public_resource",
      detail: "Public resource — no entitlement required.",
      grants: [],
      stale: false,
      provider,
      nowMs
    });
  }

  // Staff override for premium content metadata.
  if (
    subject.kind === "staff" ||
    (subject.kind === "member" &&
      isStaffRole(subject.role) &&
      subject.siteId ===
        (resource.type === "tier_minimum" ? resource.siteId : resource.siteId))
  ) {
    return result({
      allowed: true,
      reason: "staff_override",
      detail: "Staff may access premium content metadata.",
      grants: [
        {
          source: "staff",
          tierIds: [],
          status: "active",
          observedAt: isoNow(nowMs),
          staleAfter: null,
          expiresAt: null,
          revokedAt: null,
          reason: "staff:premium"
        }
      ],
      stale: false,
      provider,
      nowMs
    });
  }

  // Soft persona preview (provider === none only — blocked earlier otherwise).
  if (subject.kind === "soft_persona" && provider === "none") {
    const ok = userMeetsResourceGate(
      {
        level: gate.level,
        tierIds: gate.tierIds,
        matchMode: gate.matchMode
      },
      subject.tierIds,
      input.tierCatalog
    );
    const personaGrant: EntitlementGrant = {
      source: "soft_persona",
      tierIds: [...subject.tierIds],
      status: "active",
      observedAt: isoNow(nowMs),
      staleAfter: null,
      expiresAt: null,
      revokedAt: null,
      reason: `soft_persona:${subject.personaId}`
    };
    return result({
      allowed: ok,
      reason: ok ? "soft_persona_preview" : "tier_insufficient",
      detail: ok
        ? "Local soft-persona preview grant (non-production)."
        : "Soft persona tiers do not meet this gate.",
      grants: [personaGrant],
      stale: false,
      provider,
      nowMs
    });
  }

  // Configured provider: anonymous / missing member credentials → deny.
  if (providerConfigured(provider)) {
    if (subject.kind === "anonymous") {
      return result({
        allowed: false,
        reason: "anonymous_denied",
        detail: "Authentication required for premium access.",
        grants: [],
        stale: false,
        provider,
        nowMs
      });
    }
    if (subject.kind === "soft_persona") {
      return result({
        allowed: false,
        reason: "soft_persona_blocked",
        detail:
          "Soft demo personas are not entitlements when identity is configured.",
        grants: [],
        stale: false,
        provider,
        nowMs
      });
    }
    // member | staff continue into grant merge
  }

  // Local preview without soft persona subject and without grants → deny premium.
  if (provider === "none" && subject.kind === "anonymous") {
    return result({
      allowed: false,
      reason: "anonymous_denied",
      detail:
        "Anonymous cannot access premium content. Use a soft persona in local_preview or configure identity.",
      grants: [],
      stale: false,
      provider,
      nowMs
    });
  }

  // Defense in depth: never merge soft_persona-sourced rows when a real provider is on.
  const grantsForMerge = providerConfigured(provider)
    ? grantsIn.filter((g) => g.source !== "soft_persona")
    : grantsIn;

  const merged = mergeEntitlementGrants(grantsForMerge, {
    nowMs,
    failClosedOnStale: failClosedOnStale && isPremiumAccessLevel(gate.level)
  });

  if (merged.effectiveTier.length === 0) {
    const reason: AccessReasonCode = merged.denyReason ?? "no_entitlement";
    return result({
      allowed: false,
      reason,
      detail: detailForDeny(reason),
      grants: merged.grants,
      stale: merged.anyStale,
      provider,
      nowMs
    });
  }

  const ok = userMeetsResourceGate(
    {
      level: gate.level,
      tierIds: gate.tierIds,
      matchMode: gate.matchMode
    },
    merged.effectiveTier,
    input.tierCatalog
  );

  if (!ok) {
    return result({
      allowed: false,
      reason: "tier_insufficient",
      detail: "Active grants do not satisfy the required tier gate.",
      grants: merged.grants,
      stale: merged.anyStale,
      provider,
      nowMs
    });
  }

  return result({
    allowed: true,
    reason: "entitlement_grant",
    detail: "Active entitlement grant covers this resource.",
    grants: merged.grants,
    stale: merged.anyStale,
    provider,
    nowMs
  });
}

function detailForDeny(reason: AccessReasonCode): string {
  switch (reason) {
    case "entitlement_expired":
      return "Entitlement grant expired.";
    case "entitlement_revoked":
      return "Entitlement grant revoked.";
    case "entitlement_stale":
      return "Entitlement snapshot is stale — fail closed for premium content.";
    case "no_entitlement":
      return "No entitlement grant for this subject.";
    default:
      return "Access denied.";
  }
}

/**
 * Narrow helper: build a member/staff subject from session fields.
 */
export function subjectFromSession(input: {
  userId: string;
  provider: "supabase" | "portable";
  role: "admin" | "operator" | "patron" | null;
  siteId: string | null;
}): AccessSubject {
  if (
    (input.role === "admin" || input.role === "operator") &&
    input.siteId
  ) {
    return {
      kind: "staff",
      userId: input.userId,
      provider: input.provider,
      role: input.role,
      siteId: input.siteId
    };
  }
  return {
    kind: "member",
    userId: input.userId,
    provider: input.provider,
    role: input.role,
    siteId: input.siteId
  };
}
