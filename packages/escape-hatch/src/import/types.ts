/**
 * Escape Hatch import documents (EH-011).
 *
 * Separate from SiteBundle (EH-001): immutable provenance, mutable local state,
 * creator-readable import report, and conflict queue items. Fail-closed parsers
 * live in validate.ts; SiteBundle remains the fillTemplate preview contract.
 */

import type { AccessLevel, TierMatchMode } from "../contracts.js";

/** Immutable provenance document version. */
export const IMPORT_PROVENANCE_CONTRACT_VERSION =
  "import-provenance/1.0.0" as const;

/** Local mutable import state document version. */
export const IMPORT_LOCAL_STATE_CONTRACT_VERSION =
  "import-local-state/1.0.0" as const;

/** Creator-readable import report version. */
export const IMPORT_REPORT_CONTRACT_VERSION = "import-report/1.0.0" as const;

export const IMPORT_ORIGINS = ["imported", "native", "crossposted"] as const;
export type ImportOrigin = (typeof IMPORT_ORIGINS)[number];

export const CONFLICT_KINDS = [
  "local_edit",
  "native_post",
  "tombstone",
  "tier_remap",
  "upstream_revision"
] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];

export const EXCLUSION_KINDS = [
  "tombstone",
  "mature_metadata",
  "video_audio_embed",
  "missing_export",
  "deleted_media",
  "creator_approved"
] as const;
export type ExclusionKind = (typeof EXCLUSION_KINDS)[number];

export type ProvenanceAccessSnapshot = {
  level: AccessLevel;
  tier_ids: string[];
  match_mode?: TierMatchMode;
};

export type ProvenanceMediaEntry = {
  media_id: string;
  provider_object_id: string;
  mime_type?: string;
  byte_length?: number;
  checksum?: string;
  upstream_revision?: string;
  has_export: boolean;
  /** True when export index lists the blob but on-disk bytes were not verified. */
  blob_missing?: boolean;
};

export type ProvenancePostEntry = {
  provider: "relay_canonical";
  provider_object_id: string;
  published_at: string;
  upstream_revision: string;
  source_tier_ids: string[];
  access_snapshot: ProvenanceAccessSnapshot;
  media: ProvenanceMediaEntry[];
  upstream_status: "active" | "deleted";
};

export type ProvenanceTierEntry = {
  provider_object_id: string;
  title: string;
  amount_cents?: number | null;
  campaign_id?: string;
  version_seq?: number;
};

export type ImportProvenance = {
  contract_version: typeof IMPORT_PROVENANCE_CONTRACT_VERSION;
  site_id: string;
  creator_id: string;
  provider: "relay_canonical";
  batch_id: string;
  source_revision: string;
  imported_at: string;
  posts: Record<string, ProvenancePostEntry>;
  tiers: Record<string, ProvenanceTierEntry>;
  media: Record<string, ProvenanceMediaEntry>;
};

export type LocalPostState = {
  slug: string;
  origin: ImportOrigin;
  locally_edited: boolean;
  /** Field paths marked as creator-owned edits (e.g. title, access.level). */
  edit_markers: string[];
  local_title?: string;
  redirects?: string[];
};

export type ConflictItem = {
  id: string;
  kind: ConflictKind;
  post_id?: string;
  media_id?: string;
  tier_id?: string;
  field_paths: string[];
  recommended_action: string;
  summary: string;
};

export type ReplayLedger = {
  last_batch_id: string;
  last_source_revision: string;
  imported_post_ids: string[];
  imported_media_ids: string[];
};

export type ImportLocalState = {
  contract_version: typeof IMPORT_LOCAL_STATE_CONTRACT_VERSION;
  site_id: string;
  creator_id: string;
  updated_at: string;
  posts: Record<string, LocalPostState>;
  /** source_tier_id → local_tier_id (legacy rename / remap). */
  tier_mappings: Record<string, string>;
  conflict_queue: ConflictItem[];
  replay_ledger: ReplayLedger;
};

export type AccountedItem = {
  id: string;
  kind: ExclusionKind | "failed";
  reason: string;
  field_paths: string[];
  post_id?: string;
  media_id?: string;
};

export type ImportCounts = {
  expected: number;
  imported: number;
  excluded: number;
  failed: number;
  conflicts: number;
};

export type ImportReport = {
  contract_version: typeof IMPORT_REPORT_CONTRACT_VERSION;
  batch_id: string;
  creator_id: string;
  site_id: string;
  generated_at: string;
  source_revision: string;
  posts: ImportCounts;
  media: {
    expected: number;
    imported: number;
    excluded: number;
    failed: number;
    missing_export: number;
  };
  tiers: {
    expected: number;
    mapped: number;
    unmapped: number;
  };
  exclusions: AccountedItem[];
  failures: AccountedItem[];
  conflicts: ConflictItem[];
  notes: string[];
};
