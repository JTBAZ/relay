import { NextResponse } from "next/server";
import {
  isContentUseCategory,
  routeProviderPolicy,
  saveContentUseAttestation,
  type ContentUseCategory
} from "@/lib/billing/policy";
import { assertAdminReadAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save content/use attestation (EH-052). Admin-only. No secrets in body.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const site = loadSite();
  const read = await assertAdminReadAccess(site.site_id);
  if (!read.allowed) {
    return NextResponse.json(
      { ok: false, error: read.reason, production_safe: false },
      { status: 403 }
    );
  }

  let body: {
    category?: unknown;
    acceptedProviderTerms?: unknown;
    affirmedAccurate?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", production_safe: false },
      { status: 400 }
    );
  }

  if (!isContentUseCategory(body.category)) {
    return NextResponse.json(
      { ok: false, error: "invalid_category", production_safe: false },
      { status: 400 }
    );
  }

  const saved = saveContentUseAttestation({
    siteId: site.site_id,
    category: body.category as ContentUseCategory,
    acceptedProviderTerms: body.acceptedProviderTerms === true,
    affirmedAccurate: body.affirmedAccurate === true,
    attestedByHint:
      read.identity.mode !== "local_preview"
        ? read.identity.session?.userId ?? null
        : "local_preview"
  });

  if (!saved.ok) {
    return NextResponse.json(
      { ok: false, error: saved.reason, production_safe: false },
      { status: 400 }
    );
  }

  const decision = routeProviderPolicy(saved.attestation);
  return NextResponse.json({
    ok: true,
    attestation: saved.attestation,
    decision,
    production_safe: false
  });
}
