import { createClient, type User } from "@supabase/supabase-js";

/**
 * @fileoverview Supabase Auth JWT validation using the **anon** key (server-side).
 * @description Pairs with the same Supabase project as Postgres `DATABASE_URL`.
 * @see src/identity/supabase-account.ts Account linking flows
 * @security-audit-required Validates bearer tokens; downstream must map `user.id` to Relay `account_id` / `tenant_id`.
 */

/**
 * @description Reads public Supabase URL and anon key for Auth API calls.
 * @returns {{ url: string, anonKey: string } | null} Config or null when unset.
 */
export function getSupabaseUrlAndAnonKey(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * @description Discriminated result for Supabase `getUser` validation.
 * @typedef {Object} SupabaseUserResult
 */
export type SupabaseUserResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

/**
 * @async
 * @description Validates a Supabase Auth access token (JWT) and returns the Auth user. Network/auth errors are returned as `ok: false` (no throw for typical Supabase auth failures).
 * @param {string} accessToken Raw JWT from `Authorization: Bearer`.
 * @returns {Promise<SupabaseUserResult>} Success with `User` or structured failure string.
 * @todo Consider caching validated JWT claims per request-id to reduce repeated `getUser` round-trips.
 */
export async function getSupabaseUserFromAccessToken(accessToken: string): Promise<SupabaseUserResult> {
  const env = getSupabaseUrlAndAnonKey();
  if (!env) {
    return { ok: false, error: "Supabase is not configured (SUPABASE_URL and SUPABASE_ANON_KEY)." };
  }
  const supabase = createClient(env.url, env.anonKey);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Invalid or expired access token." };
  }
  return { ok: true, user: data.user };
}
