/**
 * @fileoverview SHA-256 ingest idempotency key from ordered string parts.
 * @description Stable key material for `CanonicalSnapshot.ingest_idempotency`.
 */

import { createHash } from "node:crypto";

/**
 * @param {string[]} parts
 * @returns {string} Hex digest.
 */
export function ingestIdempotencyKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}
