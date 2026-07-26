/**
 * @fileoverview Thin factory for `@aws-sdk/client-s3` pointed at Cloudflare R2 (SigV4, custom endpoint).
 * @description Stateless — callers hold `S3Client` lifecycle.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see ./r2-config.js Environment wiring
 */
import { S3Client } from "@aws-sdk/client-s3";
import type { R2ClientConfig } from "./r2-config.js";

/**
 * Builds an SDK client for R2 S3-compatible operations.
 * @param cfg Endpoint, credentials, bucket, region from {@link ./r2-config.js}.
 */
export function createR2S3Client(cfg: R2ClientConfig): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: cfg.credentials
  });
}
