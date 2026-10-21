/**
 * @fileoverview Shared cross-post package media row assembly (export URLs + ordering).
 */

import type { PrismaClient } from "@prisma/client";
import { MediaUpstreamStatus } from "@prisma/client";

export type CrossPostPackageMediaEntry = {
  media_id: string;
  filename: string;
  mime_type: string;
  content_url: string;
};

/** Relay export route used by the extension to fetch media bytes with its bearer token. */
export function crossPostMediaContentUrlPath(creatorId: string, mediaId: string): string {
  return `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`;
}

export function filenameForMedia(mediaId: string, mimeType: string | null | undefined): string {
  const safeBase = mediaId.replace(/[^\w.-]+/g, "_");
  if (!mimeType?.trim()) {
    return safeBase;
  }
  const mime = mimeType.trim().toLowerCase();
  const ext =
    mime === "image/jpeg"
      ? ".jpg"
      : mime === "image/png"
        ? ".png"
        : mime === "image/gif"
          ? ".gif"
          : mime === "image/webp"
            ? ".webp"
            : mime.startsWith("image/")
              ? ".img"
              : "";
  return ext ? `${safeBase}${ext}` : safeBase;
}

function isImageMimeType(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType?.trim().toLowerCase().startsWith("image/"));
}

/**
 * Loads active creator media rows and builds ordered cross-post package entries.
 * Images are listed before non-images; unknown ids are omitted.
 */
export async function buildCrossPostMediaEntries(
  prisma: PrismaClient,
  creatorId: string,
  mediaIds: string[]
): Promise<CrossPostPackageMediaEntry[]> {
  const normalizedCreatorId = creatorId.trim();
  const orderedIds = mediaIds.map((id) => id.trim()).filter(Boolean);
  if (!normalizedCreatorId || orderedIds.length === 0) {
    return [];
  }

  const mediaRows = await prisma.mediaAsset.findMany({
    where: {
      id: { in: orderedIds },
      creatorId: normalizedCreatorId,
      upstreamStatus: MediaUpstreamStatus.active
    },
    select: {
      id: true,
      currentMimeType: true
    }
  });

  const byId = new Map(mediaRows.map((row) => [row.id, row]));
  const ordered = orderedIds
    .map((id) => byId.get(id))
    .filter((row): row is (typeof mediaRows)[number] => Boolean(row));

  const images = ordered.filter((row) => isImageMimeType(row.currentMimeType));
  const nonImages = ordered.filter((row) => !isImageMimeType(row.currentMimeType));

  return [...images, ...nonImages].map((row) => ({
    media_id: row.id,
    filename: filenameForMedia(row.id, row.currentMimeType),
    mime_type: row.currentMimeType?.trim() || "application/octet-stream",
    content_url: crossPostMediaContentUrlPath(normalizedCreatorId, row.id)
  }));
}
