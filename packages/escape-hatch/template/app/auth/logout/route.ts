import { NextResponse } from "next/server";
import {
  isPortableIdentityConfigured,
  isSupabaseIdentityConfigured,
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Logout — POST only (HTTP verb hygiene). GETs must not mutate session.
 * Clears Supabase and/or portable session depending on active provider.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);

  if (mode === "supabase" && isSupabaseIdentityConfigured(env)) {
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Fail open to redirect — cookie clear best-effort.
    }
  }

  if (mode === "portable" && isPortableIdentityConfigured(env)) {
    try {
      const { portableLogout } = await import("@/lib/portable-auth/session");
      await portableLogout();
    } catch {
      // best-effort
    }
  }

  // Also clear portable cookie if present when provider is none (stale cookie)
  if (mode === "none" || mode === "invalid") {
    try {
      const { portableLogout } = await import("@/lib/portable-auth/session");
      await portableLogout();
    } catch {
      // best-effort
    }
  }

  return NextResponse.redirect(new URL("/login", url.origin), {
    status: 303
  });
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Logout requires POST.",
      production_safe: false
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
