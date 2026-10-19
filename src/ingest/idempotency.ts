/**
 * @fileoverview Versioned SHA-256 ingest keys from unambiguous JSON tuples.
 * @description Stable key material for `CanonicalSnapshot.ingest_idempotency`.
 */

import { createHash } from "node:crypto";
import type { IngestTombstone } from "./types.js";

/**
 * @param {string[]} parts
 * @returns {string} Versioned tuple digest.
 */
export function ingestIdempotencyKey(parts: string[]): string {
  return `ingest:v2:${createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex")}`;
}

/** Read-only compatibility with persisted keys written before tuple encoding. */
export function legacyIngestIdempotencyKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/** Deletion keys retain their existing, already-unambiguous namespace. */
export function ingestDeletionIdempotencyKey(creatorId: string, tomb: IngestTombstone): string {
  const digest = createHash("sha256").update(JSON.stringify([
    creatorId, tomb.entity_type, tomb.id, tomb.deleted_at
  ]), "utf8").digest("hex");
  return `ingest_deletion:v1:${digest}`;
}
