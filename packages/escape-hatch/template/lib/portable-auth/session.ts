/**
 * Portable session adapter (EH-031 / Path B).
 * Server-only cookie sessions; soft personas are never consulted.
 */

import { randomUUID } from "node:crypto";
import {
  isPortableIdentityConfigured,
  loadEnv,
  type SiteEnv
} from "../env";
import {
  isStaffRole,
  type SiteAuthSession,
  type SiteMembershipRole
} from "../identity/types";
import type { EntitlementReadResult } from "../identity/types";
import { parseEntitlementSnapshot } from "../identity/entitlements";
import {
  hashPassword,
  hashSessionToken,
  mintSessionToken,
  PORTABLE_SESSION_COOKIE,
  PORTABLE_SESSION_TTL_MS,
  portableSessionCookieOptions,
  verifyPassword
} from "./crypto";
import { withPortableClient } from "./db";

function asRole(value: unknown): SiteMembershipRole | null {
  if (value === "admin" || value === "operator" || value === "patron") {
    return value;
  }
  return null;
}

async function readCookieValue(name: string): Promise<string | undefined> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return jar.get(name)?.value;
  } catch {
    return undefined;
  }
}

async function writeCookie(
  name: string,
  value: string,
  maxAgeSec: number
): Promise<void> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.set(name, value, portableSessionCookieOptions({ maxAgeSec }));
}

async function clearCookie(name: string): Promise<void> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.set(name, "", {
    ...portableSessionCookieOptions({ maxAgeSec: 0 }),
    maxAge: 0
  });
}

