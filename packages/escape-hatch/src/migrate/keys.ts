/**
 * Escape Hatch creator-owned media object keys (EH-012).
 *
 * Distinct from Relay `relay/tenants/{creatorId}/media/{mediaId}/asset`.
 * Keys are opaque creator/site-scoped paths — not world-guessable public URLs.
 */

import { assertPrivateObjectKey } from "./validate.js";

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

/**
 * Build opaque private object key for creator-owned site media.
 * Layout: `eh/{creator_id}/{site_id}/media/{media_id}/object`
 */
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
  assertPrivateObjectKey(key);
  return key;
}

export function isEscapeHatchMediaObjectKey(key: string): boolean {
  return /^eh\/[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+\/media\/[A-Za-z0-9_.:-]+\/object$/.test(
    key
  );
}
