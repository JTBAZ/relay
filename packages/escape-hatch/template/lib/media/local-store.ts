/**
 * Local private media store under data/private-media (EH-033).
 * Used when ESCAPE_HATCH_MEDIA_MODE=local_private (no live R2 required).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { assertContainedMediaFileName, assertSafeMediaId } from "./keys";

export const PRIVATE_MEDIA_DIR_SEGMENTS = ["data", "private-media"] as const;

export function privateMediaRoot(cwd: string = process.cwd()): string {
  return join(cwd, ...PRIVATE_MEDIA_DIR_SEGMENTS);
}

/**
 * Read private bytes for a media id. Fail closed on path escape / missing.
 */
export function readLocalPrivateMedia(
  mediaId: string,
  cwd: string = process.cwd()
): { body: Buffer; contentType: string } | null {
  assertSafeMediaId(mediaId);
  const root = privateMediaRoot(cwd);
  if (!existsSync(root) || !statSync(root).isDirectory()) return null;

  const candidates = [
    `${mediaId}.svg`,
    `${mediaId}.png`,
    `${mediaId}.jpg`,
    `${mediaId}.jpeg`,
    `${mediaId}.webp`,
    `${mediaId}.gif`,
    `${mediaId}.mp4`,
    `${mediaId}.bin`,
    mediaId
  ];

  for (const name of candidates) {
    const safe = assertContainedMediaFileName(name);
    const full = join(root, safe);
    if (!full.startsWith(root)) continue;
    if (existsSync(full) && statSync(full).isFile()) {
      return {
        body: readFileSync(full),
        contentType: contentTypeForName(safe)
      };
    }
  }

  // Fallback: unique file whose basename starts with mediaId.
  try {
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith(mediaId)) continue;
      const safe = assertContainedMediaFileName(entry);
      const full = join(root, safe);
      if (existsSync(full) && statSync(full).isFile()) {
        return {
          body: readFileSync(full),
          contentType: contentTypeForName(safe)
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function contentTypeForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}
