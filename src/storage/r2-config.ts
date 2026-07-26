/**
 * @fileoverview Cloudflare R2 — S3-compatible API configuration from env (MIG-30).
 * @description Upload pattern (presigned vs server-proxied), key layout, and limits: `docs/architecture/adr/002-r2-creator-uploads-presigned-vs-server.md` (T-3.1).
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `MediaAsset.currentStorageKey` — keys produced by Relay upload helpers
 * @see https://developers.cloudflare.com/r2/api/s3/api/
 */

/** Resolved R2 S3 client parameters (secrets in `credentials` — do not log). */
export type R2ClientConfig = {
  endpoint: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  bucket: string;
  /** R2 uses `auto`; passed to AWS SDK for SigV4. */
  region: string;
};

/**
 * Returns null if required variables are missing. Does not validate connectivity.
 * Prefer **R2_ACCOUNT_ID** + default endpoint, or set **R2_ENDPOINT** explicitly.
 * @returns Config or `null` when env is incomplete.
 * @security-audit-required Returns live access keys — never log or persist return value.
 */
export function getR2ClientConfigFromEnv(): R2ClientConfig | null {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accessKeyId || !secretAccessKey || !bucket) return null;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const endpointOverride = process.env.R2_ENDPOINT?.trim();
  const endpoint =
    endpointOverride ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
  if (!endpoint) return null;

  const region = process.env.R2_REGION?.trim() || "auto";

  return {
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    bucket,
    region
  };
}
