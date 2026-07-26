import { NextResponse } from "next/server";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";
import {
  assessOwnershipReadiness,
  buildOwnershipPacket,
  generateOwnershipPacket,
  loadOwnershipState
} from "@/lib/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ownership packet status (EH-080). */
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

  const url = new URL(request.url);
  const readiness = assessOwnershipReadiness({ siteId: site.site_id });
  const state = loadOwnershipState(site.site_id);

  if (url.searchParams.get("download") === "1") {
    const packet =
      readiness.packet_generated && state.packet_path
        ? buildOwnershipPacket({ siteId: site.site_id })
        : null;
    if (!packet) {
      return NextResponse.json(
        {
          ok: false,
          error: "packet_not_generated",
          readiness,
          production_safe: false
        },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      packet,
      production_safe: false
    });
  }

  return NextResponse.json({
    ok: true,
    readiness,
    state: {
      last_generated_at: state.last_generated_at,
      packet_path: state.packet_path,
      last_error: state.last_error
    },
    production_safe: false
  });
}

/** Generate ownership packet (fixture; no secrets). */
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

  const result = generateOwnershipPacket({ siteId: site.site_id });
  return NextResponse.json(
    {
      ok: result.ok,
      packet: result.packet
        ? {
            generated_at: result.packet.generated_at,
            slice: result.packet.source_package.slice,
            credential_count: result.packet.credentials.length,
            warranty_ends_at: result.packet.warranty.warranty_ends_at,
            production_safe: false as const
          }
        : null,
      readiness: assessOwnershipReadiness({ siteId: site.site_id }),
      state: result.state,
      error: result.error,
      production_safe: false
    },
    { status: result.ok ? 200 : 400 }
  );
}
