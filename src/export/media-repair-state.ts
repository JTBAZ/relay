import { createHash } from "node:crypto";
import type { MediaRow, PostRow } from "../ingest/canonical-store.js";
import type { ExportMediaRecord } from "./types.js";

export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const mediaExportHead = (row: MediaRow) => fingerprint([row.creator_id, row.media_id, row.upstream_status, row.current.version_seq, row.current.upstream_revision, row.current.upstream_url ?? null, row.current.storage_key ?? null]);
export const postCollectionHead = (row: PostRow) => fingerprint([row.creator_id, row.post_id, row.source ?? "PATREON", row.upstream_status, row.campaign_id, row.current.version_seq, row.current.upstream_revision, row.current.media_ids]);
export function currentExportRecord(row: MediaRow): ExportMediaRecord | undefined {
  const record = row.current.export_record;
  return row.upstream_status === "active" && record?.creator_id === row.creator_id && record.media_id === row.media_id && record.upstream_revision === row.current.upstream_revision && record.relative_blob_path === row.current.storage_key ? record : undefined;
}
