import { NextResponse } from "next/server";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadEnv } from "@/lib/env";
import { loadSite } from "@/lib/load-site";
import { loadDeployState } from "@/lib/deploy/state";
import { assessPathBRecipe } from "@/lib/deploy/path-b-recipe";
import { createDockerPreview } from "@/lib/deploy/docker-path";
import {
  acknowledgeDiagnostics,
  assessLaunchReadiness,
  completeLaunchWizard,
  markLaunchStep,
  selectLaunchPath,
  setLaunchStuckNote,
  type LaunchStepId
} from "@/lib/deploy/launch-wizard";
import {
  assessVercelDeployReadiness,
  createVercelPreview,
  promoteVercelDeployment,
  rollbackVercelDeployment
} from "@/lib/deploy/vercel-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deploy readiness + Path B recipe + launch wizard (EH-070/071/074). */
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
  const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? site.base_url;
  const readiness = assessVercelDeployReadiness({
    siteId: site.site_id,
    siteUrl
  });
  const state = loadDeployState(site.site_id);
  const path_b = assessPathBRecipe();
  const url = new URL(request.url);
  const includeWizard = url.searchParams.get("wizard") === "1";
  const launch = includeWizard
    ? assessLaunchReadiness({
        siteId: site.site_id,
        siteUrl,
        env
      })
    : undefined;

  return NextResponse.json({
    ok: true,
    readiness,
    path_b,
    ...(launch ? { launch } : {}),
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
 * Fixture deploy + launch wizard actions (EH-070/071/074).
 * Deploy: preview | promote | rollback (never live Vercel/Docker).
 * Wizard: wizard_select_path | wizard_mark_step | wizard_stuck |
 *         wizard_ack_diagnostics | wizard_complete.
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

  const env = loadEnv();
  const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? site.base_url;
  const launchOpts = {
    siteId: site.site_id,
    siteUrl,
    env
  };

  const wizardAction = String(body.action ?? "");
  if (wizardAction === "wizard_select_path") {
    const path =
      body.path === "docker" || body.path === "vercel" ? body.path : null;
    if (!path) {
      return NextResponse.json(
        { ok: false, error: "path_required", production_safe: false },
        { status: 400 }
      );
    }
    selectLaunchPath(site.site_id, path);
    return NextResponse.json({
      ok: true,
      action: wizardAction,
      launch: assessLaunchReadiness(launchOpts),
      production_safe: false
    });
  }

  if (wizardAction === "wizard_mark_step") {
    const stepId = String(body.step_id ?? "") as LaunchStepId;
    const status =
      body.status === "verified" || body.status === "pending"
        ? body.status
        : "verified";
    markLaunchStep(site.site_id, stepId, status);
    return NextResponse.json({
      ok: true,
      action: wizardAction,
      launch: assessLaunchReadiness(launchOpts),
      production_safe: false
    });
  }

  if (wizardAction === "wizard_stuck") {
    const note = typeof body.note === "string" ? body.note : null;
    setLaunchStuckNote(site.site_id, note);
    return NextResponse.json({
      ok: true,
      action: wizardAction,
      launch: assessLaunchReadiness(launchOpts),
      production_safe: false
    });
  }

  if (wizardAction === "wizard_ack_diagnostics") {
    acknowledgeDiagnostics(site.site_id);
    return NextResponse.json({
      ok: true,
      action: wizardAction,
      launch: assessLaunchReadiness(launchOpts),
      production_safe: false
    });
  }

  if (wizardAction === "wizard_complete") {
    const result = completeLaunchWizard(launchOpts);
    return NextResponse.json(
      {
        ok: result.ok,
        action: wizardAction,
        launch: result.readiness,
        error: result.error,
        production_safe: false
      },
      { status: result.ok ? 200 : 400 }
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

  const path =
    body.path === "docker" || body.path === "vercel" ? body.path : "vercel";

  if (action === "preview") {
    const domain =
      typeof body.domain === "string" ? body.domain : null;
    const result =
      path === "docker"
        ? await createDockerPreview({
            siteId: site.site_id,
            domain
          })
        : await createVercelPreview({
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
      path,
      record: result.record,
      readiness: assessVercelDeployReadiness({
        siteId: site.site_id,
        siteUrl
      }),
      path_b: assessPathBRecipe(),
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
      path,
      record: result.record,
      readiness: assessVercelDeployReadiness({
        siteId: site.site_id,
        siteUrl
      }),
      path_b: assessPathBRecipe(),
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
    path,
    record: result.record,
    restored: result.restored,
    readiness: assessVercelDeployReadiness({
      siteId: site.site_id,
      siteUrl
    }),
    path_b: assessPathBRecipe(),
    production_safe: false
  });
}
