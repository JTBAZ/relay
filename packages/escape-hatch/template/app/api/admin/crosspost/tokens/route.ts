import { NextResponse } from "next/server";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";
import {
  CROSSPOST_SCOPES,
  listCrosspostTokensPublic,
  mintCrosspostToken,
  revokeCrosspostToken,
  type CrosspostScope
} from "@/lib/relay-crosspost/tokens";
import { loadCrosspostAudit } from "@/lib/relay-crosspost/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List Crosspost tokens (prefix only) + recent audit (EH-064). */
export async function GET(request: Request): Promise<NextResponse> {
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

  const tokens = listCrosspostTokensPublic(site.site_id);
  const audit = loadCrosspostAudit(site.site_id);
  return NextResponse.json({
    ok: true,
    scopes_available: [...CROSSPOST_SCOPES],
    tokens,
    audit_entries: audit.entries.slice(0, 40),
    production_safe: false
  });
}

/** Mint a scoped Crosspost Bearer token (secret returned once). */
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", production_safe: false },
      { status: 400 }
    );
  }

  const scopesRaw = Array.isArray(body.scopes) ? body.scopes : [];
  const scopes = scopesRaw.filter((s): s is CrosspostScope =>
    (CROSSPOST_SCOPES as readonly string[]).includes(String(s))
  );

  const minted = mintCrosspostToken({
    siteId: site.site_id,
    scopes,
    label: typeof body.label === "string" ? body.label : undefined,
    expires_at:
      typeof body.expires_at === "string" ? body.expires_at : null,
    pepper: process.env.ESCAPE_HATCH_CROSSPOST_TOKEN_PEPPER ?? ""
  });

  if (!minted.ok) {
    return NextResponse.json(
      { ok: false, error: minted.reason, production_safe: false },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    secret: minted.secret,
    token: minted.record,
    note: "Copy the secret now — it is never shown again.",
    production_safe: false
  });
}

/** Revoke a Crosspost token by token_id. */
export async function DELETE(request: Request): Promise<NextResponse> {
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

  let token_id: string | null = null;
  try {
    const url = new URL(request.url);
    token_id = url.searchParams.get("token_id");
    if (!token_id) {
      const body = (await request.json()) as { token_id?: string };
      token_id = typeof body.token_id === "string" ? body.token_id : null;
    }
  } catch {
    /* empty */
  }

  if (!token_id) {
    return NextResponse.json(
      { ok: false, error: "token_id_required", production_safe: false },
      { status: 400 }
    );
  }

  const revoked = revokeCrosspostToken(site.site_id, token_id);
  if (!revoked.ok) {
    return NextResponse.json(
      { ok: false, error: revoked.reason, production_safe: false },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    token: {
      token_id: revoked.record.token_id,
      prefix: revoked.record.prefix,
      revoked_at: revoked.record.revoked_at
    },
    production_safe: false
  });
}
