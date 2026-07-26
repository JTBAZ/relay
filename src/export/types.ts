/**
 * @fileoverview Export index records, retry policy defaults, and per-media export outcomes.
 * @description JSON `export_index.json` shape plus fetch retry configuration for upstream downloads.
 * @see ./export-index.js
 */

/** @description One successfully exported media blob metadata row. */
export type ExportMediaRecord = {
  media_id: string;
  creator_id: string;
  sha256: string;
  byte_length: number;
  relative_blob_path: string;
  upstream_revision: string;
  mime_type?: string;
  exported_at: string;
  upstream_url?: string;
};

/**
 * @description Failure diagnostic stored alongside media id when export pipeline errors.
 * Last failed export attempt for a media id (cleared on successful export).
 */
export type ExportFailureRecord = {
  message: string;
  failed_at: string;
  attempts?: number;
};

/** @description Per-creator aggregate index for export service and manifests. */
export type CreatorExportIndex = {
  creator_id: string;
  media: Record<string, ExportMediaRecord>;
  /** Present after a failed download (after retries); omitted in older index files. */
  export_failures?: Record<string, ExportFailureRecord>;
};

/**
 * @description Tunable retry/backoff for Patreon/CDN fetches during export.
 * Bounded retries for upstream URL fetch (transient errors only).
 */
export type ExportFetchRetryPolicy = {
  max_attempts: number;
  base_delay_ms: number;
  /** Abort single fetch after this many ms. */
  timeout_ms: number;
};

/** @description Default policy when callers omit partial overrides in `ExportService`. */
export const DEFAULT_EXPORT_FETCH_RETRY_POLICY: ExportFetchRetryPolicy = {
  max_attempts: 3,
  base_delay_ms: 500,
  timeout_ms: 60_000
};

/** @description Result envelope from `ExportService.exportMedia`. */
export type ExportOneResult = {
  media_id: string;
  creator_id: string;
  sha256: string;
  byte_length: number;
  idempotent_skip: boolean;
};
