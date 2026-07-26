import { NextResponse } from "next/server";
import { upsertTier, type UpsertTierInput } from "@/lib/cms/tiers";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create/update/retire a tier in data/site.json (EH-061). */
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

  const input: UpsertTierInput = {
    tier_id: typeof body.tier_id === "string" ? body.tier_id : "",
    title: typeof body.title === "string" ? body.title : undefined,
    access_level:
      body.access_level === "public" ||
      body.access_level === "member_only" ||
      body.access_level === "tier_gated"
        ? body.access_level
        : undefined,
    amount_cents:
      body.amount_cents === null
        ? null
        : typeof body.amount_cents === "number"
          ? body.amount_cents
          : undefined,
    benefit_copy:
      body.benefit_copy === null
        ? null
        : typeof body.benefit_copy === "string"
          ? body.benefit_copy
          : undefined,
    retired: typeof body.retired === "boolean" ? body.retired : undefined
  };

  const result = upsertTier(input);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    tier: result.tier,
    affected_posts: result.affected_posts,
    production_safe: false
  });
}