export async function getPortableAuthSession(
  siteId?: string,
  env: SiteEnv = loadEnv()
): Promise<SiteAuthSession | null> {
  if (!isPortableIdentityConfigured(env)) {
    return null;
  }
  const rawToken = await readCookieValue(PORTABLE_SESSION_COOKIE);
  if (!rawToken) return null;

  const secret = env.ESCAPE_HATCH_SESSION_SECRET!;
  const tokenHash = hashSessionToken(rawToken, secret);

  const row = await withPortableClient(async (client) => {
    const result = await client.query<{
      user_id: string;
      email: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `SELECT s.user_id, u.email, s.expires_at::text, s.revoked_at::text
       FROM eh_sessions s
       JOIN eh_users u ON u.id = s.user_id
       WHERE s.token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  });

  if (!row) return null;
  if (row.revoked_at) return null;
  const expires = Date.parse(row.expires_at);
  if (!Number.isFinite(expires) || Date.now() >= expires) return null;

  let role: SiteMembershipRole | null = null;
  let resolvedSiteId: string | null = siteId ?? null;

  if (siteId) {
    role = await loadPortableMembershipRole(siteId, row.user_id);
    resolvedSiteId = siteId;
  }

  return {
    userId: row.user_id,
    email: row.email ?? null,
    role,
    siteId: resolvedSiteId
  };
}

export async function loadPortableMembershipRole(
  siteId: string,
  authUserId: string
): Promise<SiteMembershipRole | null> {
  if (!isPortableIdentityConfigured(loadEnv())) return null;

  const role = await withPortableClient(async (client) => {
    // Bypass RLS for membership lookup using connection owner; set claim for honesty
    await client.setAppUserId(authUserId);
    const result = await client.query<{ role: string }>(
      `SELECT role FROM eh_site_memberships
       WHERE site_id = $1 AND auth_user_id = $2::uuid
       LIMIT 1`,
      [siteId, authUserId]
    );
    return result.rows[0]?.role ?? null;
  });

  return asRole(role);
}

export async function loadPortableEntitlementSnapshot(
  siteId: string,
  authUserId: string
): Promise<EntitlementReadResult> {
  if (!isPortableIdentityConfigured(loadEnv())) {
    return {
      ok: false,
      reason: "Portable identity not configured.",
      tierIds: []
    };
  }

  const data = await withPortableClient(async (client) => {
    await client.setAppUserId(authUserId);
    const result = await client.query(
      `SELECT site_id, auth_user_id::text, tier_ids, source, reason,
              observed_at::text, stale_after::text,
              expires_at::text, revoked_at::text
       FROM eh_entitlement_snapshots
       WHERE site_id = $1 AND auth_user_id = $2::uuid
       LIMIT 1`,
      [siteId, authUserId]
    );
    return result.rows[0] ?? null;
  });

  if (data === null) {
    return {
      ok: false,
      reason: "Entitlement read unavailable (fail-closed).",
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
}

export type PortableLoginResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number };

/**
 * Email + password login. Sets httpOnly session cookie on success.
 * Requires portable identity env; never accepts soft persona.
 */
export async function portableLogin(
  email: string,
  password: string
): Promise<PortableLoginResult> {
  const env = loadEnv();
  if (!isPortableIdentityConfigured(env)) {
    return {
      ok: false,
      error: "Portable identity not configured.",
      status: 503
    };
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized || password.length < 8) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }

  const secret = env.ESCAPE_HATCH_SESSION_SECRET!;
  const user = await withPortableClient(async (client) => {
    const result = await client.query<{
      id: string;
      password_hash: string;
    }>(
      `SELECT id::text, password_hash FROM eh_users WHERE email = $1 LIMIT 1`,
      [normalized]
    );
    return result.rows[0] ?? null;
  });

  if (!user || !verifyPassword(password, user.password_hash)) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }

  const rawToken = mintSessionToken();
  const tokenHash = hashSessionToken(rawToken, secret);
  const sessionId = `sess_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + PORTABLE_SESSION_TTL_MS).toISOString();

  const inserted = await withPortableClient(async (client) => {
    await client.query(
      `INSERT INTO eh_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2::uuid, $3, $4::timestamptz)`,
      [sessionId, user.id, tokenHash, expiresAt]
    );
    return true;
  });

  if (!inserted) {
    return {
      ok: false,
      error: "Session create failed (database unavailable).",
      status: 503
    };
  }

  try {
    await writeCookie(
      PORTABLE_SESSION_COOKIE,
      rawToken,
      Math.floor(PORTABLE_SESSION_TTL_MS / 1000)
    );
  } catch {
    return {
      ok: false,
      error: "Session cookie unavailable outside request context.",
      status: 500
    };
  }

  return { ok: true, userId: user.id };
}

export async function portableLogout(): Promise<void> {
  const env = loadEnv();
  const rawToken = await readCookieValue(PORTABLE_SESSION_COOKIE);
  if (rawToken && isPortableIdentityConfigured(env)) {
    const tokenHash = hashSessionToken(
      rawToken,
      env.ESCAPE_HATCH_SESSION_SECRET!
    );
    await withPortableClient(async (client) => {
      await client.query(
        `UPDATE eh_sessions SET revoked_at = NOW()
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash]
      );
    });
  }
  try {
    await clearCookie(PORTABLE_SESSION_COOKIE);
  } catch {
    // best-effort
  }
}

/**
 * Staff revoke: mark all portable sessions for a user revoked (EH-061).
 * Supabase session revoke is not implemented here — returns not_supported.
 */
export async function portableRevokeAllSessionsForUser(
  userId: string
): Promise<{ ok: true; revoked: number } | { ok: false; error: string }> {
  const env = loadEnv();
  if (!isPortableIdentityConfigured(env)) {
    return { ok: false, error: "portable_not_configured" };
  }
  if (!userId.trim()) return { ok: false, error: "user_id_required" };
  try {
    const result = await withPortableClient(async (client) => {
      return client.query(
        `UPDATE eh_sessions SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId.trim()]
      );
    });
    return { ok: true, revoked: result?.rowCount ?? 0 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "revoke_failed"
    };
  }
}

/**
 * Bootstrap helper (server/scripts only): hash a password for SQL seed docs.
 * Not a public route.
 */
export function portableHashPasswordForBootstrap(password: string): string {
  return hashPassword(password);
}

export async function portableSessionIsSiteStaff(
  siteId: string,
  session: SiteAuthSession | null
): Promise<boolean> {
  if (!session) return false;
  if (session.siteId === siteId && isStaffRole(session.role)) {
    return true;
  }
  const role = await loadPortableMembershipRole(siteId, session.userId);
  return role === "admin" || role === "operator";
}
