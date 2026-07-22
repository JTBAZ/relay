"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ImageIcon,
  Loader2,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { CoachGatheringPanel } from "@/app/components/coach/CoachGatheringPanel";
import {
  approveDistributionVariant,
  clearCoachReviewCheckpoint,
  completeDistributionAttempt,
  crossPostBlueskyPost,
  fetchDistributionAttempt,
  fetchGalleryPostDetail,
  fetchPerformanceGoals,
  fetchPostDistributionPlan,
  patchCoachReviewProgress,
  patchDistributionVariant,
  patchPostbotTask,
  proposeCoachAttackPlans,
  RELAY_API_BASE,
  startDistributionHandoff,
  type CoachProposeResultWire,
  type CreatorCapabilityWire,
  type DistributionDestination,
  type DistributionPlanWire,
  type DistributionVariantWire,
  type GalleryPostDetail,
  type PerformanceGoalWire,
  type PostbotTaskWire,
} from "@/lib/relay-api";
import {
  describeRelayCrossPostFailure,
  probeRelayExtensionStatus,
  sendRelayCrossPostToExtension,
} from "@/lib/relay-extension-messaging";
import { subscribeRelayDistributionRefresh } from "@/lib/relay-distribution-refresh";
import { type CustomTextDraftsByDestination } from "@/lib/custom-text-draft";
import {
  buildMediaRoutingPlanPayload,
  defaultMediaRouting,
  defaultMediaRoutingForPreviewNeed,
  destinationsUsingPreviewRouting,
  exportMediaContentUrl,
  hydratePreviewPlanState,
  isMediaRoutingStale,
  mediaVersionFromPlatformFields,
  resolveEffectiveMediaVersion,
  resolveSendCardImageUrl,
  type MediaRoutingByDestination,
  type MediaVersion,
} from "@/lib/distribution-media-routing";
import { isPreviewizerEnabled } from "@/lib/previewizer-feature";
import { buildPreviewizerSession, type PreviewizerResult } from "@/lib/previewizer-session";
import { uploadFileToRelayStaging } from "@/lib/relay-native-staging-upload";
import { CustomTextEditorFields } from "@/app/components/distribution/CustomTextEditorFields";
import { PreviewMediaPicker } from "@/app/components/distribution/PreviewMediaPicker";
import { PreviewizerOverlay } from "@/app/components/distribution/PreviewizerOverlay";
import { PostbotTaskList } from "@/app/components/distribution/PostbotTaskList";
import { PlatformPostPreview } from "@/app/components/distribution/PlatformPostPreview";
import { CoachFindingsPanel } from "@/app/components/distribution/CoachFindingsPanel";
import { CoachReviewModal } from "@/app/components/distribution/CoachReviewModal";
import {
  CoachPlatformCopyReview,
  type CoachPlatformCommit,
} from "@/app/components/distribution/CoachPlatformCopyReview";
import {
  COACH_PATHS,
  coachPathFromGoals,
  EMPTY_ASSISTANT_CONTEXT,
  RelayCoachModal,
  type AssistantGoal,
  type PostingAssistantContextValue,
} from "@/app/components/distribution/PostingAssistantContextPanel";

type MediaItem = {
  id: string;
  preview: string;
  filename: string;
  type: "image" | "video" | "audio";
};

type CardBadge = "template" | "ai" | "custom" | null;

/** Per-destination handoff + optional landing-URL confirm (mirrors DistributionHandoffPanel). */
type DestSendState = {
  attemptId: string | null;
  fillStatus: string | null;
  confirmExpanded: boolean;
  confirmUrlDraft: string;
  confirmBusy: boolean;
};

const EMPTY_DEST_SEND: DestSendState = {
  attemptId: null,
  fillStatus: null,
  confirmExpanded: false,
  confirmUrlDraft: "",
  confirmBusy: false,
};

type Props = {
  creatorId: string;
  postId: string;
  selectedDestinations: DistributionDestination[];
  mediaItems?: MediaItem[];
  plan: DistributionPlanWire | null;
  onPlanChange: (plan: DistributionPlanWire | null) => void;
  postingAssistantAllowed: boolean;
  /** MB-15A — full capability wire for Coach gate CTA (optional for older call sites). */
  postingAssistantCapability?: CreatorCapabilityWire;
  assistantByDestination: Record<string, boolean>;
  onAssistantByDestinationChange: (next: Record<string, boolean>) => void;
  assistantContext: PostingAssistantContextValue;
  onAssistantContextChange: (next: PostingAssistantContextValue) => void;
  onGeneratePlan: (options?: {
    customTextDrafts?: CustomTextDraftsByDestination;
    needs_preview?: boolean;
    preview_media_id?: string;
    media_routing_by_destination?: Record<string, "full" | "preview">;
    accepted_copy_by_destination?: Record<
      string,
      {
        title?: string | null;
        body_text: string;
        formula_id?: string;
        variant_id?: string;
      }
    >;
  }) => Promise<void>;
  generating: boolean;
  error: string | null;
  onContinueToHandoff: () => void;
  /**
   * Prefill preview routing from Audience & Promotion Continue.
   * Does not auto-open Previewizer.
   */
  initialPreviewMediaId?: string | null;
};

type CoachPhase = "questionnaire" | "gathering" | "findings" | "platformReview";

const COACH_GATHER_MESSAGES = [
  "Reading your post…",
  "Checking your history…",
  "Matching attack formulae…",
] as const;

const ASSISTANT_GOAL_SET = new Set<AssistantGoal>([
  "engagement_optimization",
  "new_audience_testing",
  "language_outreach",
  "trend_riding",
  "format_optimization",
]);

const DESTINATION_SET = new Set<DistributionDestination>([
  "patreon",
  "x",
  "deviantart",
  "bluesky",
]);

function isCoachProposeResultWire(value: unknown): value is CoachProposeResultWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.path_id === "string" &&
    row.findings != null &&
    typeof row.findings === "object" &&
    row.by_destination != null &&
    typeof row.by_destination === "object"
  );
}

function parseCoachPhase(value: unknown): CoachPhase | null {
  if (value === "findings" || value === "platformReview") return value;
  if (value === "gathering") return "findings";
  return null;
}

function acceptedCopyFromContext(
  raw: unknown
): Partial<Record<DistributionDestination, CoachPlatformCommit>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<DistributionDestination, CoachPlatformCommit>> = {};
  for (const [dest, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!DESTINATION_SET.has(dest as DistributionDestination)) continue;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const body = typeof row.body_text === "string" ? row.body_text : "";
    if (!body.trim()) continue;
    out[dest as DistributionDestination] = {
      destination: dest as DistributionDestination,
      variant_id: typeof row.variant_id === "string" ? row.variant_id : "",
      formula_id: typeof row.formula_id === "string" ? row.formula_id : "",
      title: typeof row.title === "string" ? row.title : row.title === null ? null : null,
      body_text: body,
    };
  }
  return out;
}

const DESTINATION_LABEL: Record<DistributionDestination, string> = {
  patreon: "Patreon",
  x: "X / Twitter",
  deviantart: "DeviantArt",
  bluesky: "Bluesky",
};

const DESTINATION_ACCENT: Record<DistributionDestination, string> = {
  patreon: "#ff424d",
  x: "#1d9bf0",
  deviantart: "#05cc47",
  bluesky: "#0085ff",
};

function PatreonIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ff424d" aria-hidden>
      <circle cx="14.5" cy="9.5" r="6.5" />
      <rect x="3" y="2" width="4" height="20" />
    </svg>
  );
}

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#e7e9ea" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DeviantArtIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#05cc47" aria-hidden>
      <path d="M7.42 3h3.68l2.04 3.9 2.18-3.9h3.68l-2.18 3.9 2.18 3.9h-3.68l-2.18-3.9-2.04 3.9H7.42l2.04-3.9z" />
    </svg>
  );
}

function BlueskyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#0085ff" aria-hidden>
      <path d="M6.5 4.5C8.5 7 10 10 12 14c2-4 3.5-7 5.5-9.5 1.5-1.5 3-2 4.5-1.5-.5 2-2 3.5-4 4.5 1.5.5 3 1.5 4 3-2 .5-4 0-5.5-1.5-1.5 1.5-3.5 2-5.5 1.5 1-1.5 2.5-2.5 4-3-2-1-3.5-2.5-4-4.5 1.5-.5 3 0 4.5 1.5z" />
    </svg>
  );
}

const DESTINATION_ICON: Record<DistributionDestination, ReactNode> = {
  patreon: <PatreonIcon />,
  x: <XIcon />,
  deviantart: <DeviantArtIcon />,
  bluesky: <BlueskyIcon />,
};

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 48 : -48 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -48 : 48 }),
};

const SLIDE_TRANSITION = { duration: 0.32, ease: [0.32, 0.72, 0, 1] as const };

type PreviewRoutingPanelProps = {
  needsPreview: boolean | null;
  onNeedsPreviewChange: (value: boolean) => void;
  mediaRouting: MediaRoutingByDestination;
  onMediaVersionChange: (dest: DistributionDestination, version: MediaVersion) => void;
  selectedDestinations: DistributionDestination[];
  previewDestinations: DistributionDestination[];
  creatorId: string;
  postMedia: GalleryPostDetail["media"] | undefined;
  previewMediaId: string;
  onPreviewMediaIdChange: (mediaId: string) => void;
  onOpenPreviewizer: () => void;
  previewizerDisabled: boolean;
  previewizerDisabledReason?: string;
  /** When false, hide Open Previewizer; picker remains the path to attach a teaser. */
  previewizerAvailable?: boolean;
  showExistingPicker: boolean;
  onToggleExistingPicker: () => void;
};

