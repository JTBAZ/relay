/**
 * Streaming checksum helpers for EH-012 media migration.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";

export type StreamChecksumResult = {
  sha256: string;
  byteLength: number;
};

export function isSha256Hex(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export function normalizeSha256(value: string): string {
  return value.toLowerCase();
}

/**
 * Hash a readable stream without requiring the full asset already in memory
 * at the call site (Node still yields chunks; API accepts streams).
 */
export async function hashReadable(stream: Readable): Promise<StreamChecksumResult> {
  const hash = createHash("sha256");
  let byteLength = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buf.length;
    hash.update(buf);
  }
  return { sha256: hash.digest("hex"), byteLength };
}

export async function hashFile(path: string): Promise<StreamChecksumResult> {
  return hashReadable(createReadStream(path));
}

export function hashBuffer(buf: Buffer): StreamChecksumResult {
  return {
    sha256: createHash("sha256").update(buf).digest("hex"),
    byteLength: buf.length
  };
}

/**
 * Fail-closed compare when expected metadata is a real SHA-256 hex digest.
 * Non-hex placeholders are treated as absent (no compare), so legacy fixtures
 * must be updated to real digests for enforced verification.
 */
export function checksumMatchesExpected(
  actual: StreamChecksumResult,
  expectedSha256?: string,
  expectedByteLength?: number
): { ok: true } | { ok: false; reason: string } {
  if (isSha256Hex(expectedSha256)) {
    if (normalizeSha256(actual.sha256) !== normalizeSha256(expectedSha256)) {
      return {
        ok: false,
        reason: "sha256 mismatch against expected provenance/export metadata"
      };
    }
  }
  if (
    typeof expectedByteLength === "number" &&
    Number.isInteger(expectedByteLength) &&
    expectedByteLength >= 0
  ) {
    if (actual.byteLength !== expectedByteLength) {
      return {
        ok: false,
        reason: "byte_length mismatch against expected provenance/export metadata"
      };
    }
  }
  return { ok: true };
}
