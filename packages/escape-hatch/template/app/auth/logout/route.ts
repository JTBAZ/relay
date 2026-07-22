import { NextResponse } from "next/server";
import {
  isSupabaseIdentityConfigured,
  loadEnv
} from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Logout — POST only (HTTP verb hygiene). GETs must not mutate session.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);

  if (isSupabaseIdentityConfigured(loadEnv())) {
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Fail open to redirect — cookie clear best-effort.
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
