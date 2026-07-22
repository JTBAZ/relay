import { NextResponse } from "next/server";
import {
  clearAdminAttention,
  markAdminAttention
} from "@/lib/admin/attention";
import { loadSite } from "@/lib/load-site";
import { assertLocalOperatorMutation } from "@/lib/library-truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  post_id?: string;
  note?: string;
};

/**
 * Admin attention marks — local-prototype operator only (header + loopback).
 * Not authentication. Does not delete export blobs or change entitlements.
 */
export async function POST(request: Request) {
  const access = assertLocalOperatorMutation(request, "Admin");
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.error, production_safe: false },
      { status: access.status }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected JSON body.", production_safe: false },
      { status: 400 }
    );
  }

  const postId = body.post_id?.trim();
  if (!postId) {
    return NextResponse.json(
      { ok: false, error: "post_id is required.", production_safe: false },
      { status: 400 }
    );
  }

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

  if (!site.posts.some((p) => p.post_id === postId)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unknown post_id: ${postId}`,
        production_safe: false
      },
      { status: 404 }
    );
  }

  if (body.action === "mark") {
    const state = markAdminAttention(
      site.site_id,
      postId,
      body.note ?? "Needs attention"
    );
    return NextResponse.json({
      ok: true,
      state,
      production_safe: false
    });
  }

  if (body.action === "clear") {
    const state = clearAdminAttention(site.site_id, postId);
    return NextResponse.json({
      ok: true,
      state,
      production_safe: false
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Unknown action. Use mark or clear.",
      production_safe: false
    },
    { status: 400 }
  );
}
