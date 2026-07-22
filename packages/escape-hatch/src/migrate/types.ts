/**
 * Escape Hatch media migration documents (EH-012).
 *
 * Separate from SiteBundle and EH-011 import documents. Fail-closed parsers
 * live in validate.ts. productionSafe remains false — private object copy is
 * not visitor signed-URL delivery (EH-033).
 */

/** Per-object migration ledger version. */
export const MEDIA_MIGRATION_LEDGER_CONTRACT_VERSION =
  "media-migration-ledger/1.0.0" as const;

/** Creator-readable migration report version. */
export const MEDIA_MIGRATION_REPORT_CONTRACT_VERSION =
  "media-migration-report/1.0.0" as const;

export const MIGRATION_OBJECT_STATUSES = [
  "pending",
  "copying",
  "verified",
  "failed",
  "skipped"
] as const;
export type MigrationObjectStatus = (typeof MIGRATION_OBJECT_STATUSES)[number];

export const MIGRATION_NEXT_ACTIONS = [
  "retry",
  "skip",
  "verify_private_read",
  "none"
] as const;
export type MigrationNextAction = (typeof MIGRATION_NEXT_ACTIONS)[number];

export const MIGRATION_ACCESS_CLASSES = [
  "public",
  "member_only",
  "tier_gated",
  "unknown"
] as const;
export type MigrationAccessClass = (typeof MIGRATION_ACCESS_CLASSES)[number];

export type MediaMigrationObjectEntry = {
  media_id: string;
  status: MigrationObjectStatus;
  attempt_count: number;
  /** Opaque creator/site-scoped private object key (never a public/media path). */
  object_key?: string;
  source_relative_path?: string;
  expected_sha256?: string;
  expected_byte_length?: number;
  actual_sha256?: string;
  actual_byte_length?: number;
  mime_type?: string;
  original_filename?: string;
  access_class: MigrationAccessClass;
  /** True when access_class is member_only or tier_gated — must stay private. */
  private_required: boolean;
  private_read_verified: boolean;
  failure_reason?: string;
  next_action: MigrationNextAction;
  last_attempt_at?: string;
};

export type MediaMigrationLedger = {
  contract_version: typeof MEDIA_MIGRATION_LEDGER_CONTRACT_VERSION;
  site_id: string;
  creator_id: string;
  batch_id: string;
  updated_at: string;
  /** productionSafe is always false for this slice. */
  production_safe: false;
  notes: string[];
  objects: Record<string, MediaMigrationObjectEntry>;
};

export type MediaMigrationReport = {
  contract_version: typeof MEDIA_MIGRATION_REPORT_CONTRACT_VERSION;
  site_id: string;
  creator_id: string;
  batch_id: string;
  generated_at: string;
  production_safe: false;
  expected: number;
  copied: number;
  verified: number;
  failed: number;
  skipped: number;
  bytes_verified: number;
  notes: string[];
};
