/**
 * @fileoverview Relay R2 object keys, presigned PUT URLs, head/get/put/delete helpers, and upload guard env readers.
 * @description Browser uploads use presigned URLs; server bridges use `putR2ObjectBuffer`. See ADR 002 for layout.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `MediaAsset.currentStorageKey`, `mediaStoragePurgeQueue.storageKey`
 */

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { R2ClientConfig } from "./r2-config.js";
import { createR2S3Client } from "./r2-s3-client.js";

/** Object key tail segment per ADR 002. */
export const RELAY_R2_KEY_SEGMENT = "asset";

const DEFAULT_MAX_BYTES = 524_288_000; // 500 MiB
const DEFAULT_PRESIGN_SEC = 900;
const DEFAULT_MIME_PREFIXES = ["video/", "audio/", "image/"];

/**
 * Canonical per-tenant media object key for Relay uploads.
 * @param creatorId Relay creator / tenant scope id.
 * @param mediaId Primary `MediaAsset.id`.
 */
export function buildRelayR2ObjectKey(creatorId: string, mediaId: string): string {
  return `relay/tenants/${creatorId}/media/${mediaId}/${RELAY_R2_KEY_SEGMENT}`;
}

/**
 * Max upload bytes from `RELAY_UPLOAD_MAX_BYTES` with safe default.
 * @todo Brittle: callers should align with API route validation separately.
 */
export function getRelayUploadMaxBytes(): number {
  const raw = process.env.RELAY_UPLOAD_MAX_BYTES?.trim();
  if (!raw) {
    return DEFAULT_MAX_BYTES;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

/** Presign TTL clamped to [60, 14400] seconds. */
export function getPresignExpiresSec(): number {
  const raw = process.env.R2_PRESIGN_EXPIRES_SEC?.trim();
  if (!raw) {
    return DEFAULT_PRESIGN_SEC;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 60 && n <= 14_400 ? n : DEFAULT_PRESIGN_SEC;
}

const AMZ_DATE_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

/**
 * UTC instant when an AWS SigV4 presigned URL stops accepting requests (same window S3 / R2 enforce).
 * Parses `X-Amz-Date` + `X-Amz-Expires` query params only — returns null if missing or malformed.
 * @see docs/export-r2-presigned-ttl.md (P8-sec-004)
 */
export function presignedUrlSigningExpiresAt(url: string): Date | null {
  try {
    const u = new URL(url);
    const dateStr = u.searchParams.get("X-Amz-Date");
    const expSecRaw = u.searchParams.get("X-Amz-Expires");
    if (!dateStr || !expSecRaw) return null;
    const m = AMZ_DATE_RE.exec(dateStr);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const s = Number(m[6]);
    const startMs = Date.UTC(y, mo, d, h, mi, s);
    const ttl = Number.parseInt(expSecRaw, 10);
    if (!Number.isFinite(ttl) || ttl < 0) return null;
    return new Date(startMs + ttl * 1000);
  } catch {
    return null;
  }
}

/** True when {@link presignedUrlSigningExpiresAt} is before `at` (or URL cannot be parsed). */
export function isPresignedUrlExpired(url: string, at: Date = new Date()): boolean {
  const until = presignedUrlSigningExpiresAt(url);
  if (!until) return false;
  return at.getTime() > until.getTime();
}

/**
 * Allowed `Content-Type` prefixes from `RELAY_UPLOAD_ALLOWED_MIME_PREFIXES` (comma-separated).
 */
export function getAllowedMimePrefixesFromEnv(): string[] {
  const raw = process.env.RELAY_UPLOAD_ALLOWED_MIME_PREFIXES?.trim();
  if (!raw) {
    return DEFAULT_MIME_PREFIXES;
  }
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_MIME_PREFIXES;
}

/**
 * @param contentType Client-declared MIME type.
 * @param prefixes Optional override list (defaults to env-derived allowlist).
 */
export function isMimeTypeAllowed(
  contentType: string,
  prefixes: string[] = getAllowedMimePrefixesFromEnv()
): boolean {
  const m = contentType.trim().toLowerCase();
  if (!m || m.length > 200) {
    return false;
  }
  for (const p of prefixes) {
    if (m.startsWith(p.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Issues a time-limited signed PUT URL for direct browser → R2 upload.
 * @async
 * @throws {Error} AWS SDK / signing failures.
 * @security-audit-required URL grants write to object key — scope to one `mediaId` and short TTL.
 * @see docs/export-r2-presigned-ttl.md — TTL env and replay behavior (P8-sec-004).
 */
export async function presignR2Put(
  cfg: R2ClientConfig,
  key: string,
  contentType: string,
  expiresInSec: number
): Promise<string> {
  const client = createR2S3Client(cfg);
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSec });
}

/**
 * Reads object metadata via HEAD (size, etag).
 * @async
 * @throws {Error} When object missing or R2/API errors (SDK throws).
 */
export async function headR2ObjectContentLength(
  cfg: R2ClientConfig,
  key: string
): Promise<{ contentLength: number; contentType: string | undefined; etag: string | undefined }> {
  const client = createR2S3Client(cfg);
  const out = await client.send(
    new HeadObjectCommand({ Bucket: cfg.bucket, Key: key })
  );
  return {
    contentLength: out.ContentLength ?? 0,
    contentType: out.ContentType,
    etag: out.ETag
  };
}

/**
 * Deletes an object key (idempotent success when absent).
 * @async
 * @throws {Error} On R2/API errors.
 */
export async function deleteR2Object(cfg: R2ClientConfig, key: string): Promise<void> {
  const client = createR2S3Client(cfg);
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

/**
 * Full object bytes (export / patron flows after entitlement checks).
 * @async
 * @throws {Error} Missing body or GET failures.
 */
export async function getR2ObjectBuffer(cfg: R2ClientConfig, key: string): Promise<Buffer> {
  const client = createR2S3Client(cfg);
  const out = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  if (!out.Body) {
    throw new Error("R2 object has no body");
  }
  return Buffer.from(await out.Body.transformToByteArray());
}

/**
 * Server-side PUT (Discord ingest bridge, workers). Browser uploads use presigned URLs instead.
 * @async
 * @throws {Error} On R2 PUT failures.
 */
export async function putR2ObjectBuffer(
  cfg: R2ClientConfig,
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const client = createR2S3Client(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
}
