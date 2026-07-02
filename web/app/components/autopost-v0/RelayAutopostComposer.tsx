"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Video,
  X,
} from "lucide-react"
import {
  createAutopostDraft,
  discardAutopostDraft,
  fetchActiveAutopostDraft,
  fetchRelayLibraryStaging,
  patchAutopostDraft,
  publishAutopostDraft,
  RELAY_API_BASE,
  type AutopostDraftWire,
  type RelayLibraryStagingItem,
} from "@/lib/relay-api"
import { uploadFilesToRelayStaging } from "@/lib/relay-native-staging-upload"
import { useStudioSession } from "@/lib/studio-session-context"
import LibraryUploadZone from "@/app/components/library/LibraryUploadZone"
import { CreatorTierCatalogMultiselect } from "@/app/components/shell/CreatorTierCatalogMultiselect"
import {
  AutopostDistributionSteps,
  type DistributionStep,
} from "@/app/components/distribution/AutopostDistributionSteps"
import Toast from "@/app/components/Toast"

type Step = "pick-media" | "draft-post" | DistributionStep

interface StagedMediaItem {
  id: string
  preview: string
  filename: string
  type: "image" | "video" | "audio"
  stagedAt: string
}

interface ActiveAutopostDraft {
  id: string
  mediaIds: string[]
  createdAt: string
}

