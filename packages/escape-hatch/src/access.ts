/**
 * Soft-gate / clone access helpers.
 * Access evaluation lives in contracts.ts (canonical, aligned with src/clone/tier-rules.ts).
 * Path rewrite helpers are package/CLI utilities, not authorization.
 */

export {
  canAccessPost,
  canViewPost,
  buildTierCatalog,
  isFreeTier,
  paidUserTierIds,
  tierFloorCents,
  userMeetsTierGatesWithOrdering,
  RELAY_TIER_PUBLIC,
  RELAY_TIER_ALL_PATRONS
} from "./contracts.js";

export type {
  AccessLevel,
  ClonePostEntry,
  DemoPersona,
  PreviewTierEntry,
  TierMatchMode
} from "./contracts.js";

export function rewriteMediaContentPath(mediaId: string, extHint?: string): string {
  const ext = extHint?.includes("/")
    ? mimeToExt(extHint)
    : extHint?.startsWith(".")
      ? extHint
      : extHint
        ? `.${extHint.replace(/^\./, "")}`
        : "";
  const safeExt = ext || ".bin";
  return `/media/${mediaId}${safeExt}`;
}

export function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "application/octet-stream": ".bin"
  };
  return map[mime] ?? ".bin";
}

/** Strip Relay API export URLs down to local /media/... paths. */
export function rewriteExportApiPath(
  contentPath: string,
  mediaId: string,
  mimeType?: string
): string {
  if (contentPath.startsWith("/media/")) return contentPath;
  return rewriteMediaContentPath(mediaId, mimeType);
}
