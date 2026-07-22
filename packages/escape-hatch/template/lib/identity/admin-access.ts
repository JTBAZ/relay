/**
 * Admin access resolution (EH-030 / EH-031).
 * When supabase/portable identity is active, admin reads and mutations require staff.
 * When none, local-preview mode is labeled — soft persona never authorizes admin.
 * Unknown provider strings fail closed (no local-preview fallback).
 */

import {
  isPortableIdentityConfigured,
  isSupabaseIdentityConfigured,
  loadEnv,
  resolveIdentityProviderSafe,
  type IdentityProviderMode
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
    }
  | {
      mode: "portable";
      configured: true;
      label: "portable identity";
      session: SiteAuthSession | null;
      isStaff: boolean;
    }
  | {
      mode: "invalid";
      configured: false;
      label: "identity provider invalid";
      session: null;
      isStaff: false;
    };

export type AdminReadDeniedReason =
  | "sign_in_required"
  | "staff_required"
  | "provider_invalid";

export type AdminReadAccess =
  | { allowed: true; identity: AdminIdentityState }
  | {
      allowed: false;
      identity: AdminIdentityState;
      reason: AdminReadDeniedReason;
    };

function activeMode(
  mode: IdentityProviderMode | "invalid"
): "supabase" | "portable" | null {
  if (mode === "supabase" || mode === "portable") return mode;
  return null;
}

export async function resolveAdminIdentity(
  siteId: string
): Promise<AdminIdentityState> {
  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);

  if (mode === "invalid") {
    return {
      mode: "invalid",
      configured: false,
      label: "identity provider invalid",
      session: null,
      isStaff: false
    };
  }

  if (mode === "none") {
    return {
      mode: "local_preview",
      configured: false,
      label: "identity not configured",
      session: null,
      isStaff: false
    };
  }

  if (mode === "supabase") {
    // Explicit or auto-selected supabase path — soft persona never unlocks admin,
    // even when env is incomplete (fail closed to sign-in required).
    if (!isSupabaseIdentityConfigured(env)) {
      return {
        mode: "supabase",
        configured: true,
        label: "supabase identity",
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

  // portable
  if (!isPortableIdentityConfigured(env)) {
    return {
      mode: "portable",
      configured: true,
      label: "portable identity",
      session: null,
      isStaff: false
    };
  }
  const session = await getServerAuthSession(siteId);
  const isStaff = isStaffRole(session?.role ?? null);
  return {
    mode: "portable",
    configured: true,
    label: "portable identity",
    session,
    isStaff
  };
}

/**
 * Gate admin page loaders (inventory reads).
 * - local_preview: allow current local-operator preview (not authentication).
 * - supabase / portable: require staff session; soft persona never unlocks admin reads.
 * - invalid provider: deny.
 */
export async function assertAdminReadAccess(
  siteId: string
): Promise<AdminReadAccess> {
  const identity = await resolveAdminIdentity(siteId);

  if (identity.mode === "invalid") {
    return {
      allowed: false,
      identity,
      reason: "provider_invalid"
    };
  }

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
  | {
      allowed: false;
      status: number;
      error: string;
      mode: AdminIdentityState["mode"];
    };

/**
 * Gate admin mutations.
 * - local_preview: existing loopback + header operator gate (not authentication).
 * - supabase / portable: require staff membership; soft persona cannot satisfy this.
 * - invalid: deny.
 */
export async function assertAdminMutationAccess(
  request: Request,
  siteId: string
): Promise<AdminMutationAccess> {
  const identity = await resolveAdminIdentity(siteId);

  if (identity.mode === "invalid") {
    return {
      allowed: false,
      status: 500,
      error:
        "Unknown ESCAPE_HATCH_IDENTITY_PROVIDER. Use none, supabase, or portable.",
      mode: "invalid"
    };
  }

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

  const providerMode = activeMode(identity.mode);
  if (!providerMode) {
    return {
      allowed: false,
      status: 403,
      error: "Identity path not available.",
      mode: identity.mode
    };
  }

  if (!identity.session) {
    return {
      allowed: false,
      status: 401,
      error:
        "Sign in required. Soft demo personas do not authorize admin mutations.",
      mode: identity.mode
    };
  }

  if (!identity.isStaff) {
    const role = await loadMembershipRole(siteId, identity.session.userId);
    if (!isStaffRole(role)) {
      return {
        allowed: false,
        status: 403,
        error:
          "Staff membership required. Client persona tier_ids are not authorization.",
        mode: identity.mode
      };
    }
  }

  return {
    allowed: true,
    mode: identity.mode,
    userId: identity.session.userId
  };
}