type DraftInitialPost = {
  title: string
  description: string
  tags: string[]
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

function toStagedMediaItem(item: RelayLibraryStagingItem): StagedMediaItem {
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

function mapActiveDraftWire(draft: AutopostDraftWire): ActiveAutopostDraft {
  return {
    id: draft.draft_id,
    mediaIds: draft.media_ids,
    createdAt: draft.created_at,
  }
}

function sameMediaSelection(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const ids = new Set(a)
  return b.every((id) => ids.has(id))
}

function draftWireToInitialPost(draft: AutopostDraftWire): DraftInitialPost {
  return {
    title: draft.title?.trim() ?? "",
    description: draft.body_text?.trim() ?? "",
    tags: [],
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

async function filterUsableStagedItems(items: StagedMediaItem[]): Promise<StagedMediaItem[]> {
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

function dedupeMediaIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

async function loadStagedItemsByIds(
  creatorId: string,
  mediaIds: string[],
  opts?: { skipImageProbe?: boolean }
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
  const sorted = mapped.sort(
    (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  )
  if (opts?.skipImageProbe) return sorted
  return filterUsableStagedItems(sorted)
}

function AutopostPrefillBootstrapScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <Loader2 size={28} className="animate-spin" style={{ color: "#00aa6f" }} />
      <p className="text-sm font-medium text-[#f9fafb]">Preparing your post</p>
      <p className="text-xs text-[#6b7280]">Loading selected media from your bin…</p>
    </div>
  )
}

function StepHeader({
  step,
  visualStep,
  postPublished,
  onBack,
}: {
  step: Step
  /** Override progress display (e.g. prefill bootstrap skips pick-media visually). */
  visualStep?: Step
  /** Relay post is committed — Steps 1–2 are locked. */
  postPublished?: boolean
  onBack: () => void
}) {
  const steps: { id: Step; label: string }[] = [
    { id: "pick-media", label: "Pick Media" },
    { id: "draft-post", label: "Relay Post" },
    { id: "variation-planning", label: "Plan" },
    { id: "variant-review", label: "Variants" },
    { id: "cross-post", label: "Cross-post" },
    { id: "complete", label: "Done" },
  ]
  const shownStep = visualStep ?? step
  const activeIdx = steps.findIndex((s) => s.id === shownStep)
  const showBack =
    !visualStep &&
    step !== "pick-media" &&
    step !== "complete" &&
    !(postPublished && step === "variation-planning")

  return (
    <header
      className="w-full flex items-center gap-3 px-5 py-3 border-b flex-shrink-0"
      style={{ borderColor: "#1a1a1a", background: "#000" }}
    >
      {showBack && (
        <button
          onClick={onBack}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
          style={{ color: "#6b7280" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          aria-label="Go back"
        >
          <ArrowLeft size={14} />
        </button>
      )}
      <div className="flex items-center gap-1 flex-1">
        {steps.map((s, i) => {
          const isDone = i < activeIdx
          const isActive = i === activeIdx
          return (
            <div key={s.id} className="flex items-center gap-1">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isDone ? "#00aa6f" : isActive ? "rgba(0,170,111,0.15)" : "#1a1a1a",
                    border: isActive ? "1px solid rgba(0,170,111,0.5)" : isDone ? "none" : "1px solid #2a2a2a",
                  }}
                >
                  {isDone ? (
                    <Check size={9} style={{ color: "#000" }} />
                  ) : (
                    <span style={{ fontSize: "8px", color: isActive ? "#00aa6f" : "#6b7280", fontWeight: 600 }}>
                      {i + 1}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium" style={{ color: isActive ? "#f9fafb" : isDone ? "#00aa6f" : "#6b7280" }}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight size={11} className="mx-0.5" style={{ color: isDone ? "#00aa6f" : "#3a3a3a" }} />
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <Sparkles size={13} style={{ color: "#00aa6f" }} />
        <span className="text-[11px] font-bold tracking-wider" style={{ color: "#00aa6f" }}>RELAY</span>
      </div>
    </header>
  )
}

function PickMediaScreen({
  creatorId,
  initialSelectedIds = [],
  onContinue,
  continueBusy = false,
  continueError = null,
}: {
  creatorId: string
  initialSelectedIds?: string[]
  onContinue: (selectedItems: StagedMediaItem[]) => void
  continueBusy?: boolean
  continueError?: string | null
}) {
  const [bin, setBin] = useState<StagedMediaItem[]>([])
  const [activeDraft, setActiveDraft] = useState<ActiveAutopostDraft | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedCount, setUploadedCount] = useState(0)

  const loadBin = useCallback(async (refresh = false) => {
    const cid = creatorId.trim()
    if (!cid) {
      setError("Sign in to load your media bin.")
      setLoading(false)
      setRefreshing(false)
      return
    }
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [{ items }, active] = await Promise.all([
        fetchRelayLibraryStaging(cid),
        fetchActiveAutopostDraft().catch(() => ({ draft: null })),
      ])
      const normalized = await filterUsableStagedItems(
        items
          .slice()
          .sort((a, b) => Date.parse(b.ingested_at) - Date.parse(a.ingested_at))
          .map(toStagedMediaItem)
      )
      const normalizedDraft = active.draft ? mapActiveDraftWire(active.draft) : null
      const availableIds = new Set(normalized.map((item) => item.id))
      const normalizedDraftMediaIds =
        normalizedDraft?.mediaIds.filter((id) => availableIds.has(id)) ?? []
      setBin(normalized)
      setActiveDraft(
        normalizedDraftMediaIds.length > 0
          ? {
              ...normalizedDraft!,
              mediaIds: normalizedDraftMediaIds,
            }
          : null
      )
      setSelectedIds((prev) => {
        if (prev.length > 0) {
          return prev.filter((id) => availableIds.has(id))
        }
        if (normalizedDraftMediaIds.length > 0) {
          return normalizedDraftMediaIds
        }
        return initialSelectedIds.filter((id) => availableIds.has(id))
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [creatorId, initialSelectedIds])

  useEffect(() => {
    void loadBin(false)
  }, [loadBin])

  const selectedItems = useMemo(
    () => bin.filter((item) => selectedIds.includes(item.id)),
    [bin, selectedIds]
  )

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const handleFiles = useCallback(async (files: File[]) => {
    const cid = creatorId.trim()
    if (!cid) {
      setUploadError("Sign in to upload files to your bin.")
      return
    }
    if (files.length === 0) return
    setUploadBusy(true)
    setUploadError(null)
    try {
      const { uploaded, errors } = await uploadFilesToRelayStaging({
        creatorId: cid,
        files,
      })
      if (uploaded.length > 0) {
        setUploadedCount((prev) => prev + uploaded.length)
        await loadBin(true)
      }
      if (errors.length > 0) {
        setUploadError(errors.join(" "))
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadBusy(false)
    }
  }, [creatorId, loadBin])

  const isEmpty = bin.length === 0

  return (
    <div className="flex flex-col gap-6 w-full max-w-lg mx-auto py-8 px-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold text-[#f9fafb]">Pick from your media bin</h1>
          <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
            Select staged assets for this post.
          </p>
        </div>
        <button
          onClick={() => void loadBin(true)}
          disabled={loading || refreshing || uploadBusy}
          className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-default"
          style={{ borderColor: "#2a2a2a", color: "#9ca3af", background: "#0d0d0d" }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {activeDraft && (
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[11px]"
          style={{ background: "rgba(0,170,111,0.06)", borderColor: "rgba(0,170,111,0.2)", color: "#00aa6f" }}
        >
          <CheckCircle2 size={12} />
          Active draft found - resuming with your previously selected media.
        </div>
      )}

      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-[11px]"
          style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          className="flex items-center justify-center gap-2 rounded-xl border py-8 text-[12px]"
          style={{ borderColor: "#1a1a1a", background: "#0a0a0a", color: "#6b7280" }}
        >
          <Loader2 size={14} className="animate-spin" />
          Loading media bin...
        </div>
      ) : isEmpty ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 text-center px-6"
          style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
        >
          <ImageIcon size={18} style={{ color: "#3a3a3a" }} />
          <div>
            <p className="text-xs font-medium" style={{ color: "#6b7280" }}>Nothing in your bin yet.</p>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "#3a3a3a" }}>
              Upload directly here or keep using Discord and Library Import.
            </p>
          </div>
          <div className="library-shell w-full max-w-md rounded-2xl border border-[var(--lib-border)] bg-black/25 p-4 text-left">
            <LibraryUploadZone
              onFiles={(files) => void handleFiles(files)}
              disabled={uploadBusy}
              helperText="Images, video, and audio upload straight into your staging bin."
            />
            {uploadBusy ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[var(--lib-fg-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Uploading to Relay...
              </p>
            ) : null}
          </div>
          {uploadError && (
            <p
              className="w-full rounded-md border px-2.5 py-2 text-[10px]"
              style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
            >
              {uploadError}
            </p>
          )}
          {uploadedCount > 0 && !uploadError && !uploadBusy && (
            <p className="text-[10px]" style={{ color: "#00aa6f" }}>
              Uploaded {uploadedCount} file{uploadedCount === 1 ? "" : "s"} to your bin.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {bin.map((item) => {
            const isSelected = selectedIds.includes(item.id)
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className="relative rounded-xl overflow-hidden border transition-all duration-150 text-left aspect-square"
                style={{
                  borderColor: isSelected ? "rgba(0,170,111,0.6)" : "#2a2a2a",
                  background: "#111",
                  boxShadow: isSelected ? "0 0 12px rgba(0,170,111,0.15)" : "none",
                }}
              >
                {item.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- staged media thumbs come from Relay API.
                  <img src={item.preview} alt={item.filename} className="w-full h-full object-cover" />
                ) : null}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2"
                  style={{
                    background: item.preview
                      ? isSelected
                        ? "rgba(0,0,0,0.35)"
                        : "rgba(0,0,0,0.55)"
                      : isSelected
                        ? "rgba(0,170,111,0.08)"
                        : "#111",
                  }}
                >
                  <ImageIcon size={20} style={{ color: isSelected ? "#00aa6f" : "#3a3a3a" }} />
                  <span
                    className="text-[9px] text-center leading-tight break-all line-clamp-2 px-1"
                    style={{ color: isSelected ? "#d1d5db" : "#6b7280" }}
                  >
                    {item.filename}
                  </span>
                  {(item.type === "video" || item.type === "audio") && (
                    <span
                      className="text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                      style={{ background: "#1a1a1a", color: "#6b7280" }}
                    >
                      {item.type}
                    </span>
                  )}
                </div>
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: "#00aa6f" }}
                    >
                      <Check size={10} style={{ color: "#000" }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            )
          })}
        </div>
      )}

      {continueError ? (
        <p
          className="rounded-lg border px-3 py-2 text-[11px]"
          style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
        >
          {continueError}
        </p>
      ) : null}

      <button
        disabled={selectedItems.length === 0 || loading || continueBusy}
        onClick={() => onContinue(selectedItems)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        style={
          selectedItems.length > 0 && !continueBusy
            ? { background: "#00aa6f", color: "#000", boxShadow: "0 0 18px rgba(0,170,111,0.22)" }
            : { background: "#1a1a1a", color: "#6b7280" }
        }
      >
        {continueBusy ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Preparing draft...
          </>
        ) : (
          <>
            Continue with {selectedItems.length} file{selectedItems.length !== 1 ? "s" : ""}
            <ChevronRight size={15} />
          </>
        )}
      </button>
    </div>
  )
}

function DraftInitialPostScreen({
  creatorId,
  mediaItems,
  initialDraft,
  onBackToPick,
  onContinue,
  publishBusy = false,
  publishError = null,
}: {
  creatorId: string
  mediaItems: StagedMediaItem[]
  initialDraft: DraftInitialPost | null
  onBackToPick: () => void
  onContinue: (draft: DraftInitialPost, access: { isPublic: boolean; tierIds: string[]; campaignId?: string }) => void
  publishBusy?: boolean
  publishError?: string | null
}) {
  const [title, setTitle] = useState(initialDraft?.title ?? "")
  const [description, setDescription] = useState(initialDraft?.description ?? "")
  const [tags, setTags] = useState<string[]>(initialDraft?.tags ?? [])
  const [tagInput, setTagInput] = useState("")
  const [isPublic, setIsPublic] = useState(true)
  const [tierIds, setTierIds] = useState<string[]>([])
  const [composeCampaignId, setComposeCampaignId] = useState<string | undefined>(undefined)

  const previewMedia = mediaItems[0] ?? null
  const canContinue = title.trim().length > 0 && (isPublic || tierIds.length > 0)

  const addTag = useCallback(() => {
    const next = tagInput.trim().replace(/^#/, "")
    if (!next || tags.includes(next) || tags.length >= 10) return
    setTags((prev) => [...prev, next])
    setTagInput("")
  }, [tagInput, tags])

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }, [])

  const commit = () => {
    if (!canContinue) return
    onContinue(
      {
        title: title.trim(),
        description: description.trim(),
        tags,
      },
      { isPublic, tierIds, campaignId: composeCampaignId }
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      <div className="w-full flex flex-col lg:flex-row gap-6 items-stretch justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex-1 p-4 rounded-2xl border"
          style={{ background: "rgba(17,17,17,0.6)", borderColor: "#1f1f1f" }}
        >
          <div className="flex flex-col gap-4 max-w-2xl mx-auto">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-[#9ca3af]">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give this Relay post a title..."
                className="w-full px-3 py-2.5 text-sm rounded-lg border bg-transparent text-[#f9fafb] placeholder-[#6b7280] focus:outline-none transition-colors"
                style={{ borderColor: "#2a2a2a" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#00aa6f")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
              />
            </div>

            <div className="relative aspect-video rounded-xl border overflow-hidden" style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}>
              {previewMedia ? (
                previewMedia.type === "image" && previewMedia.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- staged media thumb from Relay API.
                  <img src={previewMedia.preview} alt={previewMedia.filename} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#3a3a3a] bg-[#111]">
                    {previewMedia.type === "video" ? <Video size={22} /> : <ImageIcon size={22} />}
                  </div>
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#3a3a3a] bg-[#111]">
                  <ImageIcon size={22} />
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/30 pointer-events-none" />
              <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(0,170,111,0.9)" }}>
                <Check size={12} className="text-black" strokeWidth={3} />
                <span className="text-xs font-medium text-black">Ready to post</span>
              </div>
              <button
                onClick={onBackToPick}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
                aria-label="Change media selection"
              >
                <RefreshCw size={14} className="text-[#9ca3af]" />
              </button>
              {previewMedia ? (
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
                    {previewMedia.type === "video" ? (
                      <Video size={12} className="text-[#9ca3af]" />
                    ) : (
                      <ImageIcon size={12} className="text-[#9ca3af]" />
                    )}
                    <span className="text-[11px] text-[#e5e7eb] font-medium truncate max-w-[220px]">
                      {previewMedia.filename}
                    </span>
                  </div>
                  {mediaItems.length > 1 ? (
                    <span className="text-[10px] px-2 py-1 rounded-full border border-[#2a2a2a] bg-black/70 text-[#9ca3af]">
                      +{mediaItems.length - 1} more
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {mediaItems.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {mediaItems.map((item) => (
                  <div key={item.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#2a2a2a] flex-shrink-0 bg-[#111]">
                    {item.type === "image" && item.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- staged media thumb from Relay API.
                      <img src={item.preview} alt={item.filename} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#3a3a3a]">
                        {item.type === "video" ? <Video size={13} /> : <ImageIcon size={13} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 p-4 rounded-xl border" style={{ background: "#0a0a0a", borderColor: "#2a2a2a" }}>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-[#9ca3af]">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a caption or description for your post..."
                  className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent text-[#f9fafb] placeholder-[#6b7280] resize-none focus:outline-none transition-colors"
                  style={{ borderColor: "#2a2a2a", minHeight: "68px" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#00aa6f")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                />
                <div className="text-[10px] text-[#6b7280]">{description.length} / 500 characters</div>
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "#2a2a2a" }}>
                <label className="text-xs font-medium text-[#9ca3af]">Tags (max 10)</label>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => removeTag(tag)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:opacity-75"
                        style={{
                          background: "rgba(0,170,111,0.15)",
                          color: "#00aa6f",
                          border: "1px solid rgba(0,170,111,0.3)"
                        }}
                        title="Click to remove"
                      >
                        <span>#{tag}</span>
                        <X size={12} />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                    placeholder={tags.length >= 10 ? "Max tags reached" : "Add a tag..."}
                    disabled={tags.length >= 10}
                    className="flex-1 px-3 py-2 text-xs rounded-lg border bg-transparent text-[#f9fafb] placeholder-[#6b7280] focus:outline-none transition-colors disabled:opacity-50"
                    style={{ borderColor: "#2a2a2a" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = tags.length < 10 ? "#00aa6f" : "#2a2a2a"
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#2a2a2a"
                    }}
                  />
                  <button
                    onClick={addTag}
                    disabled={tags.length >= 10 || !tagInput.trim()}
                    className="px-3 py-2 text-xs font-medium rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: tags.length >= 10 || !tagInput.trim() ? "rgba(42,42,42,0.5)" : "rgba(0,170,111,0.15)",
                      color: tags.length >= 10 || !tagInput.trim() ? "#6b7280" : "#00aa6f",
                      borderColor: tags.length >= 10 || !tagInput.trim() ? "#2a2a2a" : "rgba(0,170,111,0.3)"
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {publishError ? (
                <p
                  className="rounded-lg border px-3 py-2 text-[11px]"
                  style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
                >
                  {publishError}
                </p>
              ) : null}
              <button
                onClick={commit}
                disabled={!canContinue || publishBusy}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35"
                style={
                  canContinue && !publishBusy
                    ? { background: "#00aa6f", color: "#000", boxShadow: "0 0 18px rgba(0,170,111,0.25)" }
                    : { background: "#1a1a1a", color: "#6b7280" }
                }
              >
                {publishBusy ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Committing to Relayâ€¦
                  </>
                ) : (
                  <>
                    Commit Relay Post
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="w-full lg:w-[290px] flex flex-col gap-3 p-4 rounded-2xl border"
          style={{ background: "rgba(22,22,22,0.5)", borderColor: "#252525" }}
        >
          <span className="text-[10px] uppercase tracking-widest text-[#9ca3af] font-medium">
            Relay access
          </span>
          <CreatorTierCatalogMultiselect
            creatorId={creatorId}
            value={tierIds}
            onChange={setTierIds}
            isPublic={isPublic}
            onPublicChange={(next) => {
              setIsPublic(next)
              if (next) setTierIds([])
            }}
            onCampaignChange={setComposeCampaignId}
            disabled={publishBusy}
          />
        </motion.div>
      </div>
    </div>
  )
}

export function RelayAutopostComposer({ initialMediaIds = [] }: { initialMediaIds?: string[] }) {
  const { creatorId } = useStudioSession()
  const prefillMediaIds = useMemo(() => dedupeMediaIds(initialMediaIds), [initialMediaIds])
  const [step, setStep] = useState<Step>("pick-media")
  const [selectedMediaItems, setSelectedMediaItems] = useState<StagedMediaItem[]>([])
  const [draftPost, setDraftPost] = useState<DraftInitialPost | null>(null)
  const [autopostDraftId, setAutopostDraftId] = useState<string | null>(null)
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null)
  const [livePostToastOpen, setLivePostToastOpen] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [pickContinueBusy, setPickContinueBusy] = useState(false)
  const [prefillBootstrapping, setPrefillBootstrapping] = useState(prefillMediaIds.length > 0)

  const handlePickMedia = useCallback(async (items: StagedMediaItem[]) => {
    if (!creatorId.trim() || items.length === 0) return
    setSelectedMediaItems(items)
    setPublishError(null)
    setPickContinueBusy(true)
    try {
      const mediaIds = items.map((m) => m.id)
      const { draft: active } = await fetchActiveAutopostDraft()

      if (active && sameMediaSelection(active.media_ids, mediaIds)) {
        setAutopostDraftId(active.draft_id)
        setDraftPost(draftWireToInitialPost(active))
        setStep("draft-post")
        return
      }

      if (active) {
        await discardAutopostDraft(active.draft_id, { force: true })
      }

      const { draft } = await createAutopostDraft({
        media_ids: mediaIds,
        generate: false,
      })
      setAutopostDraftId(draft.draft_id)
      setDraftPost(null)
      setStep("draft-post")
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Could not create draft.")
    } finally {
      setPickContinueBusy(false)
    }
  }, [creatorId])

  useEffect(() => {
    if (prefillMediaIds.length === 0) {
      setPrefillBootstrapping(false)
      return
    }
    const cid = creatorId.trim()
    if (!cid) return

    let cancelled = false
    void (async () => {
      setPrefillBootstrapping(true)
      setPublishError(null)
      try {
        const items = await loadStagedItemsByIds(cid, prefillMediaIds, { skipImageProbe: true })
        if (cancelled) return
        if (items.length === 0) {
          setPublishError("Selected media is no longer in your bin. Pick assets again.")
          setPrefillBootstrapping(false)
          return
        }
        await handlePickMedia(items)
      } catch (e) {
        if (!cancelled) {
          setPublishError(e instanceof Error ? e.message : "Could not load selected media.")
        }
      } finally {
        if (!cancelled) setPrefillBootstrapping(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [creatorId, handlePickMedia, prefillMediaIds])

  const handlePublishToRelay = useCallback(async (
    draft: DraftInitialPost,
    access: { isPublic: boolean; tierIds: string[]; campaignId?: string }
  ) => {
    if (selectedMediaItems.length === 0 || !creatorId.trim() || !autopostDraftId) return
    setPublishBusy(true)
    setPublishError(null)
    try {
      await patchAutopostDraft(autopostDraftId, {
        title: draft.title.trim(),
        body_text: draft.description.trim() || null,
      })
      const result = await publishAutopostDraft(autopostDraftId, {
        is_public: access.isPublic,
        tier_ids: access.isPublic ? [] : access.tierIds,
        campaign_id: access.campaignId ?? null,
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        tag_ids: draft.tags,
      })
      setPublishedPostId(result.post_id)
      setDraftPost(draft)
      setLivePostToastOpen(true)
      setStep("variation-planning")
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed. Try again.")
    } finally {
      setPublishBusy(false)
    }
  }, [creatorId, selectedMediaItems, autopostDraftId])

  const handleDraftContinue = useCallback((
    draft: DraftInitialPost,
    access: { isPublic: boolean; tierIds: string[]; campaignId?: string }
  ) => {
    void handlePublishToRelay(draft, access)
  }, [handlePublishToRelay])

  const handleBack = useCallback(() => {
    setStep((current) => {
      if (publishedPostId) {
        if (current === "variation-planning") return current
        if (current === "variant-review") return "variation-planning"
        if (current === "cross-post") return "variant-review"
        return current
      }
      if (current === "draft-post") return "pick-media"
      if (current === "variation-planning") return "draft-post"
      if (current === "variant-review") return "variation-planning"
      if (current === "cross-post") return "variant-review"
      return current
    })
  }, [publishedPostId])

  const goBackToPickFromDraft = useCallback(() => {
    if (publishedPostId) return
    setStep("pick-media")
  }, [publishedPostId])

  const showPrefillBootstrap = prefillBootstrapping && step === "pick-media"

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "#000", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}
    >
      {livePostToastOpen ? (
        <Toast
          message="Your Relay post is live. Edit title or tags from your Library."
          onDismiss={() => setLivePostToastOpen(false)}
          duration={4000}
        />
      ) : null}
      <StepHeader
        step={step}
        visualStep={showPrefillBootstrap ? "draft-post" : undefined}
        postPublished={Boolean(publishedPostId)}
        onBack={handleBack}
      />

      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {showPrefillBootstrap && <AutopostPrefillBootstrapScreen />}

          {step === "pick-media" && !showPrefillBootstrap && (
            <motion.div
              key="pick-media"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
            >
              <PickMediaScreen
                creatorId={creatorId}
                initialSelectedIds={
                  prefillMediaIds.length > 0
                    ? prefillMediaIds
                    : selectedMediaItems.map((item) => item.id)
                }
                onContinue={(items) => void handlePickMedia(items)}
                continueBusy={pickContinueBusy}
                continueError={publishError}
              />
            </motion.div>
          )}

          {step === "draft-post" && (
            <motion.div
              key="draft-post"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              <DraftInitialPostScreen
                creatorId={creatorId}
                mediaItems={selectedMediaItems}
                initialDraft={draftPost}
                onBackToPick={goBackToPickFromDraft}
                onContinue={handleDraftContinue}
                publishBusy={publishBusy}
                publishError={publishError}
              />
            </motion.div>
          )}

          {(step === "variation-planning" ||
            step === "variant-review" ||
            step === "cross-post" ||
            step === "complete") &&
            publishedPostId && (
            <motion.div
              key="distribution"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              <AutopostDistributionSteps
                postId={publishedPostId}
                sourceDraftId={autopostDraftId}
                mediaItems={selectedMediaItems}
                step={step}
                onStepChange={setStep}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
