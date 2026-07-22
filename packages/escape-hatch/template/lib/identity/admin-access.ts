/**
 * Admin access resolution (EH-030).
 * When Supabase identity is configured, admin mutations require staff membership.
 * When unset, local-preview mode is labeled — soft persona never authorizes admin.
 */

import { assertLocalOperatorMutation } from "@/lib/library-truth";
import {
  isSupabaseIdentityConfigured,
  loadEnv
} from "@/lib/env";
import {
  getServerAuthSession,
  loadMembershipRole
} from "@/lib/identity/session";
import { isStaffRole, type SiteAuthSession } from "@/lib/identity/types";

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
