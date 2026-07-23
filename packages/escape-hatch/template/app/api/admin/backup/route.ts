import { NextResponse } from "next/server";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import {
  assessBackupReadiness,
  buildDiagnosticBundle,
  loadBackupState,
  runIsolatedRestoreRehearsal,
  runScheduledBackup
} from "@/lib/backup";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Backup schedule / readiness (EH-073). */
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
  if (url.searchParams.get("diagnostics") === "1") {
    const bundle = buildDiagnosticBundle({ siteId: site.site_id });
    if (!bundle) {
      return NextResponse.json(
        { ok: false, error: "diagnostics_unavailable", production_safe: false },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      diagnostics: bundle,
      production_safe: false
    });
  }

  const state = loadBackupState(site.site_id);
  const readiness = assessBackupReadiness({ siteId: site.site_id });

  return NextResponse.json({
    ok: true,
    readiness,
    schedule: state.schedule,
    backups: state.backups.slice(0, 10),
    last_rehearsal: state.last_rehearsal,
    previous_stable: state.previous_stable,
    production_safe: false
  });
}

/**
 * Fixture backup or isolated restore rehearsal.
 * Actions: run_backup | restore_rehearsal
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

  const action = String(body.action ?? "run_backup");

  if (action === "run_backup") {
    const result = runScheduledBackup({ siteId: site.site_id });
    return NextResponse.json(
      {
        ok: result.ok,
        action: "run_backup",
        artifact: result.artifact,
        readiness: assessBackupReadiness({ siteId: site.site_id }),
        error: result.error,
        production_safe: false
      },
      { status: result.ok ? 200 : 400 }
    );
  }

  if (action === "restore_rehearsal") {
    const backupId =
      typeof body.backup_id === "string" ? body.backup_id : undefined;
    const result = runIsolatedRestoreRehearsal({
      siteId: site.site_id,
      backupId
    });
    return NextResponse.json(
      {
        ok: result.ok,
        action: "restore_rehearsal",
        rehearsal: result.rehearsal,
        readiness: assessBackupReadiness({ siteId: site.site_id }),
        error: result.error,
        production_safe: false
      },
      { status: result.ok ? 200 : 400 }
    );
  }

  return NextResponse.json(
    { ok: false, error: "unknown_action", production_safe: false },
    { status: 400 }
  );
}
