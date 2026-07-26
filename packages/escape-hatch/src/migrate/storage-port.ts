/**
 * Injected object storage port for EH-012 media migration.
 * Unit tests use the in-memory adapter; live R2 is optional and config-injected only.
 */

import type { Readable } from "node:stream";
import { assertPrivateObjectKey } from "./validate.js";

export type PutObjectMeta = {
  contentType?: string;
  contentLength?: number;
};

export type HeadObjectResult = {
  contentLength: number;
  contentType?: string;
};

export type PrivateReadResult = {
  byteLength: number;
  sha256: string;
  /**
   * True when verification also proved anonymous/public read is denied.
   * Required for private_read_verified — authenticated GET alone is insufficient.
   */
  anonymous_denied: boolean;
};

/**
 * Minimal S3-compatible storage surface for stream copy + private-read checks.
 * Authenticated put/get/head succeed only via this port — public/anonymous URL
 * access must never be treated as private-read success.
 */
export type ObjectStoragePort = {
  putObjectStream(
    key: string,
    body: Readable,
    meta?: PutObjectMeta
  ): Promise<void>;
  putObjectBuffer(key: string, body: Buffer, meta?: PutObjectMeta): Promise<void>;
  headObject(key: string): Promise<HeadObjectResult | null>;
  getObjectBuffer(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  /**
   * Private-read verification: authenticated read must succeed AND anonymous /
   * public read must not be accepted as proof of privacy (probe must deny).
   * Must fail when key is a public/media path or when privacy cannot be proven.
   */
  assertPrivateRead(key: string): Promise<PrivateReadResult>;
};

/** Guard used by adapters before treating a read as private-verified. */
export function guardPrivateReadKey(key: string): void {
  assertPrivateObjectKey(key);
}
