"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ImageIcon, Loader2, Trash2 } from "lucide-react"
import {
  discardAutopostDraft,
  fetchConnectedPlatforms,
  fetchRelayLibraryStaging,
  listAutopostDrafts,
  RelayApiError,
  type AutopostDraftWire,
  type ConnectedPlatformWire,
  type DistributionDestination,
} from "@/lib/relay-api"
import { uploadFilesToRelayStaging } from "@/lib/relay-native-staging-upload"
import {
  filterUsableStagedItems,
  placeholderStagedItemsFromIds,
  toStagedMediaItem,
  type StagedMediaItem,
} from "@/app/components/autopost-v0/staged-media-utils"

function isPlatformSelectable(platform: ConnectedPlatformWire): boolean {
  return platform.readiness !== "disabled" && platform.readiness !== "unsupported"
}

function defaultSelectableDestinations(platforms: ConnectedPlatformWire[]): DistributionDestination[] {
  return platforms.filter(isPlatformSelectable).map((p) => p.destination)
}

function formatRelativeUpdated(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (sec < 60) return "just now"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

function draftDisplayTitle(draft: AutopostDraftWire): string {
  return draft.title?.trim() || draft.intent?.trim() || "Untitled draft"
}

function draftStatusLabel(draft: AutopostDraftWire): string {
  if (draft.status === "nudged" || draft.media_ids.length === 0) return "Waiting for art"
  if (draft.status === "drafting") return "Drafting"
  if (draft.status === "previewing") return "In progress"
  return draft.status
}

export type UploadAndSelectContinuePayload = {
  selectedItems: StagedMediaItem[]
  selectedDestinations: DistributionDestination[]
}

type Props = {
  creatorId: string
  initialSelectedIds?: string[]
  initialSelectedDestinations?: DistributionDestination[]
  onContinue: (payload: UploadAndSelectContinuePayload) => void
  onResumeDraft: (draft: AutopostDraftWire) => void
  /** Clears the composer’s open draft so Continue creates a new one. */
  onStartNewDraft?: () => void
  continueBusy?: boolean
  continueError?: string | null
  /** Draft currently opened in the composer (resume/patch target). */
  openDraftId?: string | null
}

type BinTab = "media" | "drafts"

export function UploadAndSelectScreen({
  creatorId,
  initialSelectedIds = [],
  initialSelectedDestinations = [],
  onContinue,
  onResumeDraft,
  onStartNewDraft,
  continueBusy = false,
  continueError = null,
  openDraftId = null,
}: Props) {
  const [tab, setTab] = useState<BinTab>("media")
  const [bin, setBin] = useState<StagedMediaItem[]>([])
  const [platforms, setPlatforms] = useState<ConnectedPlatformWire[]>([])
  const [drafts, setDrafts] = useState<AutopostDraftWire[]>([])
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [draftsError, setDraftsError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds)
  const [selectedDestinations, setSelectedDestinations] = useState<DistributionDestination[]>(
    initialSelectedDestinations
  )
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [platformsInitialized, setPlatformsInitialized] = useState(false)
  const [discardBusyId, setDiscardBusyId] = useState<string | null>(null)
  const [discardConfirm, setDiscardConfirm] = useState<{
    draftId: string
    message: string
  } | null>(null)

  const loadBin = useCallback(
    async (refresh = false) => {
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
        const [{ items }, connected] = await Promise.all([
          fetchRelayLibraryStaging(cid),
          fetchConnectedPlatforms().catch(() => ({ platforms: [] as ConnectedPlatformWire[] })),
        ])
        const normalized = await filterUsableStagedItems(
          items
            .slice()
            .sort((a, b) => Date.parse(b.ingested_at) - Date.parse(a.ingested_at))
            .map(toStagedMediaItem)
        )
        const availableIds = new Set(normalized.map((item) => item.id))
        setBin(normalized)
        setPlatforms(connected.platforms)
        setSelectedIds((prev) => {
          if (prev.length > 0) return prev.filter((id) => availableIds.has(id))
          return initialSelectedIds.filter((id) => availableIds.has(id))
        })
        if (!platformsInitialized) {
          const selectable = defaultSelectableDestinations(connected.platforms)
          setSelectedDestinations(
            initialSelectedDestinations.length > 0
              ? initialSelectedDestinations.filter((dest) => selectable.includes(dest))
              : selectable
          )
          setPlatformsInitialized(true)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [creatorId, initialSelectedIds, initialSelectedDestinations, platformsInitialized]
  )

  const loadDrafts = useCallback(async () => {
    const cid = creatorId.trim()
    if (!cid) {
      setDraftsError("Sign in to load drafts.")
      return
    }
    setDraftsLoading(true)
    setDraftsError(null)
    try {
      const { drafts: rows } = await listAutopostDrafts({ status: "active", limit: 50 })
      setDrafts(rows)
    } catch (e) {
      setDraftsError(e instanceof Error ? e.message : String(e))
    } finally {
      setDraftsLoading(false)
    }
  }, [creatorId])

  useEffect(() => {
    void loadBin(false)
  }, [loadBin])

  useEffect(() => {
    if (tab === "drafts") void loadDrafts()
  }, [tab, loadDrafts])

  const selectedItems = useMemo(
    () => bin.filter((item) => selectedIds.includes(item.id)),
    [bin, selectedIds]
  )

  const selectablePlatforms = useMemo(
    () => platforms.filter(isPlatformSelectable),
    [platforms]
  )

  const toggleMedia = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const toggleDestination = (destination: DistributionDestination) => {
    setSelectedDestinations((prev) =>
      prev.includes(destination)
        ? prev.filter((d) => d !== destination)
        : [...prev, destination]
    )
  }

  const allPlatformsSelected =
    selectablePlatforms.length > 0 &&
    selectablePlatforms.every((p) => selectedDestinations.includes(p.destination))

  const toggleAllPlatforms = () => {
    if (allPlatformsSelected) {
      setSelectedDestinations([])
      return
    }
    setSelectedDestinations(selectablePlatforms.map((p) => p.destination))
  }

  const handleFiles = useCallback(
    async (files: File[]) => {
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
    },
    [creatorId, loadBin]
  )

  const runDiscard = useCallback(
    async (draftId: string, force: boolean) => {
      setDiscardBusyId(draftId)
      setDraftsError(null)
      try {
        await discardAutopostDraft(draftId, force ? { force: true } : undefined)
        setDiscardConfirm(null)
        await loadDrafts()
      } catch (e) {
        if (
          !force &&
          e instanceof RelayApiError &&
          e.status === 409 &&
          e.code === "DISCARD_WARNING"
        ) {
          setDiscardConfirm({
            draftId,
            message:
              e.message ||
              "This draft was already cross-posted. Discard anyway?",
          })
        } else {
          setDraftsError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        setDiscardBusyId(null)
      }
    },
    [loadDrafts]
  )

  const canContinue =
    selectedItems.length > 0 && selectedDestinations.length > 0 && !loading && !continueBusy

  const isEmpty = bin.length === 0
  const [isDragging, setIsDragging] = useState(false)

  const handleDropFiles = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) void handleFiles(files)
    },
    [handleFiles]
  )

  const handleInputFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length > 0) void handleFiles(files)
    },
    [handleFiles]
  )

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-[#f9fafb] text-balance">
          Upload once, reach{" "}
          <span style={{ color: "#00aa6f" }}>everywhere</span>
        </h1>
        <p className="text-sm text-[#9ca3af] mt-2 text-balance">
          Pick staged media and choose where this post will cross-post.
        </p>
      </div>

      <div
        className="flex w-full rounded-full border p-1 gap-1"
        style={{ borderColor: "#2a2a2a", background: "#0d0d0d" }}
        role="tablist"
        aria-label="Media or drafts"
      >
        {(["media", "drafts"] as const).map((id) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className="flex-1 py-2 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: active ? "rgba(0,170,111,0.15)" : "transparent",
                color: active ? "#00aa6f" : "#6b7280",
              }}
            >
              {id === "media" ? "Media" : "Drafts"}
            </button>
          )
        })}
      </div>

      {error && tab === "media" ? (
        <div
          className="rounded-lg border px-3 py-2 text-[11px] w-full"
          style={{
            borderColor: "rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      ) : null}

      {tab === "media" && openDraftId ? (
        <div
          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-[11px]"
          style={{
            background: "rgba(0,170,111,0.06)",
            borderColor: "rgba(0,170,111,0.2)",
            color: "#00aa6f",
          }}
        >
          <span>Continue will update your open draft.</span>
          {onStartNewDraft ? (
            <button
              type="button"
              onClick={onStartNewDraft}
              className="text-[11px] font-semibold underline-offset-2 hover:underline"
              style={{ color: "#9ca3af" }}
            >
              Start new instead
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === "drafts" ? (
        <div className="w-full flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#f9fafb]">Open drafts</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>
                Resume a saved Autopost draft, or discard ones you no longer need.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDrafts()}
              disabled={draftsLoading}
              className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
              style={{ borderColor: "#2a2a2a", color: "#9ca3af", background: "#0d0d0d" }}
            >
              {draftsLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {draftsError ? (
            <div
              className="rounded-lg border px-3 py-2 text-[11px]"
              style={{
                borderColor: "rgba(239,68,68,0.35)",
                background: "rgba(239,68,68,0.08)",
                color: "#fca5a5",
              }}
            >
              {draftsError}
            </div>
          ) : null}

          {draftsLoading && drafts.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[12px]" style={{ color: "#6b7280" }}>
              <Loader2 size={14} className="animate-spin" />
              Loading drafts…
            </div>
          ) : drafts.length === 0 ? (
            <div
              className="rounded-2xl border px-4 py-10 text-center"
              style={{ borderColor: "#1f1f1f", background: "rgba(17,17,17,0.6)" }}
            >
              <p className="text-sm text-[#f9fafb]">No open drafts</p>
              <p className="text-xs text-[#6b7280] mt-1">
                Start on the Media tab — drafts autosave as you compose.
              </p>
              <button
                type="button"
                onClick={() => setTab("media")}
                className="mt-4 text-xs font-semibold px-4 py-2 rounded-full"
                style={{ background: "rgba(0,170,111,0.15)", color: "#00aa6f" }}
              >
                Go to Media
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {drafts.map((draft) => {
                const waiting = draft.media_ids.length === 0 || draft.status === "nudged"
                const thumbItem = waiting
                  ? null
                  : placeholderStagedItemsFromIds(creatorId, draft.media_ids.slice(0, 1))[0]
                const isOpen = openDraftId === draft.draft_id
                return (
                  <li key={draft.draft_id}>
                    <div
                      className="flex items-stretch gap-2 rounded-xl border overflow-hidden"
                      style={{
                        borderColor: isOpen ? "rgba(0,170,111,0.45)" : "#2a2a2a",
                        background: "rgba(17,17,17,0.7)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onResumeDraft(draft)}
                        className="flex flex-1 items-center gap-3 text-left px-3 py-3 min-w-0 hover:bg-white/[0.03] transition-colors"
                      >
                        <div
                          className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border"
                          style={{ borderColor: "#2a2a2a", background: "#111" }}
                        >
                          {waiting ? (
                            <span className="text-[8px] text-center leading-tight px-1" style={{ color: "#6b7280" }}>
                              Waiting for art
                            </span>
                          ) : thumbItem?.preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbItem.preview}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon size={16} style={{ color: "#3a3a3a" }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-[#f9fafb] truncate">
                              {draftDisplayTitle(draft)}
                            </p>
                            {isOpen ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(0,170,111,0.15)", color: "#00aa6f" }}>
                                Open
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full border"
                              style={{ borderColor: "#2a2a2a", color: "#9ca3af" }}
                            >
                              {draftStatusLabel(draft)}
                            </span>
                            <span className="text-[10px]" style={{ color: "#6b7280" }}>
                              {formatRelativeUpdated(draft.updated_at)}
                            </span>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label="Discard draft"
                        disabled={discardBusyId === draft.draft_id}
                        onClick={(e) => {
                          e.stopPropagation()
                          void runDiscard(draft.draft_id, false)
                        }}
                        className="px-3 flex items-center justify-center border-l disabled:opacity-40"
                        style={{ borderColor: "#2a2a2a", color: "#6b7280" }}
                      >
                        {discardBusyId === draft.draft_id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {discardConfirm ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: "rgba(0,0,0,0.72)" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="discard-warning-title"
            >
              <div
                className="w-full max-w-sm rounded-2xl border p-5 flex flex-col gap-4"
                style={{ background: "#111", borderColor: "#2a2a2a" }}
              >
                <h3 id="discard-warning-title" className="text-sm font-bold text-[#f9fafb]">
                  Discard this draft?
                </h3>
                <p className="text-xs text-[#9ca3af] leading-relaxed">{discardConfirm.message}</p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscardConfirm(null)}
                    className="px-3 py-2 rounded-full text-xs font-medium border"
                    style={{ borderColor: "#2a2a2a", color: "#9ca3af" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={discardBusyId === discardConfirm.draftId}
                    onClick={() => void runDiscard(discardConfirm.draftId, true)}
                    className="px-3 py-2 rounded-full text-xs font-bold"
                    style={{ background: "#b91c1c", color: "#fff" }}
                  >
                    {discardBusyId === discardConfirm.draftId ? "Discarding…" : "Discard anyway"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="w-full flex flex-col lg:flex-row gap-6 items-stretch justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 p-4 rounded-2xl border flex flex-col gap-4"
              style={{ background: "rgba(17,17,17,0.6)", borderColor: "#1f1f1f" }}
            >
              {!isEmpty && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-[#f9fafb]">Your media bin</h2>
                    <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>
                      Select assets for this Relay post.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadBin(true)}
                    disabled={loading || refreshing || uploadBusy}
                    className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
                    style={{ borderColor: "#2a2a2a", color: "#9ca3af", background: "#0d0d0d" }}
                  >
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-[12px]" style={{ color: "#6b7280" }}>
                  <Loader2 size={14} className="animate-spin" />
                  Loading media bin…
                </div>
              ) : isEmpty ? (
                <label
                  htmlFor="autopost-upload-input"
                  className="flex flex-col items-center justify-center gap-4 p-8 cursor-pointer aspect-video"
                  onDrop={handleDropFiles}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                >
                  <input
                    id="autopost-upload-input"
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleInputFiles}
                  />
                  <motion.div
                    animate={{ y: isDragging ? -4 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center transition-colors duration-300"
                    style={{
                      background: isDragging ? "rgba(197,179,88,0.15)" : "rgba(0,170,111,0.1)",
                      border: `1px solid ${isDragging ? "rgba(197,179,88,0.4)" : "rgba(0,170,111,0.3)"}`,
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={isDragging ? "#c5b358" : "#00aa6f"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-colors duration-300"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </motion.div>

                  <div className="text-center">
                    <p className="text-sm font-medium text-[#f9fafb]">
                      {isDragging ? "Drop to upload" : "Drop your media here"}
                    </p>
                    <p className="text-xs text-[#9ca3af] mt-1">or click to browse</p>
                  </div>

                  {uploadBusy ? (
                    <p className="flex items-center gap-2 text-xs" style={{ color: "#9ca3af" }}>
                      <Loader2 size={12} className="animate-spin" />
                      Uploading to Relay…
                    </p>
                  ) : null}
                  {uploadError ? (
                    <p className="text-[10px]" style={{ color: "#fca5a5" }}>
                      {uploadError}
                    </p>
                  ) : null}
                  {uploadedCount > 0 && !uploadError && !uploadBusy ? (
                    <p className="text-[10px]" style={{ color: "#00aa6f" }}>
                      Uploaded {uploadedCount} file{uploadedCount === 1 ? "" : "s"} to your bin.
                    </p>
                  ) : null}
                </label>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {bin.map((item) => {
                    const isSelected = selectedIds.includes(item.id)
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => toggleMedia(item.id)}
                        className="relative rounded-xl overflow-hidden border transition-all duration-200 text-left aspect-square"
                        style={{
                          borderColor: isSelected ? "#00aa6f" : "#2a2a2a",
                          background: "#111",
                          boxShadow: isSelected ? "0 0 16px rgba(0,170,111,0.18)" : "none",
                        }}
                      >
                        {item.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.preview}
                            alt={item.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                        <div
                          className="absolute inset-0 flex flex-col items-center justify-end gap-1 p-2"
                          style={{
                            background: item.preview
                              ? isSelected
                                ? "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)"
                                : "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)"
                              : isSelected
                                ? "rgba(0,170,111,0.08)"
                                : "#111",
                          }}
                        >
                          {!item.preview && (
                            <ImageIcon size={20} style={{ color: isSelected ? "#00aa6f" : "#3a3a3a" }} />
                          )}
                          <span
                            className="text-[9px] text-center leading-tight break-all line-clamp-2 px-1"
                            style={{ color: isSelected ? "#e5e7eb" : "#9ca3af" }}
                          >
                            {item.filename}
                          </span>
                        </div>
                        <AnimatePresence>
                          {isSelected ? (
                            <motion.div
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.5, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ background: "#00aa6f", boxShadow: "0 2px 8px rgba(0,170,111,0.4)" }}
                            >
                              <Check size={10} style={{ color: "#000" }} strokeWidth={3} />
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </motion.button>
                    )
                  })}
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full lg:w-auto flex flex-col gap-3 p-4 rounded-2xl border"
              style={{ background: "rgba(22,22,22,0.5)", borderColor: "#252525" }}
            >
              <span className="text-[10px] uppercase tracking-widest text-[#9ca3af] font-medium">
                Distribute to
              </span>

              {loading ? (
                <p className="text-[11px] text-[#6b7280]">Loading platforms…</p>
              ) : selectablePlatforms.length === 0 ? (
                <p className="text-[11px] text-[#6b7280]">
                  No cross-post destinations connected yet. Connect platforms in Autopost settings.
                </p>
              ) : (
                <>
                  <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible lg:flex-wrap lg:content-start">
                    {selectablePlatforms.map((platform, index) => {
                      const isSelected = selectedDestinations.includes(platform.destination)
                      return (
                        <motion.button
                          key={platform.destination}
                          type="button"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + index * 0.05, duration: 0.3 }}
                          onClick={() => toggleDestination(platform.destination)}
                          className="flex-shrink-0 lg:flex-shrink group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full border transition-all duration-300 hover:scale-[1.03]"
                          style={{
                            background: isSelected ? "rgba(0,170,111,0.08)" : "rgba(42,42,42,0.3)",
                            borderColor: isSelected ? "#00aa6f" : "#2a2a2a",
                            boxShadow: isSelected ? "0 0 12px rgba(0,170,111,0.15)" : "none",
                          }}
                          title={
                            platform.detail ??
                            `${platform.readiness.replace(/_/g, " ")} · ${platform.handoff}`
                          }
                        >
                          <span
                            className="text-sm font-bold min-w-[1.25rem]"
                            style={{ color: isSelected ? "#00aa6f" : "#6b7280" }}
                          >
                            {platform.destination === "x"
                              ? "X"
                              : platform.destination === "deviantart"
                                ? "DA"
                                : platform.destination === "bluesky"
                                  ? "BS"
                                  : "P"}
                          </span>
                          <span
                            className={`text-xs font-medium hidden lg:inline transition-colors ${
                              isSelected ? "text-[#00aa6f]" : "text-[#6b7280]"
                            }`}
                          >
                            {platform.label}
                          </span>
                          <motion.div
                            initial={false}
                            animate={{ scale: isSelected ? 1 : 0.6, opacity: isSelected ? 1 : 0.3 }}
                            transition={{ duration: 0.2 }}
                            className="w-5 h-5 rounded-full flex items-center justify-center ml-auto"
                            style={{ background: isSelected ? "#00aa6f" : "#2a2a2a" }}
                          >
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                                <path
                                  d="M2 5L4.2 7.5L8 2.5"
                                  stroke="black"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </motion.div>
                        </motion.button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={toggleAllPlatforms}
                    className="text-xs text-[#9ca3af] hover:text-[#00aa6f] transition-colors px-4 py-2 rounded-full border border-[#2a2a2a] hover:border-[#00aa6f]/30 whitespace-nowrap self-start lg:self-center"
                  >
                    {allPlatformsSelected ? "Deselect all" : "Select all"}
                  </button>
                </>
              )}
            </motion.div>
          </div>

          {isEmpty && !loading && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              type="button"
              onClick={() => {
                onContinue({ selectedItems: [], selectedDestinations })
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all duration-300"
              style={{
                background: "rgba(107,114,128,0.15)",
                color: "#9ca3af",
                border: "1px solid rgba(107,114,128,0.3)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Use Gallery Post
            </motion.button>
          )}

          {continueError ? (
            <p
              className="rounded-lg border px-3 py-2 text-[11px] w-full"
              style={{
                borderColor: "rgba(239,68,68,0.35)",
                background: "rgba(239,68,68,0.08)",
                color: "#fca5a5",
              }}
            >
              {continueError}
            </p>
          ) : null}

          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.3 }}
            type="button"
            disabled={!canContinue}
            onClick={() =>
              onContinue({
                selectedItems,
                selectedDestinations,
              })
            }
            className="relative w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-sm font-bold transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed overflow-hidden"
            style={
              canContinue
                ? {
                    background: "#00aa6f",
                    color: "#000",
                    boxShadow: "0 0 20px rgba(0,170,111,0.3)",
                  }
                : { background: "#1a1a1a", color: "#6b7280" }
            }
          >
            {canContinue && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)",
                  backgroundSize: "200% 100%",
                  animation: "ctaShimmer 2.5s linear infinite",
                }}
              />
            )}
            {continueBusy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Preparing draft…
              </>
            ) : (
              <>
                Continue with {selectedItems.length} file
                {selectedItems.length !== 1 ? "s" : ""} — {selectedDestinations.length} platform
                {selectedDestinations.length !== 1 ? "s" : ""}
              </>
            )}
          </motion.button>
        </>
      )}

      <style jsx>{`
        @keyframes ctaShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  )
}
