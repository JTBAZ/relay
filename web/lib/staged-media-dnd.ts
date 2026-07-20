/** Shared drag payload between Import Bay and Schedule Rail Drop Assets. */

export const RELAY_STAGED_MEDIA_MIME = "application/x-relay-staged-media";

export type StagedMediaDragItem = {
  id: string;
  src: string | null;
  filename: string;
  mimeType: string;
};

export type StagedMediaDragPayload = {
  media_ids: string[];
  items?: StagedMediaDragItem[];
};

export function serializeStagedMediaDrag(payload: StagedMediaDragPayload): string {
  return JSON.stringify(payload);
}

export function parseStagedMediaDrag(raw: string | null | undefined): StagedMediaDragPayload | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const mediaIds = (parsed as { media_ids?: unknown }).media_ids;
    if (!Array.isArray(mediaIds)) return null;
    const ids = mediaIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    if (ids.length === 0) return null;
    const itemsRaw = (parsed as { items?: unknown }).items;
    const items: StagedMediaDragItem[] = [];
    if (Array.isArray(itemsRaw)) {
      for (const row of itemsRaw) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        if (typeof r.id !== "string" || !r.id.trim()) continue;
        items.push({
          id: r.id,
          src: typeof r.src === "string" ? r.src : null,
          filename: typeof r.filename === "string" ? r.filename : r.id,
          mimeType: typeof r.mimeType === "string" ? r.mimeType : "application/octet-stream",
        });
      }
    }
    return { media_ids: ids, items: items.length > 0 ? items : undefined };
  } catch {
    return null;
  }
}

export function readStagedMediaDrag(dt: DataTransfer | null): StagedMediaDragPayload | null {
  if (!dt) return null;
  const typed = parseStagedMediaDrag(dt.getData(RELAY_STAGED_MEDIA_MIME));
  if (typed) return typed;
  // Fallback for browsers that only expose text/plain during drop
  return parseStagedMediaDrag(dt.getData("text/plain"));
}
