import { NextResponse } from "next/server";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadEnv } from "@/lib/env";
import { loadSite } from "@/lib/load-site";
import {
  isCreatorOAuthConfigured,
  loadCreatorOAuthConfig,
  resolvePatreonMode
} from "@/lib/patreon";
import {
  conflictCount,
  loadPatreonSyncState
} from "@/lib/patreon/sync-state";
import {
  runPatreonTransitionSync,
  type UpstreamPatreonPost
} from "@/lib/patreon/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read sync status + conflict queue (EH-063). */
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

  const state = loadPatreonSyncState(site.site_id);
  return NextResponse.json({
    ok: true,
    production_safe: false,
    last_sync_at: state.last_sync_at,
    last_status: state.last_status,
    last_error: state.last_error,
    conflict_count: conflictCount(state),
    conflict_queue: state.conflict_queue,
    tracked_posts: Object.keys(state.posts).length
  });
}

/**
 * Manual read-only Patreon transition sync (EH-063).
 * Body may include `fixture_posts` for local/CI (never used as production proof).
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

  const env = loadEnv();
  const mode = resolvePatreonMode(env);
  if (mode !== "creator_oauth") {
    return NextResponse.json(
      {
        ok: false,
        error: "creator_oauth_required",
        detail:
          "EH-063 post sync is creator_oauth only. Relay-managed mode does not pull CMS posts.",
        production_safe: false
      },
      { status: 400 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const fixture = Array.isArray(body.fixture_posts)
    ? (body.fixture_posts as UpstreamPatreonPost[])
    : null;

  if (!fixture && !isCreatorOAuthConfigured(env)) {
    return NextResponse.json(
      {
        ok: false,
        error: "patreon_oauth_not_configured",
        detail:
          "Configure creator OAuth env or pass fixture_posts for local preview.",
        production_safe: false
      },
      { status: 400 }
    );
  }

  const campaignId =
    (fixture
      ? "fixture_campaign"
      : loadCreatorOAuthConfig(env)?.campaignId) ?? "unknown";

  const result = await runPatreonTransitionSync({
    siteId: site.site_id,
    campaignId,
    fetchPosts: async () => {
      if (fixture) return fixture;
      // Live network fetch intentionally not wired in EH-063 MVP —
      // operators use fixture_posts in preview or a later adapter slice.
      throw new Error(
        "live_patreon_posts_fetch_not_wired — pass fixture_posts for preview sync"
      );
    }
  });

  return NextResponse.json(
    {
      ...result,
      mapped_via: fixture ? "fixture_posts" : "live_deferred"
    },
    { status: result.ok ? 200 : 502 }
  );
}
