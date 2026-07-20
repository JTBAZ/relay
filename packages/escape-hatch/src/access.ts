/**
 * Soft-gate / clone access helpers (mirrors src/clone/tier-rules canAccessPost semantics
 * without requiring the full Relay TierRow catalog).
 */

import type { AccessLevel, ClonePostEntry, DemoPersona } from "./types.js";

export function canAccessPost(
  postAccess: { level: AccessLevel; tier_ids: string[] },
  userTierIds: string[]
): boolean {
  if (postAccess.level === "public") return true;
  if (postAccess.level === "member_only") return userTierIds.length > 0;
  return postAccess.tier_ids.some((t) => userTierIds.includes(t));
}

export function canViewPost(post: ClonePostEntry, persona: DemoPersona): boolean {
  return canAccessPost(post.access, persona.tier_ids);
}

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
