import { createClient, type User } from "@supabase/supabase-js";

/** Active Supabase project (must align with `DATABASE_URL` / same Supabase Postgres). */
export function getSupabaseUrlAndAnonKey(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Validates a Supabase Auth access token (JWT) and returns the Auth user.
 * Uses the anon key — safe for server-side token validation only (no service role).
 */
export type SupabaseUserResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

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
