/**
 * @fileoverview Opaque session token hashing for database storage (no raw secrets at rest).
 * @description SHA-256 hex digest used as `Session.tokenHash` and idempotency-friendly lookups.
 * @see docs/database/operations-and-security.md
 * @security-audit-required Hash preimage is the raw token; ensure minting uses CSPRNG and adequate length.
 */

import { createHash } from "node:crypto";

/** SHA-256 hex of the opaque session string — stored in DB instead of raw tokens (operations-and-security.md). */
/**
 * @description Computes deterministic `tokenHash` for Prisma `Session` rows.
 * @param {string} token Raw opaque session string from cookie or `Authorization`.
 * @returns {string} Lowercase hex SHA-256.
 */
export function hashOpaqueSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
