/**
 * Server-side auth session helpers (EH-030).
 * Soft persona state in the browser is never consulted here.
 */

import {
  isSupabaseIdentityConfigured,
  loadEnv
} from "../env";
import {
  isStaffRole,
  type SiteAuthSession,
  type SiteMembershipRole
} from "./types";
import type { EntitlementReadResult } from "./types";
import { parseEntitlementSnapshot } from "./entitlements";

async function createServerSupabaseClient() {
  const mod = await import("../supabase/server");
  return mod.createServerSupabaseClient();
}

const STAFF_ROLES = new Set<SiteMembershipRole>(["admin", "operator"]);

function asRole(value: unknown): SiteMembershipRole | null {
  if (value === "admin" || value === "operator" || value === "patron") {
    return value;
  }
  return null;
}

/**
 * Read the current Supabase user session and optional site membership.
 * Returns null when identity is not configured or no user is signed in.
 */
export async function getServerAuthSession(
  siteId?: string
): Promise<SiteAuthSession | null> {
  if (!isSupabaseIdentityConfigured(loadEnv())) {
    return null;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return null;
    }

    let role: SiteMembershipRole | null = null;
    let resolvedSiteId: string | null = siteId ?? null;

    if (siteId) {
      role = await loadMembershipRole(
        siteId,
        data.user.id,
        supabase as unknown as MembershipClient
      );
      resolvedSiteId = siteId;
    }

    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      role,
      siteId: resolvedSiteId
    };
  } catch {
    // Outside a Next request context (or cookies unavailable) — fail closed.
    return null;
  }
}

type MembershipClient = {
  // Minimal query surface — avoid coupling to full Supabase generics.
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string
      ) => {
        eq: (
          col: string,
          val: string
        ) => {
          maybeSingle: () => PromiseLike<{
            data: { role?: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

export async function loadMembershipRole(
  siteId: string,
  authUserId: string,
  client?: MembershipClient
): Promise<SiteMembershipRole | null> {
  if (!isSupabaseIdentityConfigured(loadEnv())) {
    return null;
  }

  try {
    const supabase =
      client ?? ((await createServerSupabaseClient()) as unknown as MembershipClient);
    const { data, error } = await supabase
      .from("eh_site_memberships")
      .select("role")
      .eq("site_id", siteId)
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return asRole(data.role);
  } catch {
    return null;
  }
}

export async function sessionIsSiteStaff(
  siteId: string,
  session: SiteAuthSession | null
): Promise<boolean> {
  if (!session) return false;
  if (session.siteId === siteId && isStaffRole(session.role)) {
    return true;
  }
  const role = await loadMembershipRole(siteId, session.userId);
  return STAFF_ROLES.has(role as SiteMembershipRole);
}

/**
 * Load entitlement snapshot for the signed-in user (fail-closed).
 * Never accepts client-supplied tier_ids.
 */
export async function loadOwnEntitlementSnapshot(
  siteId: string,
  authUserId: string
): Promise<EntitlementReadResult> {
  if (!isSupabaseIdentityConfigured(loadEnv())) {
    return {
      ok: false,
      reason: "Identity not configured.",
      tierIds: []
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("eh_entitlement_snapshots")
      .select(
        "site_id, auth_user_id, tier_ids, source, reason, observed_at, stale_after"
      )
      .eq("site_id", siteId)
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        reason: "Entitlement read failed (fail-closed).",
        tierIds: []
      };
    }
    if (!data) {
      return {
        ok: false,
        reason: "No entitlement snapshot for this user.",
        tierIds: []
      };
    }
    return parseEntitlementSnapshot(data);
  } catch {
    return {
      ok: false,
      reason: "Entitlement read unavailable (fail-closed).",
      tierIds: []
    };
  }
}
