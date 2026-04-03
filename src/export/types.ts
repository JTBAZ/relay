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

/** Last failed export attempt for a media id (cleared on successful export). */
export type ExportFailureRecord = {
  message: string;
  failed_at: string;
  attempts?: number;
};

export type CreatorExportIndex = {
  creator_id: string;
  media: Record<string, ExportMediaRecord>;
  /** Present after a failed download (after retries); omitted in older index files. */
  export_failures?: Record<string, ExportFailureRecord>;
};

/** Bounded retries for upstream URL fetch (transient errors only). */
export type ExportFetchRetryPolicy = {
  max_attempts: number;
  base_delay_ms: number;
  /** Abort single fetch after this many ms. */
  timeout_ms: number;
};

export const DEFAULT_EXPORT_FETCH_RETRY_POLICY: ExportFetchRetryPolicy = {
  max_attempts: 3,
  base_delay_ms: 500,
  timeout_ms: 60_000
};

export type ExportOneResult = {
  media_id: string;
  creator_id: string;
  sha256: string;
  byte_length: number;
  idempotent_skip: boolean;
};
