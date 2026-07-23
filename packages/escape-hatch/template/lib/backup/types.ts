/**
 * Backup / restore / diagnostics types (EH-073).
 * Kit-local fixture only — productionSafe remains false.
 */

export const BACKUP_STATE_CONTRACT = "escape-hatch-backup-state/1.0.0" as const;

/** Documented RPO for fixture schedule (hours). */
export const BACKUP_RPO_HOURS = 24 as const;

/** Documented RTO for isolated restore rehearsal (minutes). */
export const BACKUP_RTO_MINUTES = 30 as const;

export type BackupCadence = "daily";

export type BackupResultStatus = "ok" | "failed";

export type RestoreRehearsalStatus = "passed" | "failed" | "never_run";

export type CompatibilityVerdict =
  | "compatible"
  | "compatible_with_notes"
  | "incompatible"
  | "unknown";

export type BackupArtifact = {
  backup_id: string;
  created_at: string;
  status: BackupResultStatus;
  /** Relative path under kit data/ (or memory key). */
  artifact_path: string;
  chassis_version: string;
  schema_version: string;
  slice: string;
  error: string | null;
};

export type RestoreRehearsalRecord = {
  rehearsal_id: string;
  backup_id: string;
  started_at: string;
  finished_at: string;
  status: "passed" | "failed";
  target_path: string;
  verification_notes: string[];
  error: string | null;
};

export type CompatibilityPointer = {
  chassis_version: string;
  schema_version: string;
  slice: string;
  recorded_at: string;
};

export type BackupStateDocument = {
  contract_version: typeof BACKUP_STATE_CONTRACT;
  site_id: string;
  production_safe: false;
  updated_at: string;
  schedule: {
    cadence: BackupCadence;
    rpo_hours: typeof BACKUP_RPO_HOURS;
    rto_minutes: typeof BACKUP_RTO_MINUTES;
    last_run_at: string | null;
    next_run_at: string | null;
    last_result: BackupResultStatus | null;
  };
  backups: BackupArtifact[];
  last_rehearsal: RestoreRehearsalRecord | null;
  /** Prior stable kit pointer for compatibility checks (fixture-settable). */
  previous_stable: CompatibilityPointer | null;
  last_error: string | null;
};

export type ManifestVersions = {
  chassis_version: string;
  schema_version: string;
  slice: string;
  adapters: Array<{ id: string; version: string; state: string }>;
};

export type CompatibilityReport = {
  verdict: CompatibilityVerdict;
  detail: string;
  current: CompatibilityPointer;
  previous_stable: CompatibilityPointer | null;
  production_safe: false;
};

export type DiagnosticBundle = {
  contract_version: "escape-hatch-diagnostic-bundle/1.0.0";
  generated_at: string;
  site_id: string;
  production_safe: false;
  versions: ManifestVersions;
  backup_schedule: BackupStateDocument["schedule"];
  restore_rehearsal_status: RestoreRehearsalStatus;
  health_statuses: Array<{ id: string; ok: boolean; detail: string }>;
  recent_error_codes: string[];
  /** Explicit redaction note for operators. */
  redaction_note: string;
};
