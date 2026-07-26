"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  Check,
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
  fetchAutopostDraft,
  fetchConnectedPlatforms,
  isPlanRequiredApiError,
  patchAutopostDraft,
  publishAutopostDraft,
  type AutopostDraftWire,
  type DistributionDestination,
} from "@/lib/relay-api"
import {
  AutopostDistributionSteps,
  type DistributionStep,
} from "@/app/components/distribution/AutopostDistributionSteps"
import {
  dedupeMediaIds,
  loadStagedItemsByIds,
  type StagedMediaItem,
} from "@/app/components/autopost-v0/staged-media-utils"
import { UploadAndSelectScreen } from "@/app/components/autopost-v0/UploadAndSelectScreen"
import Toast from "@/app/components/Toast"
import { useStudioSession } from "@/lib/studio-session-context"
import { CreatorTierCatalogMultiselect } from "@/app/components/shell/CreatorTierCatalogMultiselect"

type Step = "pick-media" | "draft-post" | DistributionStep

type DraftInitialPost = {
  title: string
  description: string
  tags: string[]
}

const DESTINATION_SET = new Set<DistributionDestination>([
  "patreon",
  "x",
  "deviantart",
  "bluesky",
])

function parseWorkspaceDestinations(
  raw: string[] | undefined
): DistributionDestination[] {
  if (!raw?.length) return []
  return raw.filter((d): d is DistributionDestination =>
    DESTINATION_SET.has(d as DistributionDestination)
  )
}

function draftWireToInitialPost(draft: AutopostDraftWire): DraftInitialPost {
  return {
    title: draft.title?.trim() ?? "",
    description: draft.body_text?.trim() ?? "",
    tags: draft.workspace.tags ?? [],
  }
}

function clampComposerStep(draft: AutopostDraftWire): Step {
  const raw = draft.composer_step
  if (draft.published_post_id) {
    if (
      raw === "variation-planning" ||
      raw === "variant-review" ||
      raw === "cross-post" ||
      raw === "complete"
    ) {
      return raw
    }
    return "variation-planning"
  }
  if (draft.media_ids.length === 0 || draft.status === "nudged") {
    return "pick-media"
  }
  if (raw === "pick-media" || raw === "draft-post") return raw
  return "draft-post"
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
    { id: "pick-media", label: "Upload & Select" },
    { id: "draft-post", label: "Relay Post" },
    { id: "variation-planning", label: "Strategy" },
    { id: "cross-post", label: "Cross-post" },
    { id: "complete", label: "Done" },
  ]
  const shownStep =
    visualStep ?? (step === "variant-review" ? "variation-planning" : step)
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

