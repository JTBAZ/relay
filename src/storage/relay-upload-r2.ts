import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { R2ClientConfig } from "./r2-config.js";
import { createR2S3Client } from "./r2-s3-client.js";

/** Object key tail segment per ADR 002. */
export const RELAY_R2_KEY_SEGMENT = "asset";

const DEFAULT_MAX_BYTES = 524_288_000; // 500 MiB
const DEFAULT_PRESIGN_SEC = 900;
const DEFAULT_MIME_PREFIXES = ["video/", "audio/", "image/"];

export function buildRelayR2ObjectKey(creatorId: string, mediaId: string): string {
  return `relay/tenants/${creatorId}/media/${mediaId}/${RELAY_R2_KEY_SEGMENT}`;
}

export function getRelayUploadMaxBytes(): number {
  const raw = process.env.RELAY_UPLOAD_MAX_BYTES?.trim();
  if (!raw) {
    return DEFAULT_MAX_BYTES;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

export function getPresignExpiresSec(): number {
  const raw = process.env.R2_PRESIGN_EXPIRES_SEC?.trim();
  if (!raw) {
    return DEFAULT_PRESIGN_SEC;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 60 && n <= 14_400 ? n : DEFAULT_PRESIGN_SEC;
}

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
 * Returns ContentLength when present, or 0. Throws if the object is missing.
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

/** Full object bytes (for export/patron `GET` after presigned PUT). */
export async function getR2ObjectBuffer(cfg: R2ClientConfig, key: string): Promise<Buffer> {
  const client = createR2S3Client(cfg);
  const out = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  if (!out.Body) {
    throw new Error("R2 object has no body");
  }
  return Buffer.from(await out.Body.transformToByteArray());
}

/** Server-side PUT (Discord ingest bridge, workers). Browser uploads use presigned URLs instead. */
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
