/**
 * Browser Supabase client (anon key only — RLS enforced).
 * Never use the service role here.
 */

import { createBrowserClient } from "@supabase/ssr";
import {
  isSupabaseIdentityConfigured,
  loadEnv,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl
} from "../env";

export function createBrowserSupabaseClient() {
  const env = loadEnv();
  if (!isSupabaseIdentityConfigured(env)) {
    throw new Error(
      "Supabase identity is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  const url = resolveSupabaseUrl(env)!;
  const anonKey = resolveSupabaseAnonKey(env)!;
  return createBrowserClient(url, anonKey);
}

export function tryCreateBrowserSupabaseClient() {
  try {
    if (!isSupabaseIdentityConfigured()) return null;
    return createBrowserSupabaseClient();
  } catch {
    return null;
  }
}
