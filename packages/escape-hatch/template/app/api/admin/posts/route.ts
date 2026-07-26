import { NextResponse } from "next/server";
import {
  deletePost,
  upsertPost,
  type UpsertPostInput
} from "@/lib/cms/posts";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create or update a post in data/site.json (EH-060).
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", production_safe: false },
      { status: 400 }
    );
  }

  const level = body.access_level;
  if (
    level !== "public" &&
    level !== "member_only" &&
    level !== "tier_gated"
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_access_level", production_safe: false },
      { status: 400 }
    );
  }

  const input: UpsertPostInput = {
    post_id: typeof body.post_id === "string" ? body.post_id : undefined,
    title: typeof body.title === "string" ? body.title : "",
    slug: typeof body.slug === "string" ? body.slug : undefined,
    published_at:
      typeof body.published_at === "string" ? body.published_at : undefined,
    tag_ids: Array.isArray(body.tag_ids)
      ? body.tag_ids.filter((t): t is string => typeof t === "string")
      : undefined,
    access_level: level,
    tier_ids: Array.isArray(body.tier_ids)
      ? body.tier_ids.filter((t): t is string => typeof t === "string")
      : undefined,
    status:
      body.status === "draft" || body.status === "published"
        ? body.status
        : undefined,
    feature_order:
      body.feature_order === null
        ? null
        : typeof body.feature_order === "number"
          ? body.feature_order
          : undefined,
    public_cover_media_id:
      body.public_cover_media_id === null
        ? null
        : typeof body.public_cover_media_id === "string"
          ? body.public_cover_media_id
          : undefined,
    body_plain:
      body.body_plain === null
        ? null
        : typeof body.body_plain === "string"
          ? body.body_plain
          : undefined
  };

  const result = upsertPost(input);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    post: result.post,
    production_safe: false
  });
}

/**
 * Delete a post from data/site.json (EH-060).
 */
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

  let body: { post_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", production_safe: false },
      { status: 400 }
    );
  }
  const postId = typeof body.post_id === "string" ? body.post_id.trim() : "";
  if (!postId) {
    return NextResponse.json(
      { ok: false, error: "post_id_required", production_safe: false },
      { status: 400 }
    );
  }

  const result = deletePost(postId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, production_safe: false });
}
