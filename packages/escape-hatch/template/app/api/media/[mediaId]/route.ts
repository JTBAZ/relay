/**
 * Authenticated / entitlement-gated media delivery (EH-033).
 *
 * Flow: auth subject + soft-persona cookie (provider none only) →
 * evaluateAccess(media) → short-lived signed R2 redirect or local_private stream.
 *
 * Premium bytes must not be world-readable under public/media when private mode is on.
 */

import { NextResponse } from "next/server";
import { deliverMedia } from "@/lib/media/delivery";
import { assertSafeMediaId } from "@/lib/media/keys";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ mediaId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { mediaId: rawId } = await context.params;
  let mediaId: string;
  try {
    mediaId = decodeURIComponent(rawId ?? "").trim();
    assertSafeMediaId(mediaId);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_media_id",
        detail: "Invalid media id.",
        production_safe: false
      },
      {
        status: 400,
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  }

  let site;
  try {
    site = loadSite();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "site_unavailable",
        detail: "Site bundle unavailable.",
        production_safe: false
      },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  }

  const result = await deliverMedia({
    site,
    mediaId,
    cookieHeader: request.headers.get("cookie")
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.reason,
        detail: result.detail,
        production_safe: false
      },
      {
        status: result.status,
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  }

  if (result.kind === "redirect") {
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: result.url,
        "Cache-Control": result.cacheControl,
        "Referrer-Policy": "no-referrer"
      }
    });
  }

  if (result.kind === "public_path") {
    // Relative redirect within the site — never to an absolute foreign host.
    if (
      result.path.includes("://") ||
      result.path.includes("\\") ||
      result.path.includes("..")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "unsafe_public_path",
          detail: "Refusing unsafe public media path.",
          production_safe: false
        },
        {
          status: 503,
          headers: { "Cache-Control": "private, no-store" }
        }
      );
    }
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: result.path,
        "Cache-Control": result.cacheControl
      }
    });
  }

  return new NextResponse(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": result.cacheControl,
      "X-Content-Type-Options": "nosniff"
    }
  });
}
