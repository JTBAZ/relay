/**
 * Kit-local backup state (EH-073).
 * Fixture/injectable only — productionSafe remains false.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import {
  BACKUP_RPO_HOURS,
  BACKUP_RTO_MINUTES,
  BACKUP_STATE_CONTRACT,
  type BackupArtifact,
  type BackupStateDocument,
  type CompatibilityPointer,
  type RestoreRehearsalRecord
} from "./types";

function statePath(kitDir: string): string {
  return join(kitDir, "data", "backup-state.json");
}

export function emptyBackupState(siteId: string): BackupStateDocument {
  return {
    contract_version: BACKUP_STATE_CONTRACT,
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    schedule: {
      cadence: "daily",
      rpo_hours: BACKUP_RPO_HOURS,
      rto_minutes: BACKUP_RTO_MINUTES,
      last_run_at: null,
      next_run_at: null,
      last_result: null
    },
    backups: [],
    last_rehearsal: null,
    previous_stable: null,
    last_error: null
  };
}

function normalizeArtifact(raw: BackupArtifact): BackupArtifact {
  return {
    backup_id: String(raw.backup_id ?? ""),
    created_at: String(raw.created_at ?? ""),
    status: raw.status === "failed" ? "failed" : "ok",
    artifact_path: String(raw.artifact_path ?? ""),
    chassis_version: String(raw.chassis_version ?? ""),
    schema_version: String(raw.schema_version ?? ""),
    slice: String(raw.slice ?? ""),
    error: typeof raw.error === "string" ? raw.error : null
  };
}

export function loadBackupState(
  siteId: string,
  kitDir = process.cwd()
): BackupStateDocument {
  const path = statePath(kitDir);
  if (!existsSync(path)) return emptyBackupState(siteId);
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as Partial<BackupStateDocument>;
    if (
      raw.contract_version !== BACKUP_STATE_CONTRACT ||
      !Array.isArray(raw.backups)
    ) {
      return emptyBackupState(siteId);
    }
    return {
      contract_version: BACKUP_STATE_CONTRACT,
      site_id: siteId,
      production_safe: false,
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : new Date().toISOString(),
      schedule: {
        cadence: "daily",
        rpo_hours: BACKUP_RPO_HOURS,
        rto_minutes: BACKUP_RTO_MINUTES,
        last_run_at:
          typeof raw.schedule?.last_run_at === "string"
            ? raw.schedule.last_run_at
            : null,
        next_run_at:
          typeof raw.schedule?.next_run_at === "string"
            ? raw.schedule.next_run_at
            : null,
        last_result:
          raw.schedule?.last_result === "ok" ||
          raw.schedule?.last_result === "failed"
            ? raw.schedule.last_result
            : null
      },
      backups: (raw.backups as BackupArtifact[]).map(normalizeArtifact),
      last_rehearsal:
        raw.last_rehearsal && typeof raw.last_rehearsal === "object"
          ? (raw.last_rehearsal as RestoreRehearsalRecord)
          : null,
      previous_stable:
        raw.previous_stable && typeof raw.previous_stable === "object"
          ? (raw.previous_stable as CompatibilityPointer)
          : null,
      last_error: typeof raw.last_error === "string" ? raw.last_error : null
    };
  } catch {
    return emptyBackupState(siteId);
  }
}

export function saveBackupState(
  doc: BackupStateDocument,
  kitDir = process.cwd()
): void {
  const normalized: BackupStateDocument = {
    ...doc,
    contract_version: BACKUP_STATE_CONTRACT,
    production_safe: false,
    updated_at: new Date().toISOString(),
    backups: doc.backups.map(normalizeArtifact)
  };
  mkdirSync(join(kitDir, "data"), { recursive: true });
  writeFileSync(
    statePath(kitDir),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  );
}

export function findBackupArtifact(
  doc: BackupStateDocument,
  backupId: string
): BackupArtifact | null {
  return doc.backups.find((b) => b.backup_id === backupId) ?? null;
}
