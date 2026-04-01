import type { SyncBatchInput } from "./types.js";

/**
 * Batch pass-through hook for future ingest rules.
 * Post-level "cover" tags are not applied here — see `galleryRowTags` in `gallery/query.ts`.
 */
export function enrichBatch(batch: SyncBatchInput): SyncBatchInput {
  return batch;
}
