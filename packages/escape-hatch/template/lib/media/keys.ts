/**
 * Opaque Escape Hatch media object keys (EH-033 delivery; matches EH-012 layout).
 * Layout: `eh/{creator_id}/{site_id}/media/{media_id}/object`
 */

export const ESCAPE_HATCH_MEDIA_KEY_SEGMENT = "object" as const;

function isSafeKeySegment(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 256 &&
    /^[A-Za-z0-9_.:-]+$/.test(value) &&
    value !== "." &&
    !value.includes("..")
  );
}

export function assertSafeMediaId(mediaId: string): void {
  if (!isSafeKeySegment(mediaId)) {
    throw new Error("unsafe media_id");
  }
}

export function buildEscapeHatchMediaObjectKey(
  creatorId: string,
  siteId: string,
  mediaId: string
): string {
  if (!isSafeKeySegment(creatorId)) {
    throw new Error("unsafe creator_id for object key");
  }
  if (!isSafeKeySegment(siteId)) {
    throw new Error("unsafe site_id for object key");
  }
  if (!isSafeKeySegment(mediaId)) {
    throw new Error("unsafe media_id for object key");
  }
  const key = `eh/${creatorId}/${siteId}/media/${mediaId}/${ESCAPE_HATCH_MEDIA_KEY_SEGMENT}`;
  if (key.includes("..") || key.includes("\0") || key.includes("\\")) {
    throw new Error("unsafe object key");
  }
  if (/^public\/media\//i.test(key) || /^\/media\//i.test(key)) {
    throw new Error("public media paths are not private object keys");
  }
  return key;
}

export function isEscapeHatchMediaObjectKey(key: string): boolean {
  return /^eh\/[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+\/media\/[A-Za-z0-9_.:-]+\/object$/.test(
    key
  );
}

/** Reject path traversal / absolute escapes when joining under a root. */
export function assertContainedMediaFileName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    throw new Error("unsafe media file name");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(normalized.split("/").pop() ?? "")) {
    throw new Error("unsafe media file name");
  }
  return normalized;
}
