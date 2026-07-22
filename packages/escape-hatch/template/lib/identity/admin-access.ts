/**
 * Admin access resolution (EH-030).
 * When Supabase identity is configured, admin reads and mutations require staff membership.
 * When unset, local-preview mode is labeled — soft persona never authorizes admin.
 */

import {
  isSupabaseIdentityConfigured,
  loadEnv
} from "../env";
import {
  getServerAuthSession,
  loadMembershipRole
} from "./session";
import { isStaffRole, type SiteAuthSession } from "./types";

export type AdminIdentityState =
  | {
      mode: "local_preview";
      configured: false;
      label: "identity not configured";
      session: null;
      isStaff: false;
    }
  | {
      mode: "supabase";
      configured: true;
      label: "supabase identity";
      session: SiteAuthSession | null;
      isStaff: boolean;
    };

export type AdminReadDeniedReason = "sign_in_required" | "staff_required";

export type AdminReadAccess =
  | { allowed: true; identity: AdminIdentityState }
  | {
      allowed: false;
      identity: AdminIdentityState;
      reason: AdminReadDeniedReason;
    };

export async function resolveAdminIdentity(
  siteId: string
): Promise<AdminIdentityState> {
  if (!isSupabaseIdentityConfigured(loadEnv())) {
    return {
      mode: "local_preview",
      configured: false,
      label: "identity not configured",
      session: null,
      isStaff: false
    };
  }

  const session = await getServerAuthSession(siteId);
  const isStaff = isStaffRole(session?.role ?? null);
  return {
    mode: "supabase",
    configured: true,
    label: "supabase identity",
    session,
    isStaff
  };
}

/**
 * Gate admin page loaders (inventory reads).
 * - local_preview: allow current local-operator preview (not authentication).
 * - supabase: require staff session; soft persona never unlocks admin reads.
 */
export async function assertAdminReadAccess(
  siteId: string
): Promise<AdminReadAccess> {
  const identity = await resolveAdminIdentity(siteId);

  if (identity.mode === "local_preview") {
    return { allowed: true, identity };
  }

  if (!identity.session) {
    return {
      allowed: false,
      identity,
      reason: "sign_in_required"
    };
  }

  if (!identity.isStaff) {
    // Re-check membership fail-closed (session.role may be stale null)
    const role = await loadMembershipRole(siteId, identity.session.userId);
    if (!isStaffRole(role)) {
      return {
        allowed: false,
        identity,
        reason: "staff_required"
      };
    }
    return {
      allowed: true,
      identity: { ...identity, isStaff: true }
    };
  }

  return { allowed: true, identity };
}

export type AdminMutationAccess =
  | { allowed: true; mode: AdminIdentityState["mode"]; userId?: string }
  | { allowed: false; status: number; error: string; mode: AdminIdentityState["mode"] };

/**
 * Gate admin mutations.
 * - local_preview: existing loopback + header operator gate (not authentication).
 * - supabase: require staff membership; soft persona cannot satisfy this.
 */
export async function assertAdminMutationAccess(
  request: Request,
  siteId: string
): Promise<AdminMutationAccess> {
  const identity = await resolveAdminIdentity(siteId);

  if (identity.mode === "local_preview") {
    // Modules under library-truth/ (except index glue) are embedded by fill-template.
    // Extensionless relative import matches kit rewriteKitModuleImports convention.
    const localOperatorPath = "../library-truth/local-operator";
    const { assertLocalOperatorMutation } = (await import(
      localOperatorPath
    )) as {
      assertLocalOperatorMutation: (
        request: Request,
        surface: string
      ) =>
        | { allowed: true }
        | { allowed: false; status: number; error: string };
    };
    const access = assertLocalOperatorMutation(request, "Admin");
    if (!access.allowed) {
      return {
        allowed: false,
        status: access.status,
        error: access.error,
        mode: "local_preview"
      };
    }
    return { allowed: true, mode: "local_preview" };
  }

  if (!identity.session) {
    return {
      allowed: false,
      status: 401,
      error:
        "Sign in required. Soft demo personas do not authorize admin mutations.",
      mode: "supabase"
    };
  }

  if (!identity.isStaff) {
    // Re-check membership fail-closed (session.role may be stale null)
    const role = await loadMembershipRole(siteId, identity.session.userId);
    if (!isStaffRole(role)) {
      return {
        allowed: false,
        status: 403,
        error:
          "Staff membership required. Client persona tier_ids are not authorization.",
        mode: "supabase"
      };
    }
  }

  return {
    allowed: true,
    mode: "supabase",
    userId: identity.session.userId
  };
}
