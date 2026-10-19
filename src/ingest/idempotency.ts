/**
 * @fileoverview SHA-256 ingest idempotency key from ordered string parts.
 * @description Stable key material for `CanonicalSnapshot.ingest_idempotency`.
 */

import { createHash } from "node:crypto";
import type { IngestTombstone } from "./types.js";

/**
 * @param {string[]} parts
 * @returns {string} Hex digest.
 */
export function ingestIdempotencyKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/** New deletion namespace only; existing stored replay keys keep their encoding. */
export function ingestDeletionIdempotencyKey(creatorId: string, tomb: IngestTombstone): string {
  const digest = createHash("sha256").update(JSON.stringify([
    creatorId, tomb.entity_type, tomb.id, tomb.deleted_at
  ]), "utf8").digest("hex");
  return `ingest_deletion:v1:${digest}`;
}
