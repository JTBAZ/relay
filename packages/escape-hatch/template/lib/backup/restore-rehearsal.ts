/**
 * Isolated restore rehearsal (EH-073).
 * Never overwrites live kit roots in fixture mode.
 */

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import { assessCompatibility } from "./compatibility";
import { findBackupArtifact, loadBackupState, saveBackupState } from "./state";
import type {
  BackupStateDocument,
  CompatibilityPointer,
  RestoreRehearsalRecord
} from "./types";

export type RestoreRehearsalOpts = {
  siteId: string;
  kitDir?: string;
  backupId?: string;
  now?: Date;
  /** Force verification failure. */
  forceFail?: boolean;
};

export type RestoreRehearsalResult = {
  ok: boolean;
  rehearsal: RestoreRehearsalRecord | null;
  state: BackupStateDocument;
  error: string | null;
  production_safe: false;
};

/**
 * Restore snapshot into data/restore-rehearsal/<id>/ only.
 */
export function runIsolatedRestoreRehearsal(
  opts: RestoreRehearsalOpts
): RestoreRehearsalResult {
  const kitDir = opts.kitDir ?? process.cwd();
  const now = opts.now ?? new Date();
  let state = loadBackupState(opts.siteId, kitDir);

  const backupId =
    opts.backupId ??
    state.backups.find((b) => b.status === "ok")?.backup_id ??
    null;

  if (!backupId) {
    return {
      ok: false,
      rehearsal: null,
      state,
      error: "no_backup_available",
      production_safe: false
    };
  }

  const artifact = findBackupArtifact(state, backupId);
  if (!artifact || artifact.status !== "ok") {
    return {
      ok: false,
      rehearsal: null,
      state,
      error: "backup_not_found",
      production_safe: false
    };
  }

  const sourceAbs = join(kitDir, artifact.artifact_path);
  if (!existsSync(sourceAbs)) {
    state = {
      ...state,
      last_error: "artifact_missing_on_disk"
    };
    saveBackupState(state, kitDir);
    return {
      ok: false,
      rehearsal: null,
      state,
      error: "artifact_missing_on_disk",
      production_safe: false
    };
  }

  const rehearsalId = `reh_${now.getTime().toString(36)}_${randomUUID().slice(0, 8)}`;
  const targetRel = join("data", "restore-rehearsal", rehearsalId);
  const targetAbs = join(kitDir, targetRel);
  mkdirSync(targetAbs, { recursive: true });

  const notes: string[] = [];
  let status: "passed" | "failed" = "passed";
  let error: string | null = null;

  try {
    const raw = readFileSync(sourceAbs, "utf8").replace(/^\uFEFF/, "");
    const snapshot = JSON.parse(raw) as {
      backup_id?: string;
      versions?: {
        chassis_version?: string;
        schema_version?: string;
        slice?: string;
      };
      production_safe?: boolean;
    };

    if (!snapshot.versions?.chassis_version || !snapshot.versions?.schema_version) {
      status = "failed";
      error = "snapshot_incomplete";
      notes.push("Snapshot missing chassis/schema versions.");
    } else {
      notes.push("Snapshot JSON readable.");
      notes.push(
        `Versions: chassis=${snapshot.versions.chassis_version} schema=${snapshot.versions.schema_version} slice=${snapshot.versions.slice ?? "?"}`
      );
      writeFileSync(
        join(targetAbs, "restored-snapshot.json"),
        `${JSON.stringify(snapshot, null, 2)}\n`,
        "utf8"
      );
      notes.push(`Wrote isolated target ${targetRel.replace(/\\/g, "/")}`);

      const current: CompatibilityPointer = {
        chassis_version: String(snapshot.versions.chassis_version),
        schema_version: String(snapshot.versions.schema_version),
        slice: String(snapshot.versions.slice ?? "unknown"),
        recorded_at: now.toISOString()
      };
      const compat = assessCompatibility({
        current,
        previous_stable: state.previous_stable
      });
      notes.push(`Compatibility: ${compat.verdict} — ${compat.detail}`);
      if (compat.verdict === "incompatible") {
        status = "failed";
        error = "compatibility_incompatible";
      }
    }

    if (opts.forceFail) {
      status = "failed";
      error = "forced_rehearsal_failure";
      notes.push("Forced fixture failure.");
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : "restore_parse_failed";
    notes.push("Failed to parse or write restored snapshot.");
  }

  const finished = new Date();
  const rehearsal: RestoreRehearsalRecord = {
    rehearsal_id: rehearsalId,
    backup_id: backupId,
    started_at: now.toISOString(),
    finished_at: finished.toISOString(),
    status,
    target_path: targetRel.replace(/\\/g, "/"),
    verification_notes: notes,
    error
  };

  state = {
    ...state,
    last_rehearsal: rehearsal,
    last_error: status === "failed" ? error : null
  };
  saveBackupState(state, kitDir);

  return {
    ok: status === "passed",
    rehearsal,
    state,
    error,
    production_safe: false
  };
}
