/**
 * Backup readiness rollup for Health (EH-073).
 */

import {
  assessCompatibility,
  currentPointerFromManifest,
  readManifestVersions
} from "./compatibility";
import { buildDiagnosticBundle } from "./diagnostics";
import { isBackupFresh } from "./snapshot";
import { loadBackupState } from "./state";
import {
  BACKUP_RPO_HOURS,
  BACKUP_RTO_MINUTES,
  type CompatibilityReport,
  type RestoreRehearsalStatus
} from "./types";

export type BackupReadiness = {
  ok: boolean;
  detail: string;
  schedule_ok: boolean;
  restore_status: RestoreRehearsalStatus;
  restore_ok: boolean;
  compatibility: CompatibilityReport;
  diagnostics_available: boolean;
  rpo_hours: typeof BACKUP_RPO_HOURS;
  rto_minutes: typeof BACKUP_RTO_MINUTES;
  last_backup_id: string | null;
  production_safe: false;
};

export function assessBackupReadiness(opts: {
  siteId: string;
  kitDir?: string;
  now?: Date;
}): BackupReadiness {
  const kitDir = opts.kitDir ?? process.cwd();
  const now = opts.now ?? new Date();
  const state = loadBackupState(opts.siteId, kitDir);
  const versions = readManifestVersions(kitDir);

  const schedule_ok = isBackupFresh(state, now);
  const restore_status: RestoreRehearsalStatus = !state.last_rehearsal
    ? "never_run"
    : state.last_rehearsal.status === "passed"
      ? "passed"
      : "failed";
  const restore_ok = restore_status === "passed";

  const current = versions
    ? currentPointerFromManifest(versions, now)
    : {
        chassis_version: "unknown",
        schema_version: "unknown",
        slice: "unknown",
        recorded_at: now.toISOString()
      };

  const compatibility = assessCompatibility({
    current,
    previous_stable: state.previous_stable
  });

  const diagnostics_available = Boolean(
    buildDiagnosticBundle({ siteId: opts.siteId, kitDir })
  );

  const parts: string[] = [];
  if (schedule_ok) {
    parts.push(
      `Last backup ok within RPO ${BACKUP_RPO_HOURS}h (${state.schedule.last_run_at}).`
    );
  } else if (!state.schedule.last_run_at) {
    parts.push("No fixture backup run yet — schedule cadence is daily.");
  } else {
    parts.push(
      `Backup stale or failed (last_result=${state.schedule.last_result ?? "none"}). RPO ${BACKUP_RPO_HOURS}h.`
    );
  }
  parts.push(`Restore rehearsal: ${restore_status}.`);
  parts.push(`Compatibility: ${compatibility.verdict}.`);
  parts.push(
    `RTO target ${BACKUP_RTO_MINUTES}m (documented; kit-local only). productionSafe false.`
  );

  const ok = schedule_ok && restore_ok && versions !== null;

  return {
    ok,
    detail: parts.join(" "),
    schedule_ok,
    restore_status,
    restore_ok,
    compatibility,
    diagnostics_available,
    rpo_hours: BACKUP_RPO_HOURS,
    rto_minutes: BACKUP_RTO_MINUTES,
    last_backup_id: state.backups[0]?.backup_id ?? null,
    production_safe: false
  };
}
