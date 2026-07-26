/**
 * Admin access resolution (EH-030 / EH-031 / EH-082).
 * When supabase/portable identity is active, admin reads and mutations require staff.
 * When none, local-preview inventory reads require an explicit loopback request context
 * (not authentication). Soft persona never authorizes admin.
 * Unknown provider strings fail closed (no local-preview fallback).
 */

import {
  isPortableIdentityConfigured,
  isSupabaseIdentityConfigured,
  loadEnv,
  resolveIdentityProviderSafe,
  type IdentityProviderMode
} from "../env";
import { assertLocalOperatorMutation } from "../library-truth/local-operator";
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
  | "provider_invalid"
  | "local_operator_required";

export type AdminReadAccess =
  | { allowed: true; identity: AdminIdentityState }
  | {
      allowed: false;
      identity: AdminIdentityState;
      reason: AdminReadDeniedReason;
    };

/**
 * Injectable request context for local_preview admin inventory reads.
 * Missing context and non-loopback hosts fail closed.
 * Do not trust x-forwarded-host for authorization.
 */
export type AdminReadRequestContext = {
  hostHeader?: string | null;
  requestUrl?: string | null;
};

function activeMode(
  mode: IdentityProviderMode | "invalid"
): "supabase" | "portable" | null {
  if (mode === "supabase" || mode === "portable") return mode;
  return null;
}

function hostnameFromHostHeader(host: string | null | undefined): string {
  if (!host) return "";
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end > 0) return trimmed.slice(1, end);
  }
  const colon = trimmed.lastIndexOf(":");
  if (colon > 0 && !trimmed.includes("]")) {
    return trimmed.slice(0, colon);
  }
  return trimmed;
}

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1"
  );
}

/**
 * True when Host (or request URL hostname) is loopback.
 * Fail closed when context is missing or neither host signal is loopback.
 * Does not consult x-forwarded-* (spoofable).
 */
export function isLoopbackAdminReadContext(
  ctx: AdminReadRequestContext | null | undefined
): boolean {
  if (!ctx) return false;
  const fromHost = hostnameFromHostHeader(ctx.hostHeader);
  if (isLoopbackHostname(fromHost)) return true;
  if (ctx.requestUrl) {
    try {
      const url = new URL(ctx.requestUrl);
      if (isLoopbackHostname(url.hostname)) return true;
    } catch {
      // ignore malformed URL
    }
  }
  return false;
}

/**
 * Resolve Host from Next.js request headers (async in Next 15).
 * Intentionally omits x-forwarded-host so spoofed forwarded hosts cannot unlock reads.
 */
export async function readAdminRequestContextFromHeaders(): Promise<AdminReadRequestContext> {
  const { headers } = await import("next/headers");
  const h = await headers();
  return {
    hostHeader: h.get("host"),
    requestUrl: null
  };
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
 * - local_preview: allow only with explicit loopback request context (not authentication).
 * - supabase / portable: require staff session; soft persona never unlocks admin reads.
 * - invalid provider: deny.
 * Missing request context on local_preview fails closed.
 */
export async function assertAdminReadAccess(
  siteId: string,
  requestContext?: AdminReadRequestContext | null
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
    if (!isLoopbackAdminReadContext(requestContext)) {
      return {
        allowed: false,
        identity,
        reason: "local_operator_required"
      };
    }
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
    // Static import of library-truth/local-operator (template ships a copy;
    // fill-template embeds the package-canonical module into generated kits).
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
