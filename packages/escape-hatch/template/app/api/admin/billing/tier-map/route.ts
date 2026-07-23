import { NextResponse } from "next/server";
import { saveBillingTierMap } from "@/lib/billing";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save billing tier → price map (EH-054). Admin mutation gate.
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

  let body: { entries?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", production_safe: false },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.entries)) {
    return NextResponse.json(
      { ok: false, error: "entries_required", production_safe: false },
      { status: 400 }
    );
  }

  const saved = saveBillingTierMap({
    siteId: site.site_id,
    entries: body.entries as Parameters<typeof saveBillingTierMap>[0]["entries"]
  });

  if (!saved.ok) {
    return NextResponse.json(
      { ok: false, error: saved.reason, production_safe: false },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    document: saved.document,
    production_safe: false
  });
}
