import {
  fetchRelayLibraryStaging,
  RELAY_API_BASE,
  type RelayLibraryStagingItem,
} from "@/lib/relay-api"

export interface StagedMediaItem {
  id: string
  preview: string
  filename: string
  type: "image" | "video" | "audio"
  stagedAt: string
}

function parseFilenameFromPath(path: string | null | undefined): string | null {
  if (!path?.trim()) return null
  const trimmed = path.trim()
  const withoutQuery = trimmed.split("?")[0] ?? trimmed
  const lastSegment = withoutQuery.split("/").filter(Boolean).at(-1)
  if (!lastSegment) return null
  try {
    return decodeURIComponent(lastSegment)
  } catch {
    return lastSegment
  }
}

function extensionFromMime(mime: string | null | undefined): string {
  if (!mime?.includes("/")) return ""
  const ext = mime.split("/")[1]?.toLowerCase().trim()
  if (!ext) return ""
  if (ext === "jpeg") return ".jpg"
  return `.${ext}`
}

function inferStagingFilename(item: RelayLibraryStagingItem): string {
  const discordCapture =
    item.discord_capture && typeof item.discord_capture === "object"
      ? (item.discord_capture as Record<string, unknown>)
      : null
  const captureName = discordCapture?.filename
  if (typeof captureName === "string" && captureName.trim()) {
    return captureName.trim()
  }
  const fromPath = parseFilenameFromPath(item.content_url_path ?? item.thumb_url_path)
  if (fromPath && fromPath.toLowerCase() !== "content" && fromPath.toLowerCase() !== "thumb") {
    return fromPath
  }
  return `staged-${item.media_id.slice(0, 8)}${extensionFromMime(item.mime_type)}`
}

function toAbsoluteRelayUrl(path: string | null | undefined): string {
  if (!path?.trim()) return ""
  if (/^https?:\/\//i.test(path)) return path
  return `${RELAY_API_BASE}${path.startsWith("/") ? path : `/${path}`}`
}

export function toStagedMediaItem(item: RelayLibraryStagingItem): StagedMediaItem {
  const mime = item.mime_type?.toLowerCase() ?? ""
  const isImage = mime.startsWith("image/")
  const type: StagedMediaItem["type"] = mime.startsWith("video/")
    ? "video"
    : mime.startsWith("audio/")
      ? "audio"
      : "image"
  const previewPath = mime === "image/gif"
    ? item.content_url_path ?? item.thumb_url_path
    : item.thumb_url_path ?? item.content_url_path
  return {
    id: item.media_id,
    preview: isImage ? toAbsoluteRelayUrl(previewPath) : "",
    filename: inferStagingFilename(item),
    type,
    stagedAt: item.ingested_at,
  }
}

async function probeImagePreview(url: string): Promise<boolean> {
  if (typeof window === "undefined") return true
  return await new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

export async function filterUsableStagedItems(items: StagedMediaItem[]): Promise<StagedMediaItem[]> {
  const checks = await Promise.all(
    items.map(async (item) => {
      if (item.type !== "image") return item
      if (!item.preview) return null
      const ok = await probeImagePreview(item.preview)
      return ok ? item : null
    })
  )
  return checks.filter((item): item is StagedMediaItem => item !== null)
}

export function dedupeMediaIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

/**
 * Reserved AutopostDraft media is hidden from the staging bin. Build preview rows from
 * export URL conventions so resume can still show thumbs without a separate media fetch.
 */
export function placeholderStagedItemsFromIds(
  creatorId: string,
  mediaIds: string[]
): StagedMediaItem[] {
  const cid = creatorId.trim()
  return dedupeMediaIds(mediaIds).map((id) => {
    const thumb = cid
      ? `${RELAY_API_BASE}/api/v1/export/media/${encodeURIComponent(cid)}/${encodeURIComponent(id)}/thumb`
      : ""
    return {
      id,
      preview: thumb,
      filename: `media-${id.slice(0, 8)}`,
      type: "image" as const,
      stagedAt: new Date(0).toISOString(),
    }
  })
}

export async function loadStagedItemsByIds(
  creatorId: string,
  mediaIds: string[],
  opts?: { skipImageProbe?: boolean; fillReservedPlaceholders?: boolean }
): Promise<StagedMediaItem[]> {
  const cid = creatorId.trim()
  if (!cid || mediaIds.length === 0) return []
  const want = new Set(mediaIds)
  const { items } = await fetchRelayLibraryStaging(cid)
  const mapped = items
    .slice()
    .sort((a, b) => Date.parse(b.ingested_at) - Date.parse(a.ingested_at))
    .map(toStagedMediaItem)
    .filter((item) => want.has(item.id))
  const order = new Map(mediaIds.map((id, index) => [id, index]))
  let sorted = mapped.sort(
    (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  )
  if (opts?.fillReservedPlaceholders) {
    const have = new Set(sorted.map((item) => item.id))
    const missing = mediaIds.filter((id) => !have.has(id))
    if (missing.length > 0) {
      sorted = [...sorted, ...placeholderStagedItemsFromIds(cid, missing)].sort(
        (a, b) =>
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      )
    }
  }
  if (opts?.skipImageProbe) return sorted
  return filterUsableStagedItems(sorted)
}