function PreviewRoutingPanel({
  needsPreview,
  onNeedsPreviewChange,
  mediaRouting,
  onMediaVersionChange,
  selectedDestinations,
  previewDestinations,
  creatorId,
  postMedia,
  previewMediaId,
  onPreviewMediaIdChange,
  onOpenPreviewizer,
  previewizerDisabled,
  previewizerDisabledReason,
  previewizerAvailable = true,
  showExistingPicker,
  onToggleExistingPicker,
}: PreviewRoutingPanelProps) {
  const previewReady = previewMediaId.trim().length > 0;
  const previewReadyThumbUrl = previewReady
    ? exportMediaContentUrl(creatorId, previewMediaId.trim())
    : "";
  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{
        borderColor:
          needsPreview === null
            ? "#2a2a2a"
            : needsPreview
              ? "rgba(0,170,111,0.4)"
              : "#2a2a2a",
        background: "#0a0a0a",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#d1d5db]">Do you need to generate a Preview?</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNeedsPreviewChange(true)}
            className="rounded-full px-4 py-1.5 text-[11px] font-semibold transition-colors"
            style={{
              background: needsPreview === true ? "#00aa6f" : "#1a1a1a",
              color: needsPreview === true ? "#000" : "#9ca3af",
            }}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onNeedsPreviewChange(false)}
            className="rounded-full px-4 py-1.5 text-[11px] font-semibold transition-colors"
            style={{
              background: needsPreview === false ? "#1a1a1a" : "#1a1a1a",
              color: needsPreview === false ? "#f9fafb" : "#6b7280",
              borderColor: needsPreview === false ? "#3a3a3a" : "transparent",
              borderWidth: 1,
              borderStyle: "solid",
            }}
          >
            No
          </button>
        </div>
      </div>
      <AnimatePresence mode="wait">
        {needsPreview ? (
          <motion.div
            key="preview-unfurl"
            custom={1}
            variants={SLIDE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SLIDE_TRANSITION}
            className="overflow-hidden"
          >
            {previewizerAvailable ? (
              <>
                <button
                  type="button"
                  disabled={previewizerDisabled}
                  onClick={onOpenPreviewizer}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: "rgba(0,170,111,0.12)",
                    color: "#9bf0c4",
                    border: "1px solid rgba(0,170,111,0.35)",
                  }}
                >
                  <Wand2 className="h-4 w-4" aria-hidden />
                  Open Previewizer
                </button>
                {previewizerDisabled && previewizerDisabledReason ? (
                  <p className="mt-1 text-[10px] text-amber-300/90">{previewizerDisabledReason}</p>
                ) : (
                  <p className="mt-2 text-[10px] text-[#6b7280]">
                    Generates a blurred/watermarked teaser image for non-patron platforms.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-[10px] text-[#9ca3af]">
                Previewizer is turned off for this environment. Choose an existing teaser image
                below, or leave platforms on Full.
              </p>
            )}
            {previewReady ? (
              <div
                className="mt-3 flex items-center gap-3 rounded-xl border px-3 py-2"
                style={{ borderColor: "rgba(0,170,111,0.35)", background: "rgba(0,170,111,0.08)" }}
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#111]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewReadyThumbUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-[#9bf0c4]">Preview ready</p>
                  <p className="truncate font-mono text-[9px] text-[#6b7280]" title={previewMediaId}>
                    {previewMediaId}
                  </p>
                </div>
                <Check className="h-4 w-4 shrink-0 text-[#00aa6f]" aria-hidden />
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              <p className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wide">
                Image per platform
              </p>
              {selectedDestinations.map((dest) => {
                const version = mediaRouting[dest] ?? "full";
                return (
                  <div
                    key={dest}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                    style={{ borderColor: "#2a2a2a", background: "#111" }}
                  >
                    <span className="text-[11px] text-[#d1d5db] truncate">
                      {DESTINATION_LABEL[dest]}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onMediaVersionChange(dest, "full")}
                        className="rounded-full px-3 py-1 text-[10px] font-semibold transition-colors"
                        style={{
                          background: version === "full" ? "#00aa6f" : "#1a1a1a",
                          color: version === "full" ? "#000" : "#9ca3af",
                        }}
                      >
                        Full
                      </button>
                      <button
                        type="button"
                        onClick={() => onMediaVersionChange(dest, "preview")}
                        className="rounded-full px-3 py-1 text-[10px] font-semibold transition-colors"
                        style={{
                          background: version === "preview" ? "#00aa6f" : "#1a1a1a",
                          color: version === "preview" ? "#000" : "#9ca3af",
                        }}
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                );
              })}
              {previewDestinations.length > 0 ? (
                <div className="space-y-2">
                  {!previewReady ? (
                    <p className="text-[10px] text-amber-300/90">
                      {previewizerAvailable
                        ? "Create a preview in Previewizer or choose an existing image."
                        : "Choose an existing preview image for platforms using Preview routing."}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={onToggleExistingPicker}
                    className={`text-[10px] underline-offset-2 hover:underline ${
                      previewizerAvailable
                        ? "text-[#6b7280] hover:text-[#9ca3af]"
                        : "font-semibold text-[#9bf0c4] hover:text-[#b6f5d4]"
                    }`}
                  >
                    {showExistingPicker
                      ? "Hide existing previews"
                      : previewizerAvailable
                        ? "Choose existing preview"
                        : "Choose existing preview (required path)"}
                  </button>
                  {showExistingPicker ? (
                    <PreviewMediaPicker
                      creatorId={creatorId}
                      postMedia={postMedia}
                      selectedMediaId={previewMediaId}
                      onSelect={onPreviewMediaIdChange}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Fixed width for Step 3 send cards — matches Source column (280px) regardless of destination count. */
const SEND_CARD_WIDTH_PX = 280;
const SOURCE_CARD_WIDTH_PX = 280;

function badgeLabel(badge: CardBadge): string | null {
  if (badge === "template") return "Template";
  if (badge === "ai") return "AI";
  if (badge === "custom") return "Custom";
  return null;
}

type SourcePostCardProps = {
  loading: boolean;
  previewUrl: string;
  title: string;
  description: string;
  tags: string[];
};

function SourcePostCard({ loading, previewUrl, title, description, tags }: SourcePostCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative w-full max-w-[280px] shrink-0 justify-self-center rounded-2xl min-[960px]:justify-self-start"
      style={{
        maxWidth: SOURCE_CARD_WIDTH_PX,
        boxShadow: "0 0 32px rgba(0,170,111,0.08)",
      }}
    >
      <div
        className="flex w-full flex-col overflow-hidden rounded-2xl border"
        style={{
          borderColor: "#2a2a2a",
          borderLeft: "2px solid #00aa6f",
          background: "rgba(10,10,10,0.95)",
        }}
      >
        <p
          className="px-2.5 pt-2.5 pb-1 text-center text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "#6b7280" }}
        >
          Source
        </p>
        {loading ? (
          <div className="flex flex-col items-center justify-center px-2.5 pb-4">
            <div
              className="w-full animate-pulse rounded-xl bg-[#1a1a1a]"
              style={{ aspectRatio: "4 / 5" }}
            />
            <p className="mt-3 text-center text-[11px] text-[#6b7280]">Loading post…</p>
          </div>
        ) : (
          <>
            <div
              className="relative w-full shrink-0 bg-[#0a0a0a]"
              style={{ aspectRatio: "4 / 5" }}
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={title}
                  className="absolute inset-0 h-full w-full object-cover opacity-90"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[#3a3a3a]">
                  <ImageIcon className="h-8 w-8" aria-hidden />
                </div>
              )}
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(to top, rgba(5,5,5,0.9) 0%, transparent 55%)",
                }}
              />
              <div className="absolute top-2.5 left-2.5">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
                  style={{
                    background: "rgba(0,0,0,0.55)",
                    color: "#9bf0c4",
                    border: "1px solid rgba(0,170,111,0.25)",
                  }}
                >
                  <Check className="h-3 w-3" aria-hidden />
                  Published to Relay
                </span>
              </div>
              <div className="absolute right-2.5 bottom-2.5 left-2.5">
                <h3
                  className="line-clamp-2 text-[12px] leading-snug font-bold text-white"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                >
                  {title}
                </h3>
                <p
                  className="mt-0.5 line-clamp-2 text-[10px] leading-snug"
                  style={{ color: "#9ca3af" }}
                >
                  {description}
                </p>
              </div>
            </div>
            {tags.length > 0 ? (
              <div className="flex shrink-0 flex-wrap gap-1.5 px-2.5 py-2.5">
                {tags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2 py-0.5 text-[9px] font-medium"
                    style={{
                      background: "rgba(0,170,111,0.08)",
                      border: "1px solid rgba(0,170,111,0.2)",
                      color: "#9bf0c4",
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </motion.div>
  );
}

function variantForDestination(
  plan: DistributionPlanWire | null,
  destination: DistributionDestination
): DistributionVariantWire | null {
  return plan?.variants.find((v) => v.destination === destination) ?? null;
}

function previewSnippet(variant: DistributionVariantWire): string {
  if (variant.destination === "x" || variant.destination === "bluesky") {
    return (variant.post_text ?? variant.body_text ?? "").slice(0, 120);
  }
  const parts = [variant.title, variant.body_text].filter(Boolean);
  return parts.join(" · ").slice(0, 120);
}

function rationaleFromAdvice(variant: DistributionVariantWire): string | null {
  const advice = variant.advice;
  if (!advice || typeof advice !== "object") return null;
  const rationale = (advice as Record<string, unknown>).rationale;
  return typeof rationale === "string" && rationale.trim() ? rationale.trim() : null;
}

function coachEditedFromAdvice(variant: DistributionVariantWire): boolean {
  const advice = variant.advice;
  if (!advice || typeof advice !== "object") return false;
  return (advice as Record<string, unknown>).coach_edited === true;
}

function VariantContent({
  dest,
  variant,
  approved,
  approvingDestination,
  postbotTaskBusyId,
  previewUrl,
  onStartEdit,
  onApprove,
  onApplyPostbotSchedule,
  onTaskUpdated,
  onTaskBusyChange,
}: {
  dest: DistributionDestination;
  variant: DistributionVariantWire;
  approved: boolean;
  approvingDestination: boolean;
  postbotTaskBusyId: string | null;
  previewUrl: string;
  onStartEdit: () => void;
  onApprove: () => void;
  onApplyPostbotSchedule: (task: PostbotTaskWire) => void;
  onTaskUpdated: (task: PostbotTaskWire) => void;
  onTaskBusyChange: (taskId: string | null) => void;
}) {
  const postText = variant.post_text ?? variant.body_text ?? "";
  const tags = variant.tags
    ? (Array.isArray(variant.tags) ? variant.tags : String(variant.tags).split(",").map((t) => t.trim()))
    : [];

  return (
    <>
      {variant.assistant_enabled ? (
        <PostbotTaskList
          variant={variant}
          busyTaskId={postbotTaskBusyId}
          onApplySchedule={onApplyPostbotSchedule}
          onTaskUpdated={onTaskUpdated}
          onTaskBusyChange={onTaskBusyChange}
        />
      ) : null}

      {coachEditedFromAdvice(variant) ? (
        <p className="mb-2 text-[10px] font-semibold text-[#9bf0c4]">
          Coach edited this copy — review before posting.
        </p>
      ) : null}

      {rationaleFromAdvice(variant) ? (
        <p className="text-[10px] text-[#6b7280] mb-2 line-clamp-2 italic">
          {rationaleFromAdvice(variant)}
        </p>
      ) : null}

      {/* Platform-faithful preview shown by default */}
      <div className="mb-2">
        <PlatformPostPreview
          destination={dest}
          postText={postText}
          title={variant.title}
          tags={tags as string[]}
          imageUrl={previewUrl || null}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStartEdit}
          className="rounded-full border px-3 py-1 text-[10px] font-semibold text-[#9ca3af] transition-colors hover:border-[#3a3a3a]"
          style={{ borderColor: "#2a2a2a" }}
        >
          Edit
        </button>
        {!approved ? (
          <button
            type="button"
            disabled={approvingDestination}
            onClick={onApprove}
            className="rounded-full px-3 py-1 text-[10px] font-semibold disabled:opacity-50 transition-colors"
            style={{ background: "#00aa6f", color: "#000" }}
          >
            {approvingDestination ? "…" : "Approve"}
          </button>
        ) : null}
      </div>
    </>
  );
}

type DestinationPlatformCardProps = {
  dest: DistributionDestination;
  index: number;
  filled: boolean;
  approved: boolean;
  badge: CardBadge;
  isEditing: boolean;
  isActive: boolean;
  glowing: boolean;
  previewUrl: string;
  variant: DistributionVariantWire | undefined;
  editDraft: { title: string; body: string; tags: string };
  savingDestination: boolean;
  approvingDestination: boolean;
  postbotTaskBusyId: string | null;
  onEditDraftChange: (patch: Partial<{ title: string; body: string; tags: string }>) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onStartEdit: () => void;
  onApprove: () => void;
  onApplyPostbotSchedule: (task: PostbotTaskWire) => void;
  onTaskUpdated: (task: PostbotTaskWire) => void;
  onTaskBusyChange: (taskId: string | null) => void;
};

function DestinationPlatformCard({
  dest,
  index,
  filled,
  approved,
  badge,
  isEditing,
  isActive,
  glowing,
  previewUrl,
  variant,
  editDraft,
  savingDestination,
  approvingDestination,
  postbotTaskBusyId,
  onEditDraftChange,
  onCancelEdit,
  onSaveEdit,
  onStartEdit,
  onApprove,
  onApplyPostbotSchedule,
  onTaskUpdated,
  onTaskBusyChange,
}: DestinationPlatformCardProps) {
  const accent = DESTINATION_ACCENT[dest];
  const label = DESTINATION_LABEL[dest];
  const badgeText = badgeLabel(badge);

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{
        opacity: 1,
        x: 0,
        boxShadow: approved
          ? "0 0 0 1px rgba(0,170,111,0.4), 0 0 24px rgba(0,170,111,0.2)"
          : isActive
            ? `0 0 0 1px ${accent}60, 0 0 20px ${accent}18`
            : glowing
              ? [
                  "0 0 0 1px rgba(0,170,111,0.4), 0 0 24px rgba(0,170,111,0.2)",
                  "0 0 0 1px rgba(0,170,111,0.15)",
                  "none",
                ]
              : "none",
      }}
      transition={{
        opacity: { duration: 0.35, ease: [0.34, 1.06, 0.64, 1], delay: index * 0.08 },
        x: { duration: 0.35, ease: [0.34, 1.06, 0.64, 1], delay: index * 0.08 },
        boxShadow: glowing ? { duration: 0.8, times: [0, 0.5, 1] } : { duration: 0.3 },
      }}
      className="relative rounded-xl"
    >
      <AnimatePresence>
        {(approved || isActive) && (
          <motion.div
            key={approved ? "approved" : "active"}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ scaleY: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl origin-top z-10"
            style={{ background: approved ? "#00aa6f" : accent }}
            aria-hidden
          />
        )}
      </AnimatePresence>


      <div
        className="rounded-xl border overflow-hidden transition-all duration-300"
        style={{
          borderColor: approved
            ? "rgba(0,170,111,0.2)"
            : filled
              ? isActive
                ? `${accent}40`
                : `${accent}33`
              : "#2a2a2a",
          borderStyle: filled ? "solid" : "dashed",
          borderLeft: `2px solid ${approved ? "#00aa6f" : isActive ? accent : filled ? accent : "#3a3a3a"}`,
          background: isActive ? `${accent}06` : "rgba(10,10,10,0.95)",
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: filled ? `${accent}18` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${filled ? `${accent}30` : "#2a2a2a"}`,
                  opacity: filled ? 1 : 0.45,
                }}
              >
                {DESTINATION_ICON[dest]}
              </div>
              <span
                className="text-xs font-bold truncate"
                style={{ color: filled ? accent : "#6b7280" }}
              >
                {label}
              </span>
            </div>
            {approved ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-400 shrink-0">
                <Check className="h-3 w-3" aria-hidden />
                Approved
              </span>
            ) : badgeText ? (
              <span
                className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: "#1a1a1a", color: "#9bf0c4" }}
              >
                {badgeText}
              </span>
            ) : null}
          </div>
        </div>

        {filled ? (
          <div>
            {isEditing && variant ? (
              <div className="space-y-2 px-3 pb-3">
              <CustomTextEditorFields
                dest={dest}
                draft={editDraft}
                onChange={onEditDraftChange}
                variant="card"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="flex-1 rounded-lg border py-1.5 text-[11px] text-[#9ca3af]"
                  style={{ borderColor: "#2a2a2a" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingDestination}
                  onClick={onSaveEdit}
                  className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold disabled:opacity-50"
                  style={{ background: "#00aa6f", color: "#000" }}
                >
                  {savingDestination ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : variant ? (
            <VariantContent
              dest={dest}
              variant={variant}
              approved={approved}
              approvingDestination={approvingDestination}
              postbotTaskBusyId={postbotTaskBusyId}
              previewUrl={previewUrl}
              onStartEdit={onStartEdit}
              onApprove={onApprove}
              onApplyPostbotSchedule={onApplyPostbotSchedule}
              onTaskUpdated={onTaskUpdated}
              onTaskBusyChange={onTaskBusyChange}
            />
          ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ─── Loading Overlay ─────────────────────────────── */

const LOADING_STEPS = [
  { label: "Analyzing source content", duration: 900 },
  { label: "Routing to platforms", duration: 1200 },
  { label: "Generating variants", duration: 1800 },
  { label: "Finalizing plan", duration: 600 },
];

function TransformerLoadingOverlay({ destinations }: { destinations: DistributionDestination[] }) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let step = 0;
    const advance = () => {
      step += 1;
      if (step < LOADING_STEPS.length) {
        setActiveStep(step);
        timeout = setTimeout(advance, LOADING_STEPS[step].duration);
      }
    };
    timeout = setTimeout(advance, LOADING_STEPS[0].duration);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl"
      style={{ background: "rgba(4,4,4,0.92)", backdropFilter: "blur(6px)" }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 24 }}
        className="w-full max-w-xs space-y-5"
      >
        {/* Pulsing icon */}
        <div className="flex justify-center mb-2">
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,170,111,0.12)", border: "1.5px solid rgba(0,170,111,0.35)" }}
          >
            <Loader2 className="h-5 w-5 animate-spin text-[#00aa6f]" aria-hidden />
          </motion.div>
        </div>

        {/* Steps */}
        <div className="space-y-2.5">
          {LOADING_STEPS.map((step, i) => {
            const done = i < activeStep;
            const current = i === activeStep;
            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.12, duration: 0.3 }}
                className="flex items-center gap-3"
              >
                {/* Step indicator */}
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                  style={{
                    background: done ? "#00aa6f" : current ? "rgba(0,170,111,0.2)" : "rgba(42,42,42,0.6)",
                    border: `1.5px solid ${done ? "#00aa6f" : current ? "rgba(0,170,111,0.6)" : "#2a2a2a"}`,
                  }}
                >
                  {done ? (
                    <Check className="h-3 w-3 text-black" aria-hidden />
                  ) : current ? (
                    <motion.div
                      animate={{ scale: [0.8, 1.2, 0.8] }}
                      transition={{ repeat: Infinity, duration: 1.2 }}
                      className="w-1.5 h-1.5 rounded-full bg-[#00aa6f]"
                    />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3a3a3a]" />
                  )}
                </div>
                {/* Label */}
                <span
                  className="text-[12px] font-medium transition-colors duration-300"
                  style={{ color: done ? "#9bf0c4" : current ? "#f9fafb" : "#6b7280" }}
                >
                  {step.label}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Platform destinations being processed */}
        <div className="flex justify-center gap-2 pt-2">
          {destinations.map((dest, i) => (
            <motion.div
              key={dest}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{
                background: `${DESTINATION_ACCENT[dest]}18`,
                border: `1px solid ${DESTINATION_ACCENT[dest]}40`,
              }}
            >
              {DESTINATION_ICON[dest]}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function TransformerNodePage({
  creatorId,
  postId,
  selectedDestinations,
  mediaItems = [],
  plan,
  onPlanChange,
  postingAssistantAllowed,
  postingAssistantCapability,
  assistantByDestination,
  onAssistantByDestinationChange,
  assistantContext,
  onAssistantContextChange,
  onGeneratePlan,
  generating,
  error,
  onContinueToHandoff,
  initialPreviewMediaId = null,
}: Props) {
  const [postDetail, setPostDetail] = useState<GalleryPostDetail | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [cardBadges, setCardBadges] = useState<Partial<Record<DistributionDestination, CardBadge>>>(
    {}
  );
  const [editingDestination, setEditingDestination] = useState<DistributionDestination | null>(null);
  const [editDraft, setEditDraft] = useState({ title: "", body: "", tags: "" });
  const [savingDestination, setSavingDestination] = useState<DistributionDestination | null>(null);
  const [customTextDrafts, setCustomTextDrafts] = useState<Partial<Record<DistributionDestination, { title: string; body: string; tags: string }>>>({});
  const [approvingDestination, setApprovingDestination] = useState<DistributionDestination | null>(
    null
  );
  const [postbotTaskBusyId, setPostbotTaskBusyId] = useState<string | null>(null);
  const prefilledPreviewId = initialPreviewMediaId?.trim() || "";
  const [needsPreview, setNeedsPreview] = useState<boolean | null>(
    prefilledPreviewId ? true : null
  );
  const [previewMediaId, setPreviewMediaId] = useState(prefilledPreviewId);
  const [mediaRouting, setMediaRouting] = useState<MediaRoutingByDestination>({});
  const [needsCustomText, setNeedsCustomText] = useState<boolean | null>(null);
  const [customTextDestinations, setCustomTextDestinations] = useState<DistributionDestination[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [glowingDestinations, setGlowingDestinations] = useState<Set<DistributionDestination>>(
    new Set()
  );
  const prevPlanRef = useRef<DistributionPlanWire | null>(null);
  const customTextSectionRef = useRef<HTMLDivElement>(null);
  const routeButtonRef = useRef<HTMLButtonElement>(null);
  const [sendingDest, setSendingDest] = useState<DistributionDestination | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [destSendState, setDestSendState] = useState<
    Partial<Record<DistributionDestination, DestSendState>>
  >({});
  const [previewizerOpen, setPreviewizerOpen] = useState(false);
  const [showExistingPreviewPicker, setShowExistingPreviewPicker] = useState(false);
  const [showPostPlanPreviewAdjust, setShowPostPlanPreviewAdjust] = useState(false);
  /** After Previewizer: nudge custom-text Q or emphasize Route (or auto-route when ready). */
  const [postPreviewRouteHint, setPostPreviewRouteHint] = useState<
    "none" | "answer-custom-text" | "ready-to-route"
  >("none");
  const [coachModalOpen, setCoachModalOpen] = useState(false);
  const [studioGoals, setStudioGoals] = useState<PerformanceGoalWire[]>([]);
  const [coachPhase, setCoachPhase] = useState<CoachPhase>("questionnaire");
  const [coachProposal, setCoachProposal] = useState<CoachProposeResultWire | null>(null);
  const [platformReviewIndex, setPlatformReviewIndex] = useState(0);
  const [acceptedCopyByDestination, setAcceptedCopyByDestination] = useState<
    Partial<Record<DistributionDestination, CoachPlatformCommit>>
  >({});
  const [gatherMessageIndex, setGatherMessageIndex] = useState(0);
  const coachHydratedPlanIdRef = useRef<string | null>(null);
  const previewizerAvailable = isPreviewizerEnabled();

  const previewMedia = mediaItems[0] ?? null;
  const galleryThumb = postDetail?.media?.[0]?.thumb_url_path ?? postDetail?.media?.[0]?.content_url_path;
  void onContinueToHandoff;
  const previewUrl =
    previewMedia?.preview ||
    (galleryThumb
      ? `${RELAY_API_BASE}${galleryThumb.startsWith("/") ? galleryThumb : `/${galleryThumb}`}`
      : "");

  useEffect(() => {
    let cancelled = false;
    setPostLoading(true);
    void fetchGalleryPostDetail(creatorId, postId)
      .then((detail) => {
        if (!cancelled) setPostDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setPostDetail(null);
      })
      .finally(() => {
        if (!cancelled) setPostLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId, postId]);

  // Prefill from Audience & Promotion Continue — never auto-open Previewizer.
  useEffect(() => {
    const id = initialPreviewMediaId?.trim();
    if (!id) return;
    setPreviewMediaId(id);
    setNeedsPreview(true);
    setMediaRouting((prev) =>
      Object.keys(prev).length > 0
        ? prev
        : defaultMediaRoutingForPreviewNeed(selectedDestinations)
    );
    setShowExistingPreviewPicker(false);
    setPreviewizerOpen(false);
  }, [initialPreviewMediaId, selectedDestinations]);

  useEffect(() => {
    if (!plan) {
      prevPlanRef.current = null;
      return;
    }
    setPostPreviewRouteHint("none");
    const hydrated = hydratePreviewPlanState(plan.assistant_plan);
    const anyVariantPreview = plan.variants.some(
      (variant) => mediaVersionFromPlatformFields(variant.platform_fields) === "preview"
    );

    if (hydrated.needsPreview !== null) {
      setNeedsPreview(hydrated.needsPreview);
    } else if (hydrated.previewMediaId || anyVariantPreview) {
      setNeedsPreview(true);
    } else {
      setNeedsPreview(false);
    }

    if (hydrated.previewMediaId) setPreviewMediaId(hydrated.previewMediaId);

    if (Object.keys(hydrated.mediaRouting).length > 0) {
      setMediaRouting(hydrated.mediaRouting);
    } else {
      const fromVariants: MediaRoutingByDestination = {};
      for (const variant of plan.variants) {
        fromVariants[variant.destination as DistributionDestination] =
          mediaVersionFromPlatformFields(variant.platform_fields);
      }
      if (Object.keys(fromVariants).length > 0) {
        setMediaRouting(fromVariants);
      } else {
        setMediaRouting(defaultMediaRouting(selectedDestinations));
      }
    }

    const next: Partial<Record<DistributionDestination, CardBadge>> = {};
    for (const variant of plan.variants) {
      if (variant.assistant_enabled) {
        next[variant.destination as DistributionDestination] = "ai";
      }
    }
    setCardBadges((prev) => ({ ...next, ...prev }));

    if (prevPlanRef.current) return;
    prevPlanRef.current = plan;
    setGlowingDestinations(new Set(selectedDestinations));
    const timer = window.setTimeout(() => setGlowingDestinations(new Set()), 900);
    return () => window.clearTimeout(timer);
  }, [plan, selectedDestinations]);

  const coachEnabled = selectedDestinations.some((d) =>
    Boolean(assistantByDestination[d])
  );

  const setCoachEnabled = (enabled: boolean) => {
    if (enabled && !postingAssistantAllowed) return;
    if (enabled) {
      const next: Record<string, boolean> = {};
      for (const dest of selectedDestinations) {
        next[dest] = true;
      }
      onAssistantByDestinationChange(next);
      setCoachModalOpen(true);
      return;
    }
    const next: Record<string, boolean> = {};
    for (const dest of selectedDestinations) {
      next[dest] = false;
    }
    onAssistantByDestinationChange(next);
    onAssistantContextChange(EMPTY_ASSISTANT_CONTEXT);
    setCoachModalOpen(false);
    setCoachPhase("questionnaire");
    setCoachProposal(null);
    setAcceptedCopyByDestination({});
    setPlatformReviewIndex(0);
  };

  const confirmCoachModal = () => {
    setCoachModalOpen(false);
  };

  const cancelCoachModal = () => {
    setCoachModalOpen(false);
    if (assistantContext.goals.length === 0) {
      setCoachEnabled(false);
    }
  };

  useEffect(() => {
    if (!postingAssistantAllowed) return;
    let cancelled = false;
    void fetchPerformanceGoals({ range: "30d" })
      .then((data) => {
        if (!cancelled) setStudioGoals(data.goals ?? []);
      })
      .catch(() => {
        if (!cancelled) setStudioGoals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [postingAssistantAllowed]);

  const planIsRouted = Boolean(plan && plan.variants.length > 0);
  const hasCoachCheckpoint =
    plan?.assistant_mode === "coach_review" &&
    isCoachProposeResultWire(plan.assistant_plan?.proposal);

  // Keep newly selected destinations under Coach when the master toggle is on.
  useEffect(() => {
    if (!postingAssistantAllowed || !coachEnabled) return;
    let changed = false;
    const next = { ...assistantByDestination };
    for (const dest of selectedDestinations) {
      if (!next[dest]) {
        next[dest] = true;
        changed = true;
      }
    }
    if (changed) onAssistantByDestinationChange(next);
  }, [
    selectedDestinations,
    postingAssistantAllowed,
    coachEnabled,
    assistantByDestination,
    onAssistantByDestinationChange,
  ]);

  const variantsByDest = useMemo(() => {
    const map = new Map<DistributionDestination, DistributionVariantWire>();
    for (const dest of selectedDestinations) {
      const variant = variantForDestination(plan, dest);
      if (variant) map.set(dest, variant);
    }
    return map;
  }, [plan, selectedDestinations]);

  const startEdit = (dest: DistributionDestination) => {
    const variant = variantsByDest.get(dest);
    if (!variant) return;
    setEditingDestination(dest);
    setEditDraft({
      title: variant.title ?? "",
      body: variant.body_text ?? variant.post_text ?? "",
      tags: variant.tags.join(", "),
    });
  };

  const saveQuestionnaireEdit = () => {
    if (!editingDestination) return;
    setCustomTextDrafts((prev) => ({ ...prev, [editingDestination]: { ...editDraft } }));
    if (!customTextDestinations.includes(editingDestination)) {
      setCustomTextDestinations((prev) => [...prev, editingDestination]);
    }
    setEditingDestination(null);
  };

  const handleGeneratePlan = async (opts?: {
    previewMediaIdOverride?: string;
    acceptedCopyOverride?: Partial<Record<DistributionDestination, CoachPlatformCommit>>;
  }) => {
    const effectivePreviewMediaId = opts?.previewMediaIdOverride ?? previewMediaId;
    let draftsToApply: CustomTextDraftsByDestination | undefined =
      needsCustomText === true ? { ...customTextDrafts } : undefined;

    if (draftsToApply && editingDestination) {
      draftsToApply = {
        ...draftsToApply,
        [editingDestination]: { ...editDraft },
      };
      setCustomTextDrafts(draftsToApply);
      if (!customTextDestinations.includes(editingDestination)) {
        setCustomTextDestinations((prev) => [...prev, editingDestination]);
      }
      setEditingDestination(null);
    }

    const acceptedSource = opts?.acceptedCopyOverride ?? acceptedCopyByDestination;
    const acceptedPayload: Record<
      string,
      {
        title?: string | null;
        body_text: string;
        formula_id?: string;
        variant_id?: string;
      }
    > = {};
    for (const [dest, commit] of Object.entries(acceptedSource)) {
      if (!commit?.body_text?.trim()) continue;
      acceptedPayload[dest] = {
        title: commit.title ?? null,
        body_text: commit.body_text.trim(),
        formula_id: commit.formula_id,
        variant_id: commit.variant_id,
      };
    }

    setPostPreviewRouteHint("none");
    await onGeneratePlan({
      ...(draftsToApply && Object.keys(draftsToApply).length > 0
        ? { customTextDrafts: draftsToApply }
        : {}),
      ...(needsPreview !== null
        ? buildMediaRoutingPlanPayload({
            needsPreview,
            previewMediaId: effectivePreviewMediaId,
            mediaRouting,
            destinations: selectedDestinations,
          })
        : {}),
      ...(Object.keys(acceptedPayload).length > 0
        ? { accepted_copy_by_destination: acceptedPayload }
        : {}),
    });
  };

  const coachDestinations = useMemo(
    () => selectedDestinations.filter((d) => Boolean(assistantByDestination[d])),
    [selectedDestinations, assistantByDestination]
  );

  const persistCoachProgress = useCallback(
    async (body: {
      coach_phase?: "findings" | "platformReview" | "gathering";
      platform_review_index?: number;
      accepted_copy_by_destination?: Record<
        string,
        {
          title?: string | null;
          body_text: string;
          formula_id?: string;
          variant_id?: string;
        }
      >;
    }) => {
      try {
        const { plan: next } = await patchCoachReviewProgress(postId, body);
        onPlanChange(next);
      } catch {
        /* best-effort progress checkpoint */
      }
    },
    [postId, onPlanChange]
  );

  useEffect(() => {
    if (!plan) {
      coachHydratedPlanIdRef.current = null;
      return;
    }

    if (plan.assistant_mode === "coach_review") {
      const proposalRaw = plan.assistant_plan?.proposal;
      if (
        isCoachProposeResultWire(proposalRaw) &&
        coachHydratedPlanIdRef.current !== plan.plan_id
      ) {
        coachHydratedPlanIdRef.current = plan.plan_id;
        setCoachProposal(proposalRaw);
        const phase = parseCoachPhase(plan.assistant_plan?.coach_phase) ?? "findings";
        setCoachPhase(phase);
        const idx =
          typeof plan.assistant_plan?.platform_review_index === "number"
            ? Math.max(0, plan.assistant_plan.platform_review_index)
            : 0;
        setPlatformReviewIndex(idx);
        setAcceptedCopyByDestination(
          acceptedCopyFromContext(plan.assistant_context?.accepted_copy_by_destination)
        );

        const rawDests = Array.isArray(plan.assistant_plan?.coach_destinations)
          ? (plan.assistant_plan.coach_destinations as unknown[])
          : [];
        const nextByDest: Record<string, boolean> = {};
        for (const dest of selectedDestinations) {
          nextByDest[dest] = false;
        }
        for (const dest of rawDests) {
          if (typeof dest === "string" && DESTINATION_SET.has(dest as DistributionDestination)) {
            nextByDest[dest] = true;
          }
        }
        if (Object.values(nextByDest).some(Boolean)) {
          onAssistantByDestinationChange(nextByDest);
        }

        const ctx = plan.assistant_context ?? {};
        const goalsRaw = Array.isArray(ctx.goals) ? ctx.goals : [];
        const goals = goalsRaw.filter(
          (g): g is AssistantGoal => typeof g === "string" && ASSISTANT_GOAL_SET.has(g as AssistantGoal)
        );
        onAssistantContextChange({
          goals,
          user_notes: typeof ctx.user_notes === "string" ? ctx.user_notes : "",
          locale: typeof ctx.locale === "string" ? ctx.locale : "",
          trend_note: typeof ctx.trend_note === "string" ? ctx.trend_note : "",
        });
      }
      return;
    }

    // Fully routed plan — close Coach review UI (do not wipe mid-review coach_review stubs)
    if (plan.variants.length > 0) {
      coachHydratedPlanIdRef.current = null;
      setCoachPhase("questionnaire");
      setCoachProposal(null);
      setPlatformReviewIndex(0);
    }
  }, [
    plan,
    selectedDestinations,
    onAssistantByDestinationChange,
    onAssistantContextChange,
  ]);

  useEffect(() => {
    if (coachPhase !== "gathering") return;
    setGatherMessageIndex(0);
    const timer = window.setInterval(() => {
      setGatherMessageIndex((i) => (i + 1) % COACH_GATHER_MESSAGES.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [coachPhase]);

  const startCoachGather = async () => {
    if (!coachEnabled || assistantContext.goals.length === 0) return;
    setLocalError(null);
    setCoachPhase("gathering");
    setCoachProposal(null);
    setAcceptedCopyByDestination({});
    setPlatformReviewIndex(0);
    try {
      const { proposal } = await proposeCoachAttackPlans(postId, {
        destinations: selectedDestinations,
        assistant_by_destination: Object.fromEntries(
          selectedDestinations.map((d) => [d, Boolean(assistantByDestination[d])])
        ) as Partial<Record<DistributionDestination, boolean>>,
        assistant_context: {
          goals: assistantContext.goals,
          user_notes: assistantContext.user_notes || null,
          locale: assistantContext.locale || null,
          trend_note: assistantContext.trend_note || null,
        },
      });
      setCoachProposal(proposal);
      setCoachPhase("findings");
      coachHydratedPlanIdRef.current = null;
      const { plan: checkpoint } = await fetchPostDistributionPlan(postId);
      if (checkpoint) {
        coachHydratedPlanIdRef.current = checkpoint.plan_id;
        onPlanChange(checkpoint);
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
      setCoachPhase("questionnaire");
    }
  };

  const runCoachAgain = async () => {
    setLocalError(null);
    try {
      await clearCoachReviewCheckpoint(postId);
      coachHydratedPlanIdRef.current = null;
      onPlanChange(null);
      setCoachProposal(null);
      setAcceptedCopyByDestination({});
      setPlatformReviewIndex(0);
      await startCoachGather();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePlatformCommit = async (commit: CoachPlatformCommit) => {
    const nextAccepted = {
      ...acceptedCopyByDestination,
      [commit.destination]: commit,
    };
    setAcceptedCopyByDestination(nextAccepted);
    const acceptedPayload: Record<
      string,
      {
        title?: string | null;
        body_text: string;
        formula_id?: string;
        variant_id?: string;
      }
    > = {};
    for (const [dest, row] of Object.entries(nextAccepted)) {
      if (!row?.body_text?.trim()) continue;
      acceptedPayload[dest] = {
        title: row.title ?? null,
        body_text: row.body_text.trim(),
        formula_id: row.formula_id,
        variant_id: row.variant_id,
      };
    }

    if (platformReviewIndex + 1 < coachDestinations.length) {
      const nextIndex = platformReviewIndex + 1;
      setPlatformReviewIndex(nextIndex);
      void persistCoachProgress({
        coach_phase: "platformReview",
        platform_review_index: nextIndex,
        accepted_copy_by_destination: acceptedPayload,
      });
      return;
    }
    setCoachPhase("questionnaire");
    await handleGeneratePlan({ acceptedCopyOverride: nextAccepted });
  };

  const handleRouteClick = () => {
    if (coachEnabled && assistantContext.goals.length > 0) {
      if (coachProposal && plan?.assistant_mode === "coach_review") {
        const phase = parseCoachPhase(plan.assistant_plan?.coach_phase) ?? "findings";
        setCoachPhase(phase);
        return;
      }
      if (coachProposal) {
        setCoachPhase("findings");
        return;
      }
      void startCoachGather();
      return;
    }
    void handleGeneratePlan();
  };

  const previewDestinations = useMemo(
    () => destinationsUsingPreviewRouting(selectedDestinations, mediaRouting),
    [selectedDestinations, mediaRouting]
  );
  const previewRoutingNeedsMediaId =
    needsPreview === true && previewDestinations.length > 0 && !previewMediaId.trim();

  const previewizerSourceMediaId = useMemo(() => {
    const fromItems = mediaItems.find((m) => m.type === "image") ?? mediaItems[0];
    if (fromItems?.type === "image" && fromItems.id.trim()) return fromItems.id.trim();
    const fromGallery = postDetail?.media?.find((m) =>
      m.mime_type ? m.mime_type.startsWith("image/") : true
    );
    return fromGallery?.media_id?.trim() ?? postDetail?.media?.[0]?.media_id?.trim() ?? "";
  }, [mediaItems, postDetail?.media]);

  const previewizerSession = useMemo(() => {
    if (!previewizerSourceMediaId) return null;
    return buildPreviewizerSession({
      creatorId,
      postId,
      sourceMediaId: previewizerSourceMediaId,
      sourceImageUrl: exportMediaContentUrl(creatorId, previewizerSourceMediaId),
    });
  }, [creatorId, postId, previewizerSourceMediaId]);

  const previewizerDisabled = !previewizerSourceMediaId;
  const previewizerDisabledReason = previewizerDisabled
    ? "This post has no image media to use as a Previewizer base."
    : undefined;

  const setNeedsPreviewChoice = (value: boolean) => {
    setNeedsPreview(value);
    if (value) {
      // Smart defaults: teaser platforms → Preview; Patreon → Full. Does not touch previewMediaId.
      setMediaRouting(defaultMediaRoutingForPreviewNeed(selectedDestinations));
      // When Previewizer is flagged off, surface the picker as the primary path immediately.
      if (!previewizerAvailable) setShowExistingPreviewPicker(true);
    } else {
      setMediaRouting({});
      setPreviewMediaId("");
      setShowExistingPreviewPicker(false);
    }
  };

  const setMediaVersionForDestination = (dest: DistributionDestination, version: MediaVersion) => {
    setMediaRouting((prev) => ({ ...prev, [dest]: version }));
  };

  const openPreviewizer = () => {
    if (!previewizerAvailable || previewizerDisabled || !previewizerSession) return;
    setPreviewizerOpen(true);
  };

  const mediaRoutingStale = useMemo(() => {
    if (!plan) return false;
    return isMediaRoutingStale(selectedDestinations, {
      variants: plan.variants,
      needsPreview,
      previewMediaId,
      mediaRouting,
      assistantPlan: plan.assistant_plan,
    });
  }, [plan, selectedDestinations, needsPreview, previewMediaId, mediaRouting]);

  const handlePreviewizerComplete = (result: PreviewizerResult) => {
    // Routing stays caller-owned — Previewizer only returns a media id.
    setPreviewMediaId(result.previewMediaId);
    setShowExistingPreviewPicker(false);
    setPreviewizerOpen(false);

    const previewMediaReady =
      needsPreview !== true ||
      previewDestinations.length === 0 ||
      Boolean(result.previewMediaId.trim());

    // Still need the custom-text answer — scroll there instead of auto-routing.
    if (needsCustomText === null) {
      setPostPreviewRouteHint("answer-custom-text");
      requestAnimationFrame(() => {
        customTextSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    const canAutoRoute =
      needsPreview !== null &&
      previewMediaReady &&
      selectedDestinations.length > 0 &&
      !generating &&
      !planIsRouted;

    if (canAutoRoute) {
      setPostPreviewRouteHint("none");
      if (coachEnabled && assistantContext.goals.length > 0) {
        void startCoachGather();
      } else {
        void handleGeneratePlan({ previewMediaIdOverride: result.previewMediaId });
      }
      return;
    }

    // Questionnaires incomplete or blocked — emphasize Route CTA.
    setPostPreviewRouteHint("ready-to-route");
    requestAnimationFrame(() => {
      routeButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      routeButtonRef.current?.focus();
    });
  };

  // After Previewizer, once custom-text is answered:
  // - No custom text → auto-route (questionnaires done)
  // - Yes custom text → emphasize Route (artist may still edit copy)
  useEffect(() => {
    if (postPreviewRouteHint !== "answer-custom-text") return;
    if (needsCustomText === null) return;
    if (plan || generating) return;

    const previewMediaReady =
      needsPreview !== true ||
      previewDestinations.length === 0 ||
      Boolean(previewMediaId.trim());

    if (
      needsCustomText === false &&
      needsPreview !== null &&
      previewMediaReady &&
      selectedDestinations.length > 0
    ) {
      setPostPreviewRouteHint("none");
      if (coachEnabled && assistantContext.goals.length > 0) {
        void startCoachGather();
      } else {
        void handleGeneratePlan();
      }
      return;
    }

    setPostPreviewRouteHint("ready-to-route");
    requestAnimationFrame(() => {
      routeButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      routeButtonRef.current?.focus();
    });
  }, [
    needsCustomText,
    postPreviewRouteHint,
    plan,
    generating,
    needsPreview,
    previewDestinations.length,
    previewMediaId,
    selectedDestinations.length,
  ]);

  useEffect(() => {
    if (postPreviewRouteHint !== "ready-to-route") return;
    const timer = window.setTimeout(() => setPostPreviewRouteHint("none"), 5000);
    return () => window.clearTimeout(timer);
  }, [postPreviewRouteHint]);

  const uploadPreviewizerBlob = async (blob: Blob) => {
    const file = new File([blob], `preview-${postId}.jpg`, { type: "image/jpeg" });
    const uploaded = await uploadFileToRelayStaging({ creatorId, file });
    return { mediaId: uploaded.media_id };
  };

  const saveEdit = async () => {
    if (!plan || !editingDestination) return;
    const variant = variantsByDest.get(editingDestination);
    if (!variant) return;
    setSavingDestination(editingDestination);
    setLocalError(null);
    try {
      const tags = editDraft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { variant: saved } = await patchDistributionVariant(variant.variant_id, {
        title: editDraft.title.trim() || null,
        body_text: editDraft.body.trim() || null,
        tags,
      });
      onPlanChange({
        ...plan,
        variants: plan.variants.map((v) => (v.variant_id === saved.variant_id ? saved : v)),
      });
      setCardBadges((prev) => ({ ...prev, [editingDestination]: "custom" }));
      setEditingDestination(null);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingDestination(null);
    }
  };

  const approveVariant = async (dest: DistributionDestination) => {
    const variant = variantsByDest.get(dest);
    if (!variant || !plan) return;
    setApprovingDestination(dest);
    setLocalError(null);
    try {
      const { variant: saved } = await approveDistributionVariant(variant.variant_id);
      onPlanChange({
        ...plan,
        variants: plan.variants.map((v) => (v.variant_id === saved.variant_id ? saved : v)),
      });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setApprovingDestination(null);
    }
  };

  const patchDestSend = useCallback(
    (dest: DistributionDestination, patch: Partial<DestSendState>) => {
      setDestSendState((prev) => {
        const current = prev[dest] ?? EMPTY_DEST_SEND;
        return { ...prev, [dest]: { ...current, ...patch } };
      });
    },
    []
  );

  useEffect(() => {
    const refreshAttempts = () => {
      for (const [dest, state] of Object.entries(destSendState) as Array<
        [DistributionDestination, DestSendState]
      >) {
        if (!state?.attemptId || state.fillStatus === "posted") continue;
        const attemptId = state.attemptId;
        void fetchDistributionAttempt(attemptId)
          .then(({ attempt }) => {
            if (attempt.status !== "posted") return;
            patchDestSend(dest, {
              fillStatus: "posted",
              confirmBusy: false,
              confirmExpanded: false,
              confirmUrlDraft: "",
            });
          })
          .catch(() => {
            /* focus/extension refresh is best-effort */
          });
      }
    };

    return subscribeRelayDistributionRefresh(refreshAttempts);
  }, [destSendState, patchDestSend]);

  const pollAttempt = useCallback(
    async (dest: DistributionDestination, attemptId: string) => {
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const { attempt } = await fetchDistributionAttempt(attemptId);
          if (attempt.status.startsWith("fill_") || attempt.status === "posted") {
            patchDestSend(dest, { fillStatus: attempt.status, attemptId });
            return;
          }
        } catch {
          /* keep polling */
        }
      }
      // Extension may still toast-confirm; unlock manual paste/confirm either way.
      patchDestSend(dest, { fillStatus: "awaiting_confirm", attemptId });
    },
    [patchDestSend]
  );

  const confirmPosted = async (dest: DistributionDestination, url?: string) => {
    const state = destSendState[dest];
    if (!state?.attemptId || state.confirmBusy) return;
    patchDestSend(dest, { confirmBusy: true });
    try {
      const trimmedUrl = url?.trim() || null;
      await completeDistributionAttempt(state.attemptId, {
        status: "posted",
        ...(trimmedUrl ? { external_url: trimmedUrl } : {}),
      });
      patchDestSend(dest, {
        fillStatus: "posted",
        confirmBusy: false,
        confirmExpanded: false,
        confirmUrlDraft: "",
      });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
      patchDestSend(dest, { confirmBusy: false });
    }
  };

  const postToDestination = async (dest: DistributionDestination) => {
    const variant = variantsByDest.get(dest);
    if (!variant) return;
    setSendingDest(dest);
    setSendError(null);
    try {
      await approveDistributionVariant(variant.variant_id);

      if (dest === "bluesky") {
        const result = await crossPostBlueskyPost(postId);
        const { attempt } = await startDistributionHandoff(variant.variant_id);
        await completeDistributionAttempt(attempt.attempt_id, {
          external_id: result.cid,
          external_url: result.uri,
          status: "posted",
        });
        patchDestSend(dest, {
          attemptId: attempt.attempt_id,
          fillStatus: "posted",
          confirmExpanded: false,
          confirmUrlDraft: "",
          confirmBusy: false,
        });
        return;
      }

      const probe = await probeRelayExtensionStatus();
      if (!probe.ok) {
        setSendError("Connect the Relay extension before cross-posting.");
        return;
      }

      const { attempt } = await startDistributionHandoff(variant.variant_id);
      const result = await sendRelayCrossPostToExtension(postId, dest, undefined, {
        distribution_attempt_id: attempt.attempt_id,
      });
      if (!result.ok) {
        setSendError(describeRelayCrossPostFailure(result));
        patchDestSend(dest, {
          attemptId: attempt.attempt_id,
          fillStatus: null,
          confirmExpanded: false,
          confirmUrlDraft: "",
          confirmBusy: false,
        });
        return;
      }
      patchDestSend(dest, {
        attemptId: attempt.attempt_id,
        fillStatus: "handoff_started",
        confirmExpanded: false,
        confirmUrlDraft: "",
        confirmBusy: false,
      });
      void pollAttempt(dest, attempt.attempt_id);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingDest(null);
    }
  };

  const mergeVariantIntoPlan = (saved: DistributionVariantWire) => {
    if (!plan) return;
    onPlanChange({
      ...plan,
      variants: plan.variants.map((v) => (v.variant_id === saved.variant_id ? saved : v)),
    });
  };

  const mergePostbotTaskIntoPlan = (task: PostbotTaskWire) => {
    if (!plan) return;
    onPlanChange({
      ...plan,
      variants: plan.variants.map((variant) => {
        const tasks = variant.postbot_tasks ?? [];
        if (!tasks.some((row) => row.task_id === task.task_id)) return variant;
        return {
          ...variant,
          postbot_tasks: tasks.map((row) => (row.task_id === task.task_id ? task : row)),
        };
      }),
    });
  };

  const applyPostbotSchedule = async (task: PostbotTaskWire) => {
    const variant = plan?.variants.find((row) => row.variant_id === task.variant_id);
    if (!variant || !task.suggested_time || !plan) return;
    setPostbotTaskBusyId(task.task_id);
    setLocalError(null);
    try {
      const [{ variant: savedVariant }, { task: savedTask }] = await Promise.all([
        patchDistributionVariant(variant.variant_id, { scheduled_for: task.suggested_time }),
        patchPostbotTask(task.task_id, { status: "done" }),
      ]);
      mergeVariantIntoPlan(savedVariant);
      mergePostbotTaskIntoPlan(savedTask);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setPostbotTaskBusyId(null);
    }
  };



  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-5">
      <div>
        <h2 className="text-xl font-bold text-[#f9fafb]">Transform &amp; route</h2>
        <p className="mt-1 text-xs text-[#9ca3af]">
          Apply templates or PostBot, then route formatted variants to each platform.
        </p>
      </div>

      {/* Pre-routing: 3-column layout with source, questionnaire, destinations.
          Uses min-[960px] (not viewport lg alone) so a narrow host never crushes columns. */}
      {!planIsRouted && (
      <div className="relative grid grid-cols-1 items-start gap-4 min-[960px]:grid-cols-[280px_minmax(0,1fr)_minmax(0,320px)]">
        {/* Loading overlay */}
        <AnimatePresence>
          {generating && (
            <TransformerLoadingOverlay destinations={selectedDestinations} />
          )}
        </AnimatePresence>
        {/* Source post */}
        <SourcePostCard
          loading={postLoading}
          previewUrl={previewUrl}
          title={postDetail?.title ?? "Relay post"}
          description={postDetail?.description?.trim() || "No description on the Relay post."}
          tags={postDetail?.tag_ids ?? []}
        />

        {/* Strategy questionnaire — Coach LLM steps open in CoachReviewModal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="flex min-w-0 flex-col gap-5 rounded-2xl border p-5"
          style={{ borderColor: "#2a2a2a", background: "rgba(10,10,10,0.95)" }}
        >
          <div>
            <h3 className="text-sm font-bold text-[#f9fafb]">Before we route</h3>
            <p className="text-[11px] text-[#6b7280] mt-1">
              Answer these to configure your cross-posts.
            </p>
          </div>

          {/* Relay Coach — first, before custom-text / preview */}
          <div
            className="rounded-2xl border p-4"
            style={{
              borderColor: coachEnabled ? "rgba(0,170,111,0.4)" : "#2a2a2a",
              background: "#0a0a0a",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Wand2
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: coachEnabled ? "#9bf0c4" : "#6b7280" }}
                    aria-hidden
                  />
                  <p className="text-xs font-semibold text-[#f9fafb]">
                    Coach this post
                  </p>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{
                      background: "rgba(0,170,111,0.12)",
                      color: "#9bf0c4",
                      border: "1px solid rgba(0,170,111,0.25)",
                    }}
                  >
                    {postingAssistantAllowed ? "Relay Coach" : "Premium"}
                  </span>
                </div>
                <p className="text-[10px] text-[#6b7280] mt-1">
                  {coachEnabled && assistantContext.goals.length > 0
                    ? "Path applied — edit anytime."
                    : "Timing and copy tuned to your goals."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={coachEnabled}
                aria-label="Coach this post"
                disabled={!postingAssistantAllowed}
                title={
                  postingAssistantAllowed
                    ? undefined
                    : "Relay Coach requires Autopost plan — open Billing to upgrade"
                }
                onClick={() => {
                  if (coachEnabled) {
                    setCoachEnabled(false);
                  } else {
                    setCoachEnabled(true);
                  }
                }}
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]"
                style={{
                  background: coachEnabled ? "#00aa6f" : "#2a2a2a",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                  style={{
                    transform: coachEnabled
                      ? "translateX(20px)"
                      : "translateX(0)",
                  }}
                />
              </button>
            </div>
            {!postingAssistantAllowed ? (
              <p className="mt-2 text-[10px] text-[#888]" data-testid="coach-upgrade-hint">
                Upgrade required.{" "}
                <Link
                  href="/studio/settings/billing?feature=posting_assistant"
                  className="text-[var(--lib-primary,#00AA6F)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]"
                  data-testid="coach-billing-link"
                >
                  View plans
                </Link>
                {postingAssistantCapability?.reason === "legacy_feature_flag"
                  ? null
                  : null}
              </p>
            ) : null}
            {coachEnabled && assistantContext.goals.length > 0 ? (
              <button
                type="button"
                onClick={() => setCoachModalOpen(true)}
                className="mt-3 w-full rounded-lg border px-3 py-2 text-left text-[11px] text-[#9bf0c4]"
                style={{ borderColor: "rgba(0,170,111,0.3)", background: "rgba(0,170,111,0.06)" }}
              >
                {(() => {
                  const pathId = coachPathFromGoals(assistantContext.goals);
                  const path = COACH_PATHS.find((p) => p.id === pathId);
                  return path
                    ? `${path.label} — change path…`
                    : "Change Coach path…";
                })()}
              </button>
            ) : null}
          </div>

          {/* Q1: Preview */}
          <PreviewRoutingPanel
            needsPreview={needsPreview}
            onNeedsPreviewChange={setNeedsPreviewChoice}
            mediaRouting={mediaRouting}
            onMediaVersionChange={setMediaVersionForDestination}
            selectedDestinations={selectedDestinations}
            previewDestinations={previewDestinations}
            creatorId={creatorId}
            postMedia={postDetail?.media}
            previewMediaId={previewMediaId}
            onPreviewMediaIdChange={setPreviewMediaId}
            onOpenPreviewizer={openPreviewizer}
            previewizerDisabled={previewizerDisabled}
            previewizerDisabledReason={previewizerDisabledReason}
            previewizerAvailable={previewizerAvailable}
            showExistingPicker={showExistingPreviewPicker}
            onToggleExistingPicker={() => setShowExistingPreviewPicker((prev) => !prev)}
          />

          {/* Q2: Custom text */}
          <div
            ref={customTextSectionRef}
            className="rounded-2xl border p-4 space-y-3 transition-[box-shadow,border-color] duration-300"
            style={{
              borderColor:
                postPreviewRouteHint === "answer-custom-text"
                  ? "rgba(155,240,196,0.65)"
                  : needsCustomText === null
                    ? "#2a2a2a"
                    : needsCustomText
                      ? "rgba(0,170,111,0.4)"
                      : "#2a2a2a",
              background: "#0a0a0a",
              boxShadow:
                postPreviewRouteHint === "answer-custom-text"
                  ? "0 0 0 1px rgba(155,240,196,0.35), 0 0 24px rgba(0,170,111,0.18)"
                  : undefined,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-[#d1d5db]">Will any post need custom text?</p>
                <p className="text-[10px] text-[#6b7280] mt-0.5">Consider: X has a 280 character limit</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setNeedsCustomText(true)}
                  className="rounded-full px-4 py-1.5 text-[11px] font-semibold transition-colors"
                  style={{
                    background: needsCustomText === true ? "#00aa6f" : "#1a1a1a",
                    color: needsCustomText === true ? "#000" : "#9ca3af",
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNeedsCustomText(false);
                    setCustomTextDestinations([]);
                  }}
                  className="rounded-full px-4 py-1.5 text-[11px] font-semibold transition-colors"
                  style={{
                    background: needsCustomText === false ? "#1a1a1a" : "#1a1a1a",
                    color: needsCustomText === false ? "#f9fafb" : "#6b7280",
                    borderColor: needsCustomText === false ? "#3a3a3a" : "transparent",
                    borderWidth: 1,
                    borderStyle: "solid",
                  }}
                >
                  No
                </button>
              </div>
            </div>
            <AnimatePresence mode="wait">
              {needsCustomText ? (
                <motion.div
                  key="custom-text-unfurl"
                  custom={1}
                  variants={SLIDE_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={SLIDE_TRANSITION}
                  className="overflow-hidden space-y-2"
                >
                  <p className="text-[10px] text-[#6b7280]">Select platform to customize:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedDestinations.map((dest) => {
                      const active = customTextDestinations.includes(dest);
                      const isCurrent = editingDestination === dest;
                      return (
                        <button
                          key={dest}
                          type="button"
                          onClick={() => {
                            if (isCurrent) return;
                            if (editingDestination && editDraft.body.trim()) {
                              if (plan) {
                                void saveEdit();
                              } else {
                                saveQuestionnaireEdit();
                              }
                            }
                            if (!active) {
                              setCustomTextDestinations((prev) => [...prev, dest]);
                            }
                            const existingDraft = customTextDrafts[dest];
                            const variant = variantsByDest.get(dest);
                            setEditingDestination(dest);
                            setEditDraft({
                              title: existingDraft?.title ?? variant?.title ?? postDetail?.title ?? "",
                              body: existingDraft?.body ?? variant?.body_text ?? variant?.post_text ?? postDetail?.description ?? "",
                              tags: existingDraft?.tags ?? variant?.tags.join(", ") ?? postDetail?.tag_ids?.join(", ") ?? "",
                            });
                          }}
                          className="rounded-full border px-4 py-1.5 text-[11px] font-semibold transition-colors"
                          style={{
                            borderColor: isCurrent ? DESTINATION_ACCENT[dest] : active ? `${DESTINATION_ACCENT[dest]}88` : "#2a2a2a",
                            background: isCurrent ? `${DESTINATION_ACCENT[dest]}15` : "transparent",
                            color: isCurrent ? DESTINATION_ACCENT[dest] : active ? DESTINATION_ACCENT[dest] : "#6b7280",
                          }}
                        >
                          {DESTINATION_LABEL[dest]}
                          {active && !isCurrent ? (
                            <Check className="inline h-3 w-3 ml-1 opacity-60" aria-hidden />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence mode="wait">
                    {editingDestination && customTextDestinations.includes(editingDestination) ? (
                      <motion.div
                        key={editingDestination}
                        custom={1}
                        variants={SLIDE_VARIANTS}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={SLIDE_TRANSITION}
                        className="rounded-lg border p-3 space-y-2.5"
                        style={{ borderColor: `${DESTINATION_ACCENT[editingDestination]}55` }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="text-[10px] font-semibold"
                            style={{ color: DESTINATION_ACCENT[editingDestination] }}
                          >
                            {DESTINATION_LABEL[editingDestination]}
                          </span>
                        </div>

                        <CustomTextEditorFields
                          dest={editingDestination}
                          draft={editDraft}
                          onChange={(patch) => setEditDraft((d) => ({ ...d, ...patch }))}
                          variant="questionnaire"
                        />

                        <button
                          type="button"
                          onClick={() => plan ? void saveEdit() : saveQuestionnaireEdit()}
                          className="rounded-full px-4 py-1.5 text-[10px] font-semibold disabled:opacity-50 transition-colors"
                          style={{ background: "#00aa6f", color: "#000" }}
                        >
                          {savingDestination === editingDestination ? "Saving…" : "Save"}
                        </button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Route / Next button */}
          {!planIsRouted ? (
            <button
              ref={routeButtonRef}
              type="button"
              disabled={
                generating ||
                selectedDestinations.length === 0 ||
                needsPreview === null ||
                needsCustomText === null ||
                previewRoutingNeedsMediaId ||
                (coachEnabled && assistantContext.goals.length === 0)
              }
              onClick={() => void handleRouteClick()}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-30 ${
                postPreviewRouteHint === "ready-to-route"
                  ? "ring-2 ring-[#9bf0c4] ring-offset-2 ring-offset-black"
                  : ""
              }`}
              style={{ background: "#00aa6f", color: "#000" }}
            >
              {generating ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Routing to platforms…
                </span>
              ) : hasCoachCheckpoint || coachProposal ? (
                "Resume Coach review"
              ) : coachEnabled ? (
                "Route with Coach"
              ) : (
                "Route to platforms"
              )}
            </button>
          ) : (
            <p className="text-[10px] text-[#9bf0c4] text-center">
              Routed — review and approve each platform below.
            </p>
          )}

          {previewRoutingNeedsMediaId ? (
            <p className="text-[10px] text-amber-300/90 text-center">
              Add a preview media ID for platforms using Preview routing.
            </p>
          ) : postPreviewRouteHint === "answer-custom-text" ? (
            <p className="text-[10px] text-[#9bf0c4] text-center">
              Preview ready — answer the custom text question to continue.
            </p>
          ) : postPreviewRouteHint === "ready-to-route" ? (
            <p className="text-[10px] text-[#9bf0c4] text-center">
              Preview ready — route to platforms when you are.
            </p>
          ) : needsPreview === null || needsCustomText === null ? (
            <p className="text-[10px] text-[#6b7280] text-center">
              Answer both questions to unlock routing.
            </p>
          ) : null}
        </motion.div>

        {coachPhase !== "questionnaire" ? (
          <CoachReviewModal
            title={
              coachPhase === "gathering"
                ? "Gathering research"
                : coachPhase === "findings"
                  ? "Here's what I found"
                  : coachPhase === "platformReview" &&
                      coachDestinations[platformReviewIndex]
                    ? DESTINATION_LABEL[coachDestinations[platformReviewIndex]!]
                    : "Relay Coach"
            }
            subtitle={
              coachPhase === "findings" && coachProposal
                ? "Grounded signals for this run — then pick copy."
                : coachPhase === "platformReview"
                  ? "Formula drafts for this platform."
                  : coachPhase === "gathering"
                    ? "Pulling post, history, and goals…"
                    : null
            }
            size={coachPhase === "platformReview" ? "lg" : "md"}
            onClose={() => {
              setCoachPhase("questionnaire");
              if (plan?.assistant_mode !== "coach_review") {
                setCoachProposal(null);
                setPlatformReviewIndex(0);
              }
            }}
          >
            {coachPhase === "gathering" ? (
              <CoachGatheringPanel message={COACH_GATHER_MESSAGES[gatherMessageIndex]!} />
            ) : coachPhase === "findings" && coachProposal ? (
              <div className="flex flex-col gap-3">
                <CoachFindingsPanel
                  pathId={coachProposal.path_id}
                  chips={coachProposal.findings.chips}
                  onContinue={() => {
                    if (coachDestinations.length === 0) {
                      setLocalError("Enable Coach on at least one destination.");
                      setCoachPhase("questionnaire");
                      return;
                    }
                    setPlatformReviewIndex(0);
                    setCoachPhase("platformReview");
                    void persistCoachProgress({
                      coach_phase: "platformReview",
                      platform_review_index: 0,
                    });
                  }}
                  onBack={() => {
                    setCoachPhase("questionnaire");
                  }}
                />
                <button
                  type="button"
                  onClick={() => void runCoachAgain()}
                  className="text-[11px] self-center underline-offset-2 hover:underline"
                  style={{ color: "#6b7280" }}
                >
                  Run Coach again
                </button>
              </div>
            ) : coachPhase === "platformReview" &&
              coachProposal &&
              coachDestinations[platformReviewIndex] ? (
              <CoachPlatformCopyReview
                embedded
                destination={coachDestinations[platformReviewIndex]!}
                stepIndex={platformReviewIndex + 1}
                stepTotal={coachDestinations.length}
                variants={
                  coachProposal.by_destination[coachDestinations[platformReviewIndex]!]
                    ?.variants ?? []
                }
                isLastPlatform={platformReviewIndex + 1 >= coachDestinations.length}
                onCommit={(commit) => void handlePlatformCommit(commit)}
                onBack={() => {
                  if (platformReviewIndex > 0) {
                    const next = platformReviewIndex - 1;
                    setPlatformReviewIndex(next);
                    void persistCoachProgress({
                      coach_phase: "platformReview",
                      platform_review_index: next,
                    });
                    return;
                  }
                  setCoachPhase("findings");
                  void persistCoachProgress({
                    coach_phase: "findings",
                    platform_review_index: 0,
                  });
                }}
              />
            ) : (
              <CoachGatheringPanel message="Preparing Coach…" />
            )}
          </CoachReviewModal>
        ) : null}

        {/* Platform cards */}
        <div className="min-w-0 space-y-3">
          <p
            className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "#6b7280" }}
          >
            Destinations
          </p>
          {selectedDestinations.map((dest, index) => {
            const variant = variantsByDest.get(dest);
            const filled = Boolean(variant);
            const approved =
              variant?.status === "approved" || Boolean(variant?.approved_at);
            const badge =
              cardBadges[dest] ??
              (customTextDrafts[dest] ? "custom" : variant?.assistant_enabled ? "ai" : null);
            const isEditing = editingDestination === dest;
            const isActive =
              isEditing ||
              (needsCustomText === true && customTextDestinations.includes(dest));

            return (
              <DestinationPlatformCard
                key={dest}
                dest={dest}
                index={index}
                filled={filled}
                approved={approved}
                badge={badge}
                isEditing={isEditing}
                isActive={isActive}
                glowing={glowingDestinations.has(dest)}
                previewUrl={previewUrl}
                variant={variant}
                editDraft={editDraft}
                savingDestination={savingDestination === dest}
                approvingDestination={approvingDestination === dest}
                postbotTaskBusyId={postbotTaskBusyId}
                onEditDraftChange={(patch) => setEditDraft((d) => ({ ...d, ...patch }))}
                onCancelEdit={() => setEditingDestination(null)}
                onSaveEdit={() => void saveEdit()}
                onStartEdit={() => startEdit(dest)}
                onApprove={() => void approveVariant(dest)}
                onApplyPostbotSchedule={(task) => void applyPostbotSchedule(task)}
                onTaskUpdated={mergePostbotTaskIntoPlan}
                onTaskBusyChange={setPostbotTaskBusyId}
              />
            );
          })}
        </div>
      </div>
      )}

      {(error || localError) && (
        <p className="text-xs text-red-300" role="alert">
          {error ?? localError}
        </p>
      )}

      {/* Post-routing: clean horizontal card lineup */}
      {planIsRouted ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="space-y-6"
        >
          {/* Distribution heading */}
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="text-center"
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "#00aa6f" }}
            >
              Step 3 — Distribution
            </p>
            <h3 className="text-lg font-bold text-white leading-tight">
              Ready to send
            </h3>
            <p className="text-xs text-[#9ca3af] mt-1">
              Review each destination and post when ready.
            </p>
          </motion.div>

          {mediaRoutingStale ? (
            <div
              className="mx-auto max-w-xl rounded-2xl border px-4 py-3 text-left"
              style={{
                borderColor: "rgba(251,191,36,0.45)",
                background: "rgba(251,191,36,0.08)",
              }}
              role="status"
            >
              <p className="text-[12px] font-semibold text-amber-200">
                Preview routing changed since last route
              </p>
              <p className="mt-1 text-[11px] text-amber-100/80">
                Send cards may still show the previous plan. Re-route to apply your new preview
                image or Full/Preview toggles.
              </p>
              <button
                type="button"
                disabled={generating}
                onClick={() => void handleGeneratePlan()}
                className="mt-3 rounded-full px-4 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
                style={{ background: "#fbbf24", color: "#111" }}
              >
                {generating ? "Re-routing…" : "Re-route to apply"}
              </button>
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-xl">
            <button
              type="button"
              onClick={() => setShowPostPlanPreviewAdjust((prev) => !prev)}
              className="text-[10px] text-[#6b7280] underline-offset-2 hover:text-[#9ca3af] hover:underline"
            >
              {showPostPlanPreviewAdjust
                ? "Hide preview routing adjustments"
                : "Adjust preview image or per-platform Full/Preview"}
            </button>
            {showPostPlanPreviewAdjust ? (
              <div
                className="mt-3 rounded-2xl border p-4 space-y-3"
                style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
              >
                <p className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wide">
                  Image per platform
                </p>
                {selectedDestinations.map((dest) => {
                  const version = mediaRouting[dest] ?? "full";
                  return (
                    <div
                      key={dest}
                      className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                      style={{ borderColor: "#2a2a2a", background: "#111" }}
                    >
                      <span className="text-[11px] text-[#d1d5db] truncate">
                        {DESTINATION_LABEL[dest]}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setMediaVersionForDestination(dest, "full")}
                          className="rounded-full px-3 py-1 text-[10px] font-semibold transition-colors"
                          style={{
                            background: version === "full" ? "#00aa6f" : "#1a1a1a",
                            color: version === "full" ? "#000" : "#9ca3af",
                          }}
                        >
                          Full
                        </button>
                        <button
                          type="button"
                          onClick={() => setMediaVersionForDestination(dest, "preview")}
                          className="rounded-full px-3 py-1 text-[10px] font-semibold transition-colors"
                          style={{
                            background: version === "preview" ? "#00aa6f" : "#1a1a1a",
                            color: version === "preview" ? "#000" : "#9ca3af",
                          }}
                        >
                          Preview
                        </button>
                      </div>
                    </div>
                  );
                })}
                {previewDestinations.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {previewizerAvailable ? (
                      <button
                        type="button"
                        disabled={previewizerDisabled}
                        onClick={openPreviewizer}
                        className="flex w-full items-center justify-center gap-2 rounded-full py-2 text-[11px] font-semibold transition-colors disabled:opacity-50"
                        style={{
                          background: "rgba(0,170,111,0.12)",
                          color: "#9bf0c4",
                          border: "1px solid rgba(0,170,111,0.35)",
                        }}
                      >
                        <Wand2 className="h-3.5 w-3.5" aria-hidden />
                        Open Previewizer
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowExistingPreviewPicker((prev) => !prev)}
                      className="text-[10px] font-semibold text-[#9bf0c4] underline-offset-2 hover:underline"
                    >
                      {showExistingPreviewPicker
                        ? "Hide existing previews"
                        : "Choose existing preview"}
                    </button>
                    {showExistingPreviewPicker ? (
                      <PreviewMediaPicker
                        creatorId={creatorId}
                        postMedia={postDetail?.media}
                        selectedMediaId={previewMediaId}
                        onSelect={setPreviewMediaId}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Send cards row */}
          <div className="flex flex-wrap gap-4 justify-center overflow-x-auto pb-1">
            {selectedDestinations.map((dest, i) => {
              const variant = variantsByDest.get(dest);
              const accent = DESTINATION_ACCENT[dest];
              const mediaVersion = resolveEffectiveMediaVersion(dest, {
                variantPlatformFields: variant?.platform_fields,
                assistantPlan: plan?.assistant_plan,
                mediaRouting,
              });
              const isPreviewVersion = mediaVersion === "preview";
              const cardImageUrl = resolveSendCardImageUrl({
                mediaVersion,
                mainPreviewUrl: previewUrl,
                creatorId,
                previewMediaId,
                planAssistantPlan: plan?.assistant_plan,
              });
              return (
                <motion.div
                  key={dest}
                  initial={{ opacity: 0, y: -90, rotate: -4, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 240,
                    damping: 20,
                    delay: 0.15 + i * 0.09,
                  }}
                  className="rounded-2xl overflow-hidden border flex flex-col shrink-0"
                  style={{
                    width: SEND_CARD_WIDTH_PX,
                    background: "rgba(12,12,12,0.95)",
                    borderColor: `${accent}33`,
                    boxShadow: `0 8px 28px ${accent}12`,
                  }}
                >
                  {/* Platform header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5"
                    style={{
                      background: `${accent}1c`,
                      borderBottom: `1px solid ${accent}2e`,
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: `${accent}26`, border: `1px solid ${accent}45` }}
                    >
                      {DESTINATION_ICON[dest]}
                    </div>
                    <span
                      className="text-[12px] font-bold truncate"
                      style={{ color: "#f9fafb" }}
                    >
                      {DESTINATION_LABEL[dest]}
                    </span>
                  </div>

                  {/* Media preview */}
                  <div
                    className="relative w-full overflow-hidden"
                    style={{ aspectRatio: "4/5" }}
                  >
                    {cardImageUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={cardImageUrl}
                          alt={`${DESTINATION_LABEL[dest]} preview`}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
                        <ImageIcon className="h-8 w-8 text-[#3a3a3a]" aria-hidden />
                      </div>
                    )}
                    {/* Format badge */}
                    <div
                      className="absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                      style={{
                        background: "rgba(0,0,0,0.6)",
                        border: `1px solid ${isPreviewVersion ? "rgba(0,170,111,0.45)" : "rgba(255,255,255,0.18)"}`,
                        color: isPreviewVersion ? "#9bf0c4" : "#e5e7eb",
                      }}
                    >
                      {isPreviewVersion ? "Preview" : "Full"}
                    </div>
                  </div>

                  {/* Post button + optional landing URL confirm */}
                  <div className="p-3 mt-auto space-y-2">
                    {variant ? (
                      <p className="text-[10px] text-[#9ca3af] line-clamp-2 mb-1">
                        {previewSnippet(variant)}
                      </p>
                    ) : null}
                    {(() => {
                      const st = destSendState[dest] ?? EMPTY_DEST_SEND;
                      const destLabel = DESTINATION_LABEL[dest];
                      const isPosted = st.fillStatus === "posted";
                      const isPolling = st.fillStatus === "handoff_started";
                      const isFilled =
                        st.fillStatus != null &&
                        st.fillStatus !== "posted" &&
                        st.fillStatus !== "handoff_started";

                      if (isPosted) {
                        return (
                          <>
                            <div
                              className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-bold"
                              style={{
                                background: "rgba(0,170,111,0.12)",
                                color: "#9bf0c4",
                                border: "1px solid rgba(0,170,111,0.3)",
                              }}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Posted
                            </div>
                            <button
                              type="button"
                              disabled={sendingDest === dest}
                              onClick={() => void postToDestination(dest)}
                              className="w-full rounded-full py-2 text-[11px] font-semibold border transition-colors disabled:opacity-60"
                              style={{
                                borderColor: "#2a2a2a",
                                color: "#9ca3af",
                                background: "transparent",
                              }}
                            >
                              {sendingDest === dest ? "Sending…" : "Resend"}
                            </button>
                          </>
                        );
                      }

                      if (isFilled) {
                        return (
                          <>
                            <p className="text-[10px] text-amber-300 text-center">
                              {st.fillStatus?.startsWith("fill_")
                                ? `Form filled — publish on ${destLabel}, then confirm`
                                : `Publish on ${destLabel}, then confirm (paste URL optional)`}
                            </p>
                            {!st.confirmExpanded ? (
                              <button
                                type="button"
                                disabled={st.confirmBusy}
                                onClick={() =>
                                  patchDestSend(dest, { confirmExpanded: true })
                                }
                                className="w-full flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-bold disabled:opacity-60"
                                style={{ background: "#00aa6f", color: "#000" }}
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden />
                                Confirm Posted
                              </button>
                            ) : (
                              <div className="space-y-2">
                                <input
                                  autoFocus
                                  value={st.confirmUrlDraft}
                                  onChange={(e) =>
                                    patchDestSend(dest, {
                                      confirmUrlDraft: e.target.value,
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      void confirmPosted(dest, st.confirmUrlDraft);
                                    }
                                    if (e.key === "Escape") {
                                      patchDestSend(dest, {
                                        confirmExpanded: false,
                                        confirmUrlDraft: "",
                                      });
                                    }
                                  }}
                                  placeholder={`Paste ${destLabel} URL (optional)`}
                                  className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-xs text-[#f9fafb] placeholder:text-[#6b7280]"
                                  style={{ borderColor: "#2a2a2a" }}
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={st.confirmBusy}
                                    onClick={() =>
                                      void confirmPosted(dest, st.confirmUrlDraft)
                                    }
                                    className="flex-1 rounded-full py-2 text-xs font-bold disabled:opacity-60"
                                    style={{ background: "#00aa6f", color: "#000" }}
                                  >
                                    {st.confirmBusy ? "Confirming…" : "Confirm"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={st.confirmBusy}
                                    onClick={() =>
                                      patchDestSend(dest, {
                                        confirmExpanded: false,
                                        confirmUrlDraft: "",
                                      })
                                    }
                                    className="rounded-full px-3 py-2 text-xs text-[#9ca3af] underline disabled:opacity-60"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      }

                      return (
                        <>
                          {isPolling ? (
                            <p className="text-[10px] text-[#6b7280] text-center">
                              Opening {destLabel}…
                            </p>
                          ) : null}
                          <button
                            type="button"
                            disabled={sendingDest === dest || isPolling}
                            onClick={() => void postToDestination(dest)}
                            className="w-full rounded-full py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
                            style={{ background: "#00aa6f", color: "#000" }}
                          >
                            {sendingDest === dest || isPolling
                              ? "Posting…"
                              : "Post"}
                          </button>
                        </>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => startEdit(dest)}
                      className="w-full rounded-full py-2 text-[11px] font-semibold border transition-colors"
                      style={{ borderColor: "#2a2a2a", color: "#9ca3af", background: "transparent" }}
                    >
                      Edit
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {sendError && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-red-300 text-center"
              role="alert"
            >
              {sendError}
            </motion.p>
          )}

          <div className="flex justify-center pt-2">
            <Link
              href="/studio"
              className="rounded-full px-8 py-2.5 text-sm font-semibold border transition-colors hover:border-[#3a3a3a]"
              style={{ borderColor: "#2a2a2a", color: "#9ca3af", background: "transparent" }}
            >
              Back to Studio
            </Link>
          </div>
        </motion.div>
      ) : null}

      {previewizerAvailable && previewizerSession ? (
        <PreviewizerOverlay
          open={previewizerOpen}
          session={previewizerSession}
          onComplete={handlePreviewizerComplete}
          onCancel={() => setPreviewizerOpen(false)}
          onUploadPreview={uploadPreviewizerBlob}
        />
      ) : null}

      <RelayCoachModal
        open={coachModalOpen}
        value={assistantContext}
        onChange={onAssistantContextChange}
        studioGoals={studioGoals}
        onConfirm={confirmCoachModal}
        onCancel={cancelCoachModal}
      />
    </div>
  );
}
