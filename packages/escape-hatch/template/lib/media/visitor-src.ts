/**
 * Client-safe visitor media URL helpers (EH-033).
 * No secrets — path construction only.
 */

export function isPremiumAccessLevel(level: string): boolean {
  return level === "member_only" || level === "tier_gated";
}

/**
 * Authenticated delivery path for a media id.
 * Browser requests hit the server gate (evaluateAccess → sign/proxy).
 */
export function visitorMediaApiPath(mediaId: string): string {
  if (!mediaId || !/^[A-Za-z0-9_.:-]+$/.test(mediaId)) {
    throw new Error("unsafe media_id for visitor path");
  }
  return `/api/media/${encodeURIComponent(mediaId)}`;
}

/**
 * Resolve the img/src URL for a gallery/post asset.
 * Premium assets always use the API path when private delivery is preferred.
 * Public assets may stay on static `/media/...` paths.
 */
export function resolveVisitorMediaSrc(input: {
  mediaId: string;
  contentPath: string;
  accessLevel: string;
  /** When true (default), premium uses /api/media. */
  privateDelivery?: boolean;
}): string {
  const privateDelivery = input.privateDelivery !== false;
  if (privateDelivery && isPremiumAccessLevel(input.accessLevel)) {
    return visitorMediaApiPath(input.mediaId);
  }
  return input.contentPath;
}
