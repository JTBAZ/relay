import { NextResponse } from "next/server";
import {
  isContentUseCategory,
  routeProviderPolicy,
  saveContentUseAttestation,
  type ContentUseCategory
} from "@/lib/billing/policy";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save content/use attestation (EH-052). Admin mutation gate.
 * No secrets in body. Local preview requires loopback + x-escape-hatch-local.
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
    attestedByHint: access.userId ?? (access.mode === "local_preview" ? "local_preview" : null)
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
