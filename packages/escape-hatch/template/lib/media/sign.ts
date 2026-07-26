/**
 * Signed GET minting for private R2 objects (EH-033).
 * Secrets stay server-side; tests inject a mock signer (no live R2).
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadR2SigningEnv, resolveSignedUrlTtlSec } from "./config";
import { isEscapeHatchMediaObjectKey } from "./keys";
import type { MediaSigner, SignedGetResult } from "./types";
import {
  DEFAULT_SIGNED_URL_TTL_SEC,
  MAX_SIGNED_URL_TTL_SEC
} from "./types";

function clampTtl(ttlSec: number | undefined): number {
  const n = ttlSec ?? DEFAULT_SIGNED_URL_TTL_SEC;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SIGNED_URL_TTL_SEC;
  return Math.min(Math.floor(n), MAX_SIGNED_URL_TTL_SEC);
}

/**
 * Deterministic mock signer for CI — never talks to the network.
 * Host is allowlisted in fixture scans (`media.fixture.example`).
 */
export function createMockMediaSigner(opts?: {
  baseUrl?: string;
  ttlSec?: number;
}): MediaSigner {
  const base = (opts?.baseUrl ?? "https://media.fixture.example").replace(
    /\/+$/,
    ""
  );
  const defaultTtl = clampTtl(opts?.ttlSec);
  return {
    implementation: "mock",
    async signGetObject(key: string, ttlSec?: number): Promise<SignedGetResult> {
      if (!isEscapeHatchMediaObjectKey(key) && !key.startsWith("eh/")) {
        throw new Error("refusing to sign non-escape-hatch object key");
      }
      const ttl = clampTtl(ttlSec ?? defaultTtl);
      const expiresMs = Date.now() + ttl * 1000;
      const expiresAt = new Date(expiresMs).toISOString();
      const url = `${base}/object/${encodeURIComponent(key)}?X-Amz-Expires=${ttl}&exp=${expiresMs}`;
      return { url, expiresAt, ttlSec: ttl };
    }
  };
}

/**
 * Live R2/S3-compatible presigner. Only construct when credentials are real.
 * Do not call from CI without an injected mock.
 */
export function createR2MediaSigner(opts?: {
  ttlSec?: number;
}): MediaSigner {
  const cfg = loadR2SigningEnv();
  const defaultTtl = clampTtl(opts?.ttlSec ?? resolveSignedUrlTtlSec());
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey
    },
    forcePathStyle: true
  });

  return {
    implementation: "r2",
    async signGetObject(key: string, ttlSec?: number): Promise<SignedGetResult> {
      if (!isEscapeHatchMediaObjectKey(key)) {
        throw new Error("refusing to sign non-escape-hatch object key");
      }
      const ttl = clampTtl(ttlSec ?? defaultTtl);
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
        { expiresIn: ttl }
      );
      return {
        url,
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        ttlSec: ttl
      };
    }
  };
}

/**
 * Env-aware signer factory. Prefer mock injection in tests.
 * private_r2 without credentials throws (fail closed).
 */
export function createMediaSignerFromEnv(): MediaSigner {
  return createR2MediaSigner();
}
