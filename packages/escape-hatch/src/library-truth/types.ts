/**
 * Escape Hatch library-truth / parity documents (EH-013).
 *
 * Creator-readable + machine-readable audit of import and media migration.
 * production_safe is always false — soft gate / prototype console, not EH-033.
 */

/** Machine-readable parity report version. */
export const LIBRARY_PARITY_REPORT_CONTRACT_VERSION =
  "library-parity-report/1.0.0" as const;

/** Local mutable library-truth wizard state version. */
export const LIBRARY_TRUTH_STATE_CONTRACT_VERSION =
  "library-truth-state/1.0.0" as const;

export const ANOMALY_KINDS = [
  "premium_media_unverified",
  "unaccounted_import_failure",
  "unaccounted_migration_failure",
  "unaccounted_item",
  "access_ambiguity",
  "conflict_unresolved",
  "missing_artifact",
  "import_exclusion",
  "tier_unmapped"
] as const;
export type AnomalyKind = (typeof ANOMALY_KINDS)[number];

export type LibraryTruthArtifactPresence = {
  site_bundle: boolean;
  import_report: boolean;
  provenance: boolean;
  import_state: boolean;
  media_migration_ledger: boolean;
  media_migration_report: boolean;
};

export type LibraryTruthIdentity = {
  display_name: string;
  handle: string;
  creator_id: string;
  site_id: string;
};

export type AccountedCounts = {
  expected: number;
  imported: number;
  excluded: number;
  failed: number;
  /** True when expected === imported + excluded + failed (no silent drops). */
  fully_accounted: boolean;
};

export type MediaAccountedCounts = {
  expected: number;
  imported: number;
  copied: number;
  verified: number;
  failed: number;
  missing: number;
  excluded: number;
  fully_accounted: boolean;
};

export type TierAccountedCounts = {
  expected: number;
  mapped: number;
  unmapped: number;
  catalog: Array<{ tier_id: string; title: string; amount_cents?: number | null }>;
};

export type LibraryAnomalySubject = {
  post_ids?: string[];
  media_ids?: string[];
  tier_ids?: string[];
};

export type LibraryAnomaly = {
  id: string;
  kind: AnomalyKind;
  /** When true, blocks “library truth complete” until excluded. */
  blocking: boolean;
  subject: LibraryAnomalySubject;
  what_was_seen: string;
  likely_effect: string;
  recommended_resolution: string;
};

export type AccessBucketInspect = {
  id: string;
  title: string;
  blurb: string;
  post_ids: string[];
  post_count: number;
  media_count: number;
};

export type AccessSimulationRow = {
  bucket_id: string;
  bucket_title: string;
  visible_post_ids: string[];
  visible_count: number;
  locked_count: number;
  /** Soft-gate only — not authoritative entitlements. */
  non_authoritative: true;
};

export type AccountedItemNote = {
  id: string;
  disposition: "imported" | "excluded" | "failed";
  reason: string;
  post_id?: string;
  media_id?: string;
};

export type LibraryParityReport = {
  contract_version: typeof LIBRARY_PARITY_REPORT_CONTRACT_VERSION;
  site_id: string;
  creator_id: string;
  generated_at: string;
  /** Always false for EH-013. */
  production_safe: false;
  artifacts: LibraryTruthArtifactPresence;
  identity: LibraryTruthIdentity;
  posts: AccountedCounts;
  media: MediaAccountedCounts;
  attachments: {
    expected: number;
    accounted: number;
  };
  tiers: TierAccountedCounts;
  exclusions: AccountedItemNote[];
  failures: AccountedItemNote[];
  conflicts: Array<{
    id: string;
    kind: string;
    summary: string;
    recommended_action: string;
    post_id?: string;
    media_id?: string;
    tier_id?: string;
  }>;
  anomalies: LibraryAnomaly[];
  access_buckets: AccessBucketInspect[];
  access_simulations: AccessSimulationRow[];
  access_notes: string[];
  /** Machine-readable gate snapshot without creator exclusions applied. */
  gate: {
    fully_accounted: boolean;
    blocking_anomaly_ids: string[];
    unresolved_blocking_count: number;
    can_continue_without_exclusions: boolean;
  };
  /** Creator-readable notes (plain language). */
  creator_notes: string[];
  notes: string[];
};

export type LibraryTruthExclusion = {
  anomaly_id: string;
  reason: string;
  excluded_at: string;
  subject: LibraryAnomalySubject;
};

export type LibraryTruthState = {
  contract_version: typeof LIBRARY_TRUTH_STATE_CONTRACT_VERSION;
  site_id: string;
  creator_id: string;
  updated_at: string;
  production_safe: false;
  exclusions: Record<string, LibraryTruthExclusion>;
  library_truth_complete: boolean;
  completed_at?: string;
};

export type ContinueGateResult = {
  can_continue: boolean;
  fully_accounted: boolean;
  blocking_anomaly_ids: string[];
  unresolved_blocking_ids: string[];
  excluded_blocking_ids: string[];
  library_truth_complete: boolean;
  production_safe: false;
  reasons: string[];
};
