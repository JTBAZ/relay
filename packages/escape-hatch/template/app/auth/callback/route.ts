import { NextResponse } from "next/server";
import {
  isSupabaseIdentityConfigured,
  loadEnv
} from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth / magic-link callback. Exchanges the auth code for a session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/admin";

  if (!isSupabaseIdentityConfigured(loadEnv())) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      return NextResponse.redirect(
        new URL("/login?error=callback", url.origin)
      );
    }
  }

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
