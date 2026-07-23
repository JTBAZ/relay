import { NextResponse } from "next/server";
import {
  describeAccessReason,
  loadManualGrants,
  revokeManualGrant,
  upsertManualGrant
} from "@/lib/cms/grants";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";
import { evaluateAccess } from "@/lib/entitlements/evaluate";
import { manualGrantsForSubject } from "@/lib/cms/grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List local manual grants (EH-061). */
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

  const doc = loadManualGrants(site.site_id);
  return NextResponse.json({
    ok: true,
    grants: doc.grants,
    production_safe: false
  });
}

/** Upsert a local manual grant. */
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

  if (body.action === "inspect") {
    const subjectKey =
      typeof body.subject_key === "string" ? body.subject_key.trim() : "";
    const postId =
      typeof body.post_id === "string" ? body.post_id.trim() : "";
    const post = site.posts.find((p) => p.post_id === postId) ?? site.posts[0];
    if (!post) {
      return NextResponse.json(
        { ok: false, error: "no_posts", production_safe: false },
        { status: 400 }
      );
    }
    const grants = subjectKey
      ? manualGrantsForSubject(site.site_id, subjectKey)
      : [];
    const evaluation = evaluateAccess({
      subject: subjectKey
        ? {
            kind: "member",
            userId: subjectKey,
            provider: "portable",
            role: "patron",
            siteId: site.site_id
          }
        : { kind: "anonymous" },
      resource: {
        type: "post",
        id: post.post_id,
        siteId: site.site_id,
        accessLevel: post.access.level,
        tierIds: post.access.tier_ids,
        matchMode: post.access.match_mode,
        publishedAt: post.published_at
      },
      grants,
      provider: "portable",
      tierCatalog: Object.fromEntries(
        site.tiers.map((t) => [
          t.tier_id,
          { amount_cents: t.amount_cents ?? null, title: t.title }
        ])
      )
    });
    return NextResponse.json({
      ok: true,
      post_id: post.post_id,
      evaluation,
      reason_label: describeAccessReason(
        evaluation.reason,
        evaluation.detail
      ),
      production_safe: false
    });
  }

  const result = upsertManualGrant({
    site_id: site.site_id,
    subject_key:
      typeof body.subject_key === "string" ? body.subject_key : "",
    tier_ids: Array.isArray(body.tier_ids)
      ? body.tier_ids.filter((t): t is string => typeof t === "string")
      : [],
    reason: typeof body.reason === "string" ? body.reason : "",
    actor: typeof body.actor === "string" ? body.actor : "local-operator",
    expires_at:
      body.expires_at === null
        ? null
        : typeof body.expires_at === "string"
          ? body.expires_at
          : undefined,
    grant_id: typeof body.grant_id === "string" ? body.grant_id : undefined
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    grant: result.grant,
    production_safe: false
  });
}

/** Revoke a local manual grant. */
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

  const url = new URL(request.url);
  const grantId = url.searchParams.get("grant_id") ?? "";
  if (!grantId) {
    return NextResponse.json(
      { ok: false, error: "grant_id_required", production_safe: false },
      { status: 400 }
    );
  }

  const result = revokeManualGrant(site.site_id, grantId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    grant: result.grant,
    production_safe: false
  });
}
