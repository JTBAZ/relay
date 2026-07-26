/**
 * @fileoverview MIG-31 — policy helpers for safe media delivery (avoid unauthenticated public object URLs for premium content).
 * @description Prefer API-mediated delivery (`GET …/export/media/…/content`) or short-lived signed URLs after entitlement checks.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `MediaAsset` storage fields consumed by export / patron routes
 */

/**
 * Heuristic: URL looks like a **public** S3/R2-style object URL that could bypass app entitlements
 * if embedded in HTML or returned as the primary `src` for paid content. Use to lint responses or docs.
 * (Patreon CDN / image URLs are a separate category — still gate by tier in API layer.)
 * @param url Candidate absolute URL string.
 */
export function looksLikePublicDirectObjectStorageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
  if (u.includes(".r2.dev/")) return true;
  if (u.includes(".r2.cloudflarestorage.com/")) return true;
  if (u.includes("s3.amazonaws.com/")) return true;
  if (u.includes(".s3.") && u.includes(".amazonaws.com/")) return true;
  return false;
}