function DraftInitialPostScreen({
  creatorId,
  mediaItems,
  initialDraft,
  draftId,
  selectedDestinations,
  initialIsPublic,
  initialTierIds,
  initialCampaignId,
  onBackToPick,
  onContinue,
  publishBusy = false,
  publishError = null,
}: {
  creatorId: string
  mediaItems: StagedMediaItem[]
  initialDraft: DraftInitialPost | null
  draftId: string | null
  selectedDestinations: DistributionDestination[]
  initialIsPublic?: boolean
  initialTierIds?: string[]
  initialCampaignId?: string | null
  onBackToPick: () => void
  onContinue: (draft: DraftInitialPost, access: { isPublic: boolean; tierIds: string[]; campaignId?: string }) => void
  publishBusy?: boolean
  publishError?: string | null
}) {
  const [title, setTitle] = useState(initialDraft?.title ?? "")
  const [description, setDescription] = useState(initialDraft?.description ?? "")
  const [tags, setTags] = useState<string[]>(initialDraft?.tags ?? [])
  const [tagInput, setTagInput] = useState("")
  const [isPublic, setIsPublic] = useState(initialIsPublic ?? true)
  const [tierIds, setTierIds] = useState<string[]>(initialTierIds ?? [])
  const [composeCampaignId, setComposeCampaignId] = useState<string | undefined>(
    initialCampaignId ?? undefined
  )
  const [autosaveReady, setAutosaveReady] = useState(false)

  const previewMedia = mediaItems[0] ?? null
  const canContinue = title.trim().length > 0 && (isPublic || tierIds.length > 0)

  useEffect(() => {
    const t = window.setTimeout(() => setAutosaveReady(true), 400)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!draftId || !autosaveReady) return
    const handle = window.setTimeout(() => {
      void patchAutopostDraft(draftId, {
        title: title.trim() || null,
        body_text: description.trim() || null,
        composer_step: "draft-post",
        workspace: {
          selected_destinations: selectedDestinations,
          tags,
          tier_ids: tierIds,
          is_public: isPublic,
          campaign_id: composeCampaignId ?? null,
        },
      }).catch(() => {
        /* autosave is best-effort */
      })
    }, 800)
    return () => window.clearTimeout(handle)
  }, [
    draftId,
    autosaveReady,
    title,
    description,
    tags,
    tierIds,
    isPublic,
    composeCampaignId,
    selectedDestinations,
  ])

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
    <div className="w-full max-w-3xl mx-auto px-4 py-8 flex flex-col items-center gap-8">
      <div className="w-full flex flex-col lg:flex-row gap-5 items-start justify-center">
        {/* Main compose panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 min-w-0 p-5 rounded-2xl border"
          style={{ background: "rgba(17,17,17,0.6)", borderColor: "#1f1f1f" }}
        >
          <div className="flex flex-col gap-5 max-w-2xl mx-auto">
            {/* Media preview */}
            <div className="relative aspect-video rounded-2xl border overflow-hidden" style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}>
              {previewMedia ? (
                previewMedia.type === "image" && previewMedia.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
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
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
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
                    <span className="text-[10px] px-2.5 py-1 rounded-full border border-[#2a2a2a] bg-black/70 text-[#9ca3af]">
                      +{mediaItems.length - 1} more
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Title input */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-[#9ca3af]">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give this Relay post a title..."
                className="w-full px-4 py-3 text-sm rounded-full border bg-transparent text-[#f9fafb] placeholder-[#6b7280] focus:outline-none transition-colors"
                style={{ borderColor: "#2a2a2a" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#00aa6f")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
              />
            </div>

            {/* Multi-media strip */}
            {mediaItems.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {mediaItems.map((item) => (
                  <div key={item.id} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#2a2a2a] flex-shrink-0 bg-[#111]">
                    {item.type === "image" && item.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
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

            {/* Description & Tags */}
            <div className="flex flex-col gap-3 p-4 rounded-2xl border" style={{ background: "#0a0a0a", borderColor: "#2a2a2a" }}>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-[#9ca3af]">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a caption or description for your post..."
                  className="w-full px-3 py-2.5 text-xs rounded-xl border bg-transparent text-[#f9fafb] placeholder-[#6b7280] resize-none focus:outline-none transition-colors"
                  style={{ borderColor: "#2a2a2a", minHeight: "68px" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#00aa6f")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                />
                <div className="text-[10px] text-[#6b7280]">{description.length} / 500 characters</div>
              </div>

              <div className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: "#2a2a2a" }}>
                <label className="text-xs font-medium text-[#9ca3af]">Tags (max 10)</label>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <motion.button
                        key={tag}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => removeTag(tag)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:scale-105"
                        style={{
                          background: "rgba(0,170,111,0.15)",
                          color: "#00aa6f",
                          border: "1px solid rgba(0,170,111,0.3)"
                        }}
                        title="Click to remove"
                      >
                        <span>#{tag}</span>
                        <X size={12} />
                      </motion.button>
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
                    className="flex-1 px-3 py-2 text-xs rounded-full border bg-transparent text-[#f9fafb] placeholder-[#6b7280] focus:outline-none transition-colors disabled:opacity-50"
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
                    className="px-4 py-2 text-xs font-medium rounded-full border transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:scale-105"
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

            {/* Commit CTA */}
            <div className="flex flex-col gap-2 pt-2">
              {publishError ? (
                <p
                  className="rounded-full border px-4 py-2 text-[11px]"
                  style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
                >
                  {publishError}
                </p>
              ) : null}
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                onClick={commit}
                disabled={!canContinue || publishBusy}
                className="relative w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-sm font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35 overflow-hidden"
                style={
                  canContinue && !publishBusy
                    ? { background: "#00aa6f", color: "#000", boxShadow: "0 0 20px rgba(0,170,111,0.3)" }
                    : { background: "#1a1a1a", color: "#6b7280" }
                }
              >
                {canContinue && !publishBusy && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)",
                      backgroundSize: "200% 100%",
                      animation: "ctaShimmer 2.5s linear infinite",
                    }}
                  />
                )}
                {publishBusy ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Committing to Relay…
                  </>
                ) : (
                  <>
                    Commit Relay Post
                    <ArrowRight size={15} />
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Access sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full lg:w-[220px] shrink-0 flex flex-col gap-3 p-4 rounded-2xl border"
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

      {/* Shimmer keyframes */}
      <style jsx>{`
        @keyframes ctaShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

export function RelayAutopostComposer({
  initialMediaIds = [],
  initialDraftId = null,
  prefillMode = "continue",
  onPlanRequired,
}: {
  initialMediaIds?: string[]
  initialDraftId?: string | null
  /** platforms = media preselected on pick step; continue = auto-advance past pick. */
  prefillMode?: "continue" | "platforms"
  /** MB-15A — server 402 wins over stale client allow state. */
  onPlanRequired?: () => void
}) {
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
  const [resumeBootstrapping, setResumeBootstrapping] = useState(Boolean(initialDraftId?.trim()))
  const [prefillBootstrapping, setPrefillBootstrapping] = useState(
    prefillMode === "continue" && prefillMediaIds.length > 0 && !initialDraftId?.trim()
  )
  const [selectedDestinations, setSelectedDestinations] = useState<DistributionDestination[]>([])
  const [sourcePreview, setSourcePreview] = useState<AutopostDraftWire["source_preview"]>(null)
  const [draftAccess, setDraftAccess] = useState<{
    isPublic: boolean
    tierIds: string[]
    campaignId?: string | null
  }>({ isPublic: true, tierIds: [] })

  const applyResumedDraft = useCallback(
    async (draft: AutopostDraftWire) => {
      const cid = creatorId.trim()
      setAutopostDraftId(draft.draft_id)
      setDraftPost(draftWireToInitialPost(draft))
      setSelectedDestinations(parseWorkspaceDestinations(draft.workspace.selected_destinations))
      setSourcePreview(draft.source_preview ?? null)
      setDraftAccess({
        isPublic: draft.workspace.is_public ?? true,
        tierIds: draft.workspace.tier_ids ?? [],
        campaignId: draft.workspace.campaign_id ?? null,
      })
      setPublishError(null)

      if (draft.published_post_id) {
        setPublishedPostId(draft.published_post_id)
        if (draft.media_ids.length > 0 && cid) {
          const items = await loadStagedItemsByIds(cid, draft.media_ids, {
            skipImageProbe: true,
            fillReservedPlaceholders: true,
          })
          setSelectedMediaItems(items)
        }
        setStep(clampComposerStep(draft))
        return
      }

      setPublishedPostId(null)
      if (draft.media_ids.length === 0) {
        setSelectedMediaItems([])
        setStep("pick-media")
        return
      }

      if (!cid) {
        setSelectedMediaItems([])
        setStep("pick-media")
        return
      }

      const items = await loadStagedItemsByIds(cid, draft.media_ids, {
        skipImageProbe: true,
        fillReservedPlaceholders: true,
      })
      setSelectedMediaItems(items)
      setStep(clampComposerStep(draft))
    },
    [creatorId]
  )

  const handleResumeDraft = useCallback(
    (draft: AutopostDraftWire) => {
      void applyResumedDraft(draft).catch((e) => {
        setPublishError(e instanceof Error ? e.message : "Could not resume draft.")
      })
    },
    [applyResumedDraft]
  )

  const handleUploadAndSelect = useCallback(
    async (payload: { selectedItems: StagedMediaItem[]; selectedDestinations: DistributionDestination[] }) => {
      const { selectedItems: items, selectedDestinations: destinations } = payload
      if (!creatorId.trim() || items.length === 0 || destinations.length === 0) return
      setSelectedMediaItems(items)
      setSelectedDestinations(destinations)
      setPublishError(null)
      setPickContinueBusy(true)
      try {
        const mediaIds = items.map((m) => m.id)
        const workspace = { selected_destinations: destinations as string[] }

        if (autopostDraftId) {
          const { draft } = await patchAutopostDraft(autopostDraftId, {
            media_ids: mediaIds,
            status: "drafting",
            composer_step: "draft-post",
            workspace,
          })
          setAutopostDraftId(draft.draft_id)
          setDraftPost(draftWireToInitialPost(draft))
          setStep("draft-post")
          return
        }

        const { draft } = await createAutopostDraft({
          media_ids: mediaIds,
          generate: false,
          composer_step: "draft-post",
          workspace,
        })
        setAutopostDraftId(draft.draft_id)
        setDraftPost(draftWireToInitialPost(draft))
        setStep("draft-post")
      } catch (e) {
        if (isPlanRequiredApiError(e)) {
          onPlanRequired?.()
          setPublishError("Autopost requires an Autopost plan. Open Billing to upgrade.")
        } else {
          setPublishError(e instanceof Error ? e.message : "Could not create draft.")
        }
      } finally {
        setPickContinueBusy(false)
      }
    },
    [creatorId, autopostDraftId, onPlanRequired]
  )

  useEffect(() => {
    const draftId = initialDraftId?.trim()
    if (!draftId) {
      setResumeBootstrapping(false)
      return
    }
    let cancelled = false
    void (async () => {
      setResumeBootstrapping(true)
      setPublishError(null)
      try {
        const { draft } = await fetchAutopostDraft(draftId)
        if (cancelled) return
        await applyResumedDraft(draft)
      } catch (e) {
        if (!cancelled) {
          setPublishError(e instanceof Error ? e.message : "Could not load draft.")
        }
      } finally {
        if (!cancelled) setResumeBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialDraftId, applyResumedDraft])

  useEffect(() => {
    if (initialDraftId?.trim()) {
      setPrefillBootstrapping(false)
      return
    }
    if (prefillMediaIds.length === 0) {
      setPrefillBootstrapping(false)
      return
    }
    // Schedule Rail AutoPost: land on pick/platform step with media preselected.
    if (prefillMode === "platforms") {
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
        const { platforms } = await fetchConnectedPlatforms().catch(() => ({
          platforms: [] as Awaited<ReturnType<typeof fetchConnectedPlatforms>>["platforms"],
        }))
        const defaultDestinations = platforms
          .filter((p) => p.readiness !== "disabled" && p.readiness !== "unsupported")
          .map((p) => p.destination)
        await handleUploadAndSelect({
          selectedItems: items,
          selectedDestinations: defaultDestinations,
        })
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
  }, [creatorId, handleUploadAndSelect, prefillMediaIds, initialDraftId, prefillMode])

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
        composer_step: "variation-planning",
        workspace: {
          selected_destinations: selectedDestinations,
          tags: draft.tags,
          tier_ids: access.isPublic ? [] : access.tierIds,
          is_public: access.isPublic,
          campaign_id: access.campaignId ?? null,
        },
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
      if (isPlanRequiredApiError(e)) {
        onPlanRequired?.()
        setPublishError("Autopost requires an Autopost plan. Open Billing to upgrade.")
      } else {
        setPublishError(e instanceof Error ? e.message : "Publish failed. Try again.")
      }
    } finally {
      setPublishBusy(false)
    }
  }, [creatorId, selectedMediaItems, autopostDraftId, selectedDestinations, onPlanRequired])

  const handleDraftContinue = useCallback((
    draft: DraftInitialPost,
    access: { isPublic: boolean; tierIds: string[]; campaignId?: string }
  ) => {
    void handlePublishToRelay(draft, access)
  }, [handlePublishToRelay])

  const handleBack = useCallback(() => {
    setStep((current) => {
      if (publishedPostId) {
        if (current === "variation-planning" || current === "variant-review") return current
        if (current === "cross-post") return "variation-planning"
        return current
      }
      if (current === "draft-post") return "pick-media"
      if (current === "variation-planning" || current === "variant-review") return "draft-post"
      if (current === "cross-post") return "variation-planning"
      return current
    })
  }, [publishedPostId])

  const goBackToPickFromDraft = useCallback(() => {
    if (publishedPostId) return
    setStep("pick-media")
    if (autopostDraftId) {
      void patchAutopostDraft(autopostDraftId, { composer_step: "pick-media" }).catch(() => {})
    }
  }, [publishedPostId, autopostDraftId])

  const showBootstrap = prefillBootstrapping || resumeBootstrapping

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
        visualStep={showBootstrap ? "draft-post" : undefined}
        postPublished={Boolean(publishedPostId)}
        onBack={handleBack}
      />

      {sourcePreview ? (
        <div
          className="mx-auto mt-3 w-full max-w-3xl rounded-lg border border-emerald-900/50 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100"
          data-testid="source-preview-banner"
        >
          <p className="font-medium">Preview from Patreon source</p>
          <p className="mt-1 text-xs text-emerald-200/80">
            {sourcePreview.title || "Untitled"} · media stays on the source post (not reserved).
            Review before publishing to your selected destinations.
          </p>
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {showBootstrap && <AutopostPrefillBootstrapScreen />}

          {!showBootstrap && step === "pick-media" && (
            <motion.div
              key="pick-media"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
            >
              <UploadAndSelectScreen
                creatorId={creatorId}
                initialSelectedIds={
                  prefillMediaIds.length > 0
                    ? prefillMediaIds
                    : selectedMediaItems.map((item) => item.id)
                }
                initialSelectedDestinations={selectedDestinations}
                openDraftId={autopostDraftId}
                onContinue={(payload) => void handleUploadAndSelect(payload)}
                onResumeDraft={handleResumeDraft}
                onStartNewDraft={() => {
                  setAutopostDraftId(null)
                  setDraftPost(null)
                  setPublishedPostId(null)
                  setSelectedMediaItems([])
                }}
                continueBusy={pickContinueBusy}
                continueError={publishError}
              />
            </motion.div>
          )}

          {!showBootstrap && step === "draft-post" && (
            <motion.div
              key={`draft-post-${autopostDraftId ?? "new"}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              <DraftInitialPostScreen
                creatorId={creatorId}
                mediaItems={selectedMediaItems}
                initialDraft={draftPost}
                draftId={autopostDraftId}
                selectedDestinations={selectedDestinations}
                initialIsPublic={draftAccess.isPublic}
                initialTierIds={draftAccess.tierIds}
                initialCampaignId={draftAccess.campaignId}
                onBackToPick={goBackToPickFromDraft}
                onContinue={handleDraftContinue}
                publishBusy={publishBusy}
                publishError={publishError}
              />
            </motion.div>
          )}

          {!showBootstrap &&
            (step === "variation-planning" ||
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
                initialSelectedDestinations={selectedDestinations}
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
