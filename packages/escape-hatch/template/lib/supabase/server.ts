/**
 * Server Supabase clients (EH-030).
 * User-scoped client uses cookies + anon key (RLS applies).
 * Service-role client is server-only and must never be imported from client components.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  isSupabaseIdentityConfigured,
  isSupabaseServiceRoleConfigured,
  loadEnv,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl
} from "../env";

export async function createServerSupabaseClient() {
  const env = loadEnv();
  if (!isSupabaseIdentityConfigured(env)) {
    throw new Error(
      "Supabase identity is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or server aliases)."
    );
  }

  const url = resolveSupabaseUrl(env)!;
  const anonKey = resolveSupabaseAnonKey(env)!;
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component without mutable cookies — middleware
          // or route handlers refresh sessions when needed.
        }
      }
    }
  });
}

/**
 * Service-role client — bypasses RLS. Server-only bootstrap/recovery paths.
 * Never import from client components or expose to the browser.
 */
export function createServiceRoleSupabaseClient() {
  const env = loadEnv();
  const url = resolveSupabaseUrl(env);
  if (!url || !isSupabaseServiceRoleConfigured(env)) {
    throw new Error(
      "Supabase service role is not configured. Set SUPABASE_SERVICE_ROLE_KEY (server-only)."
    );
  }
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
