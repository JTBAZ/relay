import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for the same Supabase project as `DATABASE_URL` / `SUPABASE_URL`.
 * Never expose the service role key to browsers or commit it.
 */
export function getSupabaseAdminEnv(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

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
