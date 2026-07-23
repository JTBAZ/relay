import { NextResponse } from "next/server";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import {
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { loadSite } from "@/lib/load-site";
import { portableRevokeAllSessionsForUser } from "@/lib/portable-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Staff revoke portable sessions for a user (EH-061). */
export async function POST(request: Request): Promise<NextResponse> {
  let site;
  try {
    site = loadSite();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to load site.",
        production_safe: false
      },
      { status: 400 }
    );
  }

  const access = await assertAdminMutationAccess(request, site.site_id);
  if (!access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: access.error,
        mode: access.mode,
        production_safe: false
      },
      { status: access.status }
    );
  }

  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);
  if (mode !== "portable") {
    return NextResponse.json(
      {
        ok: false,
        error: "session_revoke_portable_only",
        detail:
          "Staff session revoke is implemented for Path B (portable) only in EH-061. Supabase revoke remains open.",
        production_safe: false
      },
      { status: 501 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", production_safe: false },
      { status: 400 }
    );
  }

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const result = await portableRevokeAllSessionsForUser(userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, production_safe: false },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    revoked: result.revoked,
    production_safe: false
  });
}
