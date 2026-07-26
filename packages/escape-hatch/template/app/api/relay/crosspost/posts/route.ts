import { NextResponse } from "next/server";
import { loadSite } from "@/lib/load-site";
import { ingestCrosspostPost } from "@/lib/relay-crosspost/ingest";
import { authenticateCrosspostBearer } from "@/lib/relay-crosspost/tokens";
import type { AccessLevel } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound Relay Crosspost draft/publish (EH-064).
 * Bearer scoped tokens only — never elevates to admin.
 */
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

  const auth = authenticateCrosspostBearer(
    site.site_id,
    request.headers.get("authorization"),
    {
      pepper: process.env.ESCAPE_HATCH_CROSSPOST_TOKEN_PEPPER ?? ""
    }
  );
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason, production_safe: false },
      { status: auth.status }
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

  const action =
    body.action === "publish" || body.action === "draft"
      ? body.action
      : null;
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "action_required", production_safe: false },
      { status: 400 }
    );
  }

  const title = typeof body.title === "string" ? body.title : "";
  const upstream_id =
    typeof body.upstream_id === "string" ? body.upstream_id : "";
  const access_level =
    body.access_level === "public" ||
    body.access_level === "member_only" ||
    body.access_level === "tier_gated"
      ? (body.access_level as AccessLevel)
      : undefined;
  const tier_ids = Array.isArray(body.tier_ids)
    ? body.tier_ids.filter((t): t is string => typeof t === "string")
    : undefined;

  const idempotency_key =
    request.headers.get("idempotency-key")?.trim() ||
    (typeof body.idempotency_key === "string"
      ? body.idempotency_key.trim()
      : null);

  const result = ingestCrosspostPost({
    siteId: site.site_id,
    token: auth.token,
    action,
    title,
    body_plain:
      typeof body.body_plain === "string" ? body.body_plain : null,
    access_level,
    tier_ids,
    slug: typeof body.slug === "string" ? body.slug : undefined,
    upstream_id,
    upstream_revision:
      typeof body.upstream_revision === "string"
        ? body.upstream_revision
        : null,
    idempotency_key
  });

  return NextResponse.json(result.body, { status: result.status });
}
