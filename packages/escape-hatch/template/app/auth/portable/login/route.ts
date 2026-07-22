import { NextResponse } from "next/server";
import {
  isPortableIdentityConfigured,
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { portableLogin } from "@/lib/portable-auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Portable email/password login — POST only.
 * Sets httpOnly session cookie on success.
 */
export async function POST(request: Request) {
  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);
  if (mode === "invalid") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unknown ESCAPE_HATCH_IDENTITY_PROVIDER. Use none, supabase, or portable.",
        production_safe: false
      },
      { status: 500 }
    );
  }
  if (mode !== "portable" || !isPortableIdentityConfigured(env)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Portable identity is not the active provider.",
        production_safe: false
      },
      { status: 503 }
    );
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body.", production_safe: false },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const result = await portableLogin(email, password);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, production_safe: false },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    production_safe: false
  });
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Portable login requires POST.",
      production_safe: false
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
