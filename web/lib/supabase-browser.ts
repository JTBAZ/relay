import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Browser Supabase client for email/password studio onboarding (MT-036).
 * Returns null when env is not configured — UI should show setup instructions.
 *
 * Env var resolution order (first non-empty wins):
 *   1. NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY  ← set these in Coolify
 *   2. NEXT_PUBLIC_SUPABASE_STAGING_URL / STAGING_ANON_KEY       ← local dev (.env.local)
 *   3. NEXT_PUBLIC_SUPABASE_PRODUCTION_URL / PRODUCTION_ANON_KEY ← legacy split (kept for compat)
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) {
    return cached;
  }
  const prod = process.env.NODE_ENV === "production";
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (prod
      ? process.env.NEXT_PUBLIC_SUPABASE_PRODUCTION_URL
      : process.env.NEXT_PUBLIC_SUPABASE_STAGING_URL)
  )?.trim();
  const anon = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (prod
      ? process.env.NEXT_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_STAGING_ANON_KEY)
  )?.trim();
  if (!url || !anon) {
    cached = null;
    return null;
  }
  cached = createClient(url, anon);
  return cached;
}
