import { NextResponse } from "next/server";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadEnv } from "@/lib/env";
import { loadSite } from "@/lib/load-site";
import { loadDeployState } from "@/lib/deploy/state";
import {
  assessVercelDeployReadiness,
  createVercelPreview,
  promoteVercelDeployment,
  rollbackVercelDeployment
} from "@/lib/deploy/vercel-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deploy readiness + state (EH-070). */
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

  const env = loadEnv();
  const readiness = assessVercelDeployReadiness({
    siteId: site.site_id,
    siteUrl: env.NEXT_PUBLIC_SITE_URL ?? site.base_url
  });
  const state = loadDeployState(site.site_id);

  return NextResponse.json({
    ok: true,
    readiness,
    state: {
      active_deployment_id: state.active_deployment_id,
      previous_stable_deployment_id: state.previous_stable_deployment_id,
      last_rehearsal_at: state.last_rehearsal_at,
      deployments: state.deployments.slice(0, 10)
    },
    production_safe: false
  });
}

/**
 * Fixture Vercel golden-path actions: preview | promote | rollback.
 * Never calls live Vercel APIs.
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

  const action =
    body.action === "preview" ||
    body.action === "promote" ||
    body.action === "rollback"
      ? body.action
      : null;
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "action_required", production_safe: false },
      { status: 400 }
    );
  }

  const env = loadEnv();
  const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? site.base_url;

  if (action === "preview") {
    const domain =
      typeof body.domain === "string" ? body.domain : null;
    const result = await createVercelPreview({
      siteId: site.site_id,
      domain
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.reason, production_safe: false },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      action,
      record: result.record,
      readiness: assessVercelDeployReadiness({
        siteId: site.site_id,
        siteUrl
      }),
      production_safe: false
    });
  }

  if (action === "promote") {
    const deploymentId =
      typeof body.deployment_id === "string"
        ? body.deployment_id
        : null;
    if (!deploymentId) {
      return NextResponse.json(
        { ok: false, error: "deployment_id_required", production_safe: false },
        { status: 400 }
      );
    }
    const result = promoteVercelDeployment({
      siteId: site.site_id,
      deploymentId,
      siteUrl
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.reason, production_safe: false },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      action,
      record: result.record,
      readiness: assessVercelDeployReadiness({
        siteId: site.site_id,
        siteUrl
      }),
      production_safe: false
    });
  }

  const deploymentId =
    typeof body.deployment_id === "string" ? body.deployment_id : null;
  const result = rollbackVercelDeployment({
    siteId: site.site_id,
    deploymentId
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    action,
    record: result.record,
    restored: result.restored,
    readiness: assessVercelDeployReadiness({
      siteId: site.site_id,
      siteUrl
    }),
    production_safe: false
  });
}
