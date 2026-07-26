import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * @fileoverview Supabase **service role** client factory (server-only).
 * @description Uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Bypasses end-user RLS — never expose to browsers.
 * @see src/lib/supabase-auth.ts Anon-key validation path for JWT verification
 * @security-audit-required Service role key is full database access; restrict to trusted server paths only.
 */

/**
 * @description Reads Supabase admin credentials from environment when both are set.
 * @returns {{ url: string, serviceRoleKey: string } | null} Pair or null when misconfigured.
 */
export function getSupabaseAdminEnv(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

/**
 * @description Builds a Supabase JS client with service role privileges (no session persistence).
 * @returns {SupabaseClient} Configured client.
 * @throws {Error} When `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` missing.
 * @async Client methods perform network I/O when invoked.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const env = getSupabaseAdminEnv();
  if (!env) {
    throw new Error(
      "Supabase admin requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in repo root `.env` (same project as DATABASE_URL)."
    );
  }
  return createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
