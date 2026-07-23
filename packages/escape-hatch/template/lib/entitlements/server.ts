/**
 * Request-scoped entitlement evaluation (EH-032).
 * Loads session + entitlement snapshots via existing identity helpers.
 * Complements RLS — does not replace DB policies.
 */

import {
  loadEnv,
  resolveIdentityProviderSafe,
  type IdentityProviderMode
} from "../env";
import {
  getServerAuthSession,
  loadOwnEntitlementSnapshot
} from "../identity/session";
import type { EntitlementReadResult } from "../identity/types";
import { isStaffRole } from "../identity/types";
import { evaluateAccess, subjectFromSession } from "./evaluate";
import { grantFromSnapshot } from "./merge";
import type {
  AccessEvaluation,
  AccessResource,
  AccessSubject,
  EntitlementGrant,
  IdentityProviderKind
} from "./types";
import { manualGrantsForSubject } from "../cms/grants";

function toProviderKind(
  mode: IdentityProviderMode | "invalid"
): IdentityProviderKind {
  if (mode === "invalid") return "invalid";
  return mode;
}

function grantsFromEntitlementResult(
  result: EntitlementReadResult,
  nowMs: number
): EntitlementGrant[] {
  if (!result.ok) return [];
  const snap = result.snapshot;
  return [
    grantFromSnapshot({
      source: snap.source,
      tierIds: snap.tierIds,
      observedAt: snap.observedAt,
      staleAfter: snap.staleAfter,
      expiresAt: snap.expiresAt,
      revokedAt: snap.revokedAt,
      reason: snap.reason,
      nowMs
    })
  ];
}

/**
 * Resolve the current subject from server auth (never from client persona).
 * Returns anonymous when unsigned / identity none.
 */
export async function resolveAccessSubject(
  siteId: string
): Promise<{ subject: AccessSubject; provider: IdentityProviderKind }> {
  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);
  const provider = toProviderKind(mode);

  if (provider === "invalid" || provider === "none") {
    return { subject: { kind: "anonymous" }, provider };
  }

  const session = await getServerAuthSession(siteId);
  if (!session) {
    return { subject: { kind: "anonymous" }, provider };
  }

  const role = session.role;
  if (isStaffRole(role) && session.siteId === siteId) {
    return {
      subject: {
        kind: "staff",
        userId: session.userId,
        provider,
        role: role as "admin" | "operator",
        siteId
      },
      provider
    };
  }

  return {
    subject: subjectFromSession({
      userId: session.userId,
      provider,
      role,
      siteId: session.siteId
    }),
    provider
  };
}

export type EvaluateCurrentAccessInput = {
  siteId: string;
  resource: AccessResource;
  /**
   * Soft persona — only honored when provider is none.
   * Ignored (and never elevates) when supabase/portable is configured.
   */
  softPersona?: { personaId: string; tierIds: readonly string[] } | null;
  tierCatalog?: EvaluateAccessInputTier;
  nowMs?: number;
  failClosedOnStale?: boolean;
};

type EvaluateAccessInputTier = NonNullable<
  Parameters<typeof evaluateAccess>[0]["tierCatalog"]
>;

/**
 * Evaluate access for the current request subject + loaded grants.
 * Soft persona is applied only in local_preview (provider none).
 */
export async function evaluateCurrentAccess(
  input: EvaluateCurrentAccessInput
): Promise<AccessEvaluation> {
  const nowMs = input.nowMs ?? Date.now();
  let { subject, provider } = await resolveAccessSubject(input.siteId);

  // Soft persona only when identity is unset — never when provider configured.
  if (
    provider === "none" &&
    input.softPersona &&
    input.softPersona.personaId.length > 0
  ) {
    subject = {
      kind: "soft_persona",
      personaId: input.softPersona.personaId,
      tierIds: input.softPersona.tierIds
    };
  }

  let grants: EntitlementGrant[] = [];
  if (
    (provider === "supabase" || provider === "portable") &&
    (subject.kind === "member" || subject.kind === "staff")
  ) {
    const snap = await loadOwnEntitlementSnapshot(
      input.siteId,
      subject.userId
    );
    grants = grantsFromEntitlementResult(snap, nowMs);
    const manual = manualGrantsForSubject(input.siteId, subject.userId, {
      nowMs
    });
    grants = [...grants, ...manual];
  } else if (provider === "none" && subject.kind === "soft_persona") {
    const manual = manualGrantsForSubject(input.siteId, subject.personaId, {
      nowMs
    });
    grants = [...grants, ...manual];
  }

  return evaluateAccess({
    subject,
    resource: input.resource,
    grants,
    tierCatalog: input.tierCatalog,
    nowMs,
    failClosedOnStale: input.failClosedOnStale,
    provider
  });
}

/**
 * Convenience: evaluate post access from bundle-shaped fields.
 */
export async function evaluatePostAccess(input: {
  siteId: string;
  post: {
    id: string;
    access: {
      level: "public" | "member_only" | "tier_gated";
      tier_ids: string[];
      match_mode?: "exact" | "tier_or_higher";
    };
    published_at: string | null;
  };
  softPersona?: EvaluateCurrentAccessInput["softPersona"];
  tierCatalog?: EvaluateAccessInputTier;
}): Promise<AccessEvaluation> {
  return evaluateCurrentAccess({
    siteId: input.siteId,
    softPersona: input.softPersona,
    tierCatalog: input.tierCatalog,
    resource: {
      type: "post",
      id: input.post.id,
      siteId: input.siteId,
      accessLevel: input.post.access.level,
      tierIds: input.post.access.tier_ids,
      matchMode: input.post.access.match_mode,
      publishedAt: input.post.published_at
    }
  });
}

/**
 * Convenience: evaluate admin surface (does not weaken assertAdminReadAccess).
 */
export async function evaluateAdminSurfaceAccess(
  siteId: string,
  surface?: string
): Promise<AccessEvaluation> {
  return evaluateCurrentAccess({
    siteId,
    resource: { type: "admin_surface", siteId, surface }
  });
}
