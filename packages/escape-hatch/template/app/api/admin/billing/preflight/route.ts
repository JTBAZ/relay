import { NextResponse } from "next/server";
import {
  loadBillingTierMap,
  runBillingTierPreflight
} from "@/lib/billing";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Run billing tier wizard preflight (EH-054). Admin mutation gate (POST).
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

  const map = loadBillingTierMap(site.site_id);
  const report = runBillingTierPreflight({
    siteId: site.site_id,
    catalog: site.tiers,
    map
  });

  return NextResponse.json({
    ok: true,
    report,
    production_safe: false
  });
}
