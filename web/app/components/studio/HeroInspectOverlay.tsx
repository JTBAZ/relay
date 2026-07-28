"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Layers, X } from "lucide-react";
import {
  fetchPerformanceWorkBundle,
  fetchPerformanceWorkInstances,
  galleryItemImageGridSrc,
  RELAY_API_BASE,
  requestPlatformInstanceRefresh,
  type GalleryItem,
  type PerformanceWorkBundleData,
  type PerformanceWorkInstancesData,
  type TierFacet
} from "@/lib/relay-api";
import {
  buildHeroInspectModel,
  HERO_DEFAULT_RANGE,
  HERO_EMPTY_COPY,
  heroKeyToken,
  type HeroInspectKey,
  type HeroInspectModel,
  type HeroMediaThumb
} from "@/lib/hero-inspect-data";
import type { HeroWorkspaceMode } from "@/lib/audience-promotion-contracts";
import { HeroGapRow, HeroPresentRow } from "@/app/components/studio/HeroPlatformRow";
import HeroActionBar from "@/app/components/studio/HeroActionBar";
import HeroRelayPanels from "@/app/components/studio/HeroRelayPanels";
import AudiencePromotionPanel from "@/app/components/studio/AudiencePromotionPanel";
import {
  sendRelayExternalMetricsRefreshToExtension,
  type CrossPostDestination
} from "@/lib/relay-extension-messaging";

const HERO_W = 260;
const HERO_H = 340;
const AMBER = "#F59E0B";

function asCrossPostDestination(destination: string): CrossPostDestination | null {
  if (destination === "patreon" || destination === "x" || destination === "deviantart") {
    return destination;
  }
  return null;
}

function thumbUrl(item: GalleryItem | null): string | null {
  if (!item) return null;
  const path = galleryItemImageGridSrc(item);
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${RELAY_API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function galleryItemsToHeroMediaStrip(items: GalleryItem[]): HeroMediaThumb[] {
  const out: HeroMediaThumb[] = [];
  for (const item of items) {
    const src = thumbUrl(item);
    if (!src) continue;
    out.push({
      media_id: item.media_id,
      thumb_src: src,
      caption: item.title ?? null
    });
  }
  return out;
}

type Props = {
  open: boolean;
  heroKey: HeroInspectKey;
  preview: GalleryItem | null;
  mediaStrip?: HeroMediaThumb[];
  /** All gallery rows for the open post (Audience & Promotion). */
  postItems?: GalleryItem[];
  creatorId?: string;
  tiers?: TierFacet[];
  studioWriteBlocked?: boolean;
  onRefresh?: () => Promise<void>;
  onClose: () => void;
  onGapFill: (destination: string, sourcePostId: string) => void;
  onOpenDistribute?: () => void;
  onDeletePost?: (() => void) | null;
  deleteBusy?: boolean;
  deleteBlockedReason?: string | null;
};

export default function HeroInspectOverlay({
  open,
  heroKey,
  preview,
  mediaStrip = [],
  postItems = [],
  creatorId = "",
  tiers = [],
  studioWriteBlocked = false,
  onRefresh,
  onClose,
  onGapFill,
  onOpenDistribute,
  onDeletePost = null,
  deleteBusy = false,
  deleteBlockedReason = null
}: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<HeroInspectModel | null>(null);
  const [viewMode, setViewMode] = useState<"per-platform" | "relay">("per-platform");
  const [workspaceMode, setWorkspaceMode] = useState<HeroWorkspaceMode>("overview");
  const [activeMedia, setActiveMedia] = useState(0);
  const [refreshBusyId, setRefreshBusyId] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const generationRef = useRef(0);
  const keyToken = heroKeyToken(heroKey);

  const strip = useMemo(
    () => (mediaStrip.length > 1 ? mediaStrip : []),
    [mediaStrip]
  );
  const isMultiMedia = strip.length > 1;
  const audiencePromotionActive = workspaceMode === "audience_promotion";

  const selectedItem = useMemo(() => {
    if (isMultiMedia && strip[activeMedia]) {
      const mediaId = strip[activeMedia]!.media_id;
      return postItems.find((item) => item.media_id === mediaId) ?? preview;
    }
    return preview;
  }, [isMultiMedia, strip, activeMedia, postItems, preview]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActiveMedia(0);
    setViewMode("per-platform");
    setWorkspaceMode("overview");
  }, [keyToken]);

  const load = useCallback(async () => {
    const gen = ++generationRef.current;
    const hints = {
      title: preview?.title ?? null,
      thumb_src: thumbUrl(preview),
      member_label: preview?.member_label ?? null,
      variant_role: preview?.variant_role ?? null
    };

    if (!heroKey.creative_work_id?.trim()) {
      setModel(
        buildHeroInspectModel({
          key: heroKey,
          bundle: null,
          instances: null,
          instancesOk: false,
          hints
        })
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setRefreshMessage(null);

    let bundle: PerformanceWorkBundleData | null = null;
    let instances: PerformanceWorkInstancesData | null = null;
    let instancesOk = false;
    let error = false;

    try {
      const [bundleResult, instancesResult] = await Promise.allSettled([
        fetchPerformanceWorkBundle(heroKey.creative_work_id, {
          range: heroKey.range ?? HERO_DEFAULT_RANGE,
          group_by: "variant_role"
        }),
        fetchPerformanceWorkInstances(heroKey.creative_work_id)
      ]);
      if (generationRef.current !== gen) return;

      if (bundleResult.status === "fulfilled") {
        bundle = bundleResult.value;
      } else {
        error = true;
      }
      if (instancesResult.status === "fulfilled") {
        instances = instancesResult.value;
        instancesOk = true;
      }
    } catch {
      error = true;
    }

    if (generationRef.current !== gen) return;

    setModel(
      buildHeroInspectModel({
        key: heroKey,
        bundle,
        instances,
        instancesOk,
        hints,
        error: error && !bundle
      })
    );
    setLoading(false);
  }, [heroKey, preview]);

  useEffect(() => {
    if (!open) return;
    void load();
    return () => {
      generationRef.current += 1;
    };
  }, [open, keyToken, load]);

  const handleRefresh = useCallback(
    async (platformInstanceId: string) => {
      setRefreshBusyId(platformInstanceId);
      setRefreshMessage(null);
      try {
        const result = await requestPlatformInstanceRefresh(platformInstanceId);
        if (result.status === "completed") {
          setRefreshMessage(result.message ?? "Refresh completed.");
          await load();
          return;
        }
        if (result.status === "cooldown") {
          const seconds = result.cooldown?.retry_after_seconds ?? 0;
          setRefreshMessage(`Refresh on cooldown — try again in ${seconds}s.`);
          return;
        }
        if (result.status === "handoff_required" && result.handoff) {
          const destination = asCrossPostDestination(result.handoff.destination);
          if (!destination) {
            setRefreshMessage("Extension handoff is not available for this destination yet.");
            return;
          }
          const handoff = await sendRelayExternalMetricsRefreshToExtension({
            postId: result.handoff.post_id,
            attemptId: result.handoff.attempt_id,
            platformInstanceId: result.handoff.platform_instance_id,
            destination,
            externalUrl: result.handoff.external_url
          });
          if (handoff.ok) {
            setRefreshMessage("Extension refresh started — reload shortly to see updated stats.");
            await load();
          } else {
            setRefreshMessage(handoff.detail ?? "Extension refresh could not start.");
          }
          return;
        }
        setRefreshMessage(result.message ?? `Refresh status: ${result.status}.`);
      } catch (e) {
        setRefreshMessage(e instanceof Error ? e.message : String(e));
      } finally {
        setRefreshBusyId(null);
      }
    },
    [load]
  );

  if (!open || !mounted) return null;

  const emptyCopy =
    model?.empty_reason != null ? HERO_EMPTY_COPY[model.empty_reason] : null;
  const showRelayToggle = Boolean(model?.instances_ok && model.relay);
  const advancedHref = heroKey.creative_work_id
    ? `/studio/analytics/works/${encodeURIComponent(heroKey.creative_work_id)}?range=${heroKey.range ?? HERO_DEFAULT_RANGE}`
    : null;

  const heroThumb =
    isMultiMedia && strip[activeMedia]
      ? strip[activeMedia]!.thumb_src
      : model?.thumb_src ?? thumbUrl(preview);
  const roleBadge = model?.variant_role ?? preview?.variant_role ?? "standalone";
  const subtitle = isMultiMedia
    ? strip[activeMedia]?.caption ?? model?.member_label
    : model?.member_label ?? model?.variant_role ?? "Selected post";

  const overlay = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden p-4 sm:p-6"
      style={{ background: "rgba(5,7,6,0.88)", backdropFilter: "blur(3px)" }}
      role="dialog"
      aria-modal
      aria-label={
        audiencePromotionActive
          ? model?.title
            ? `Audience & Promotion: ${model.title}`
            : "Audience & Promotion"
          : model?.title
            ? `Packaging: ${model.title}`
            : "Packaging inspect"
      }
      data-hero-workspace-mode={workspaceMode}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute right-4 top-4 z-50 flex items-center justify-center rounded-full border transition-all duration-150 sm:right-6 sm:top-6"
        style={{
          width: 36,
          height: 36,
          background: "#0e0e0e",
          borderColor: "#2a2a2a",
          color: "#666"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.borderColor = "#444";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#666";
          e.currentTarget.style.borderColor = "#2a2a2a";
        }}
      >
        <X size={15} />
      </button>

      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 8 }}
        transition={{ duration: 0.26, ease: [0.34, 1.06, 0.64, 1] }}
        className="relative flex max-h-full max-w-full flex-wrap items-start justify-center gap-3 overflow-visible sm:flex-nowrap sm:gap-4"
        style={{ overflow: "visible" }}
        onClick={(e) => e.stopPropagation()}
      >
        <HeroActionBar
          currentRole={roleBadge}
          workspaceMode={workspaceMode}
          onToggleAudiencePromotion={() => {
            setWorkspaceMode((prev) =>
              prev === "audience_promotion" ? "overview" : "audience_promotion"
            );
          }}
          onClose={onClose}
          onOpenAdvanced={
            advancedHref
              ? () => {
                  router.push(advancedHref);
                }
              : null
          }
          onOpenDistribute={() => {
            if (onOpenDistribute) {
              onOpenDistribute();
              return;
            }
            const source = model?.gap_source_post_id ?? heroKey.post_id;
            const dest = model?.gaps[0];
            if (dest) onGapFill(dest, source);
            else onGapFill("x", source);
          }}
          onDeletePost={onDeletePost}
          deleteBusy={deleteBusy}
          deleteBlockedReason={deleteBlockedReason}
        />

        {/* Hero card column */}
        <div className="flex flex-shrink-0 flex-col gap-2" style={{ width: HERO_W }}>
          <div
            className="relative overflow-hidden rounded-2xl border"
            style={{
              width: HERO_W,
              height: HERO_H,
              borderColor: isMultiMedia ? `${AMBER}33` : "#2a2a2a",
              background: "#0a0a0a"
            }}
          >
            <AnimatePresence mode="sync">
              {heroThumb ? (
                <motion.img
                  key={heroThumb + activeMedia}
                  src={heroThumb}
                  alt={model?.title ?? "Post"}
                  className="absolute inset-0 h-full w-full object-cover"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.95 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center text-[11px]"
                  style={{ color: "#555" }}
                >
                  No art
                </div>
              )}
            </AnimatePresence>
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(to top, rgba(5,7,6,0.92) 0%, transparent 45%)"
              }}
            />
            {isMultiMedia ? (
              <div
                className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md px-2 py-1"
                style={{ background: `${AMBER}18`, border: `1px solid ${AMBER}44` }}
              >
                <Layers size={10} color={AMBER} />
                <span className="text-[9px] font-semibold" style={{ color: AMBER }}>
                  {activeMedia + 1} / {strip.length}
                </span>
              </div>
            ) : null}
            <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span
                  className="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
                  style={{
                    background: "rgba(155,240,196,0.12)",
                    borderColor: "rgba(155,240,196,0.3)",
                    color: "#9bf0c4"
                  }}
                >
                  {roleBadge}
                </span>
              </div>
              <p
                className="mb-0.5 text-[13px] font-semibold leading-snug text-white"
                style={{ fontFamily: "var(--font-display), Georgia, serif" }}
              >
                {model?.title ?? preview?.title ?? "Post"}
              </p>
              <p
                className="text-[11px]"
                style={{ color: isMultiMedia ? `${AMBER}99` : "#888" }}
              >
                {subtitle || "Selected post"}
              </p>
            </div>
          </div>

          {isMultiMedia ? (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              {strip.map((m, i) => (
                <button
                  key={m.media_id}
                  type="button"
                  onClick={() => setActiveMedia(i)}
                  className="relative flex-shrink-0 overflow-hidden rounded-lg border transition-all duration-150"
                  style={{
                    width: 44,
                    height: 44,
                    borderColor: i === activeMedia ? AMBER : "#1e1e1e",
                    boxShadow: i === activeMedia ? `0 0 0 1px ${AMBER}44` : "none"
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.thumb_src}
                    alt={m.caption ?? `Asset ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <div
                    className="absolute inset-0 flex items-end justify-center pb-0.5"
                    style={{
                      background: "linear-gradient(to top, rgba(5,7,6,0.7) 0%, transparent 60%)"
                    }}
                  >
                    <span
                      className="text-[8px] font-semibold"
                      style={{ color: i === activeMedia ? AMBER : "#888" }}
                    >
                      {i + 1}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Right zone — Packaging uses minHeight; A&P is height-capped to media card (HERO_H). */}
        <div
          className={
            audiencePromotionActive
              ? "flex min-h-0 w-[320px] flex-shrink-0 flex-col overflow-hidden"
              : "flex w-[320px] flex-shrink-0 flex-col gap-3"
          }
          style={
            audiencePromotionActive
              ? {
                  width: 320,
                  height: HERO_H,
                  maxHeight: `min(${HERO_H}px, calc(100dvh - 5.5rem))`
                }
              : { width: 320, minHeight: HERO_H }
          }
          data-hero-right-rail={audiencePromotionActive ? "audience_promotion" : "overview"}
        >
          {audiencePromotionActive ? (
            <AudiencePromotionPanel
              creatorId={creatorId}
              postId={heroKey.post_id}
              postItems={postItems}
              selectedItem={selectedItem}
              tiers={tiers}
              studioWriteBlocked={studioWriteBlocked}
              onRefresh={onRefresh ?? (async () => undefined)}
            />
          ) : (
            <>
              {showRelayToggle ? (
                <div
                  className="flex items-center gap-0 self-start rounded-lg border p-0.5"
                  style={{ background: "#0a0a0a", borderColor: "#1f1f1f" }}
                >
                  {(["per-platform", "relay"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className="rounded-md px-3 py-1.5 text-[11px] font-medium transition-all duration-200"
                      style={{
                        background:
                          viewMode === mode ? "rgba(155,240,196,0.1)" : "transparent",
                        color: viewMode === mode ? "#9bf0c4" : "#555",
                        border:
                          viewMode === mode
                            ? "1px solid rgba(155,240,196,0.25)"
                            : "1px solid transparent"
                      }}
                    >
                      {mode === "per-platform" ? "Per-platform" : "Relay View"}
                    </button>
                  ))}
                </div>
              ) : null}

              {refreshMessage ? (
                <p
                  className="rounded-lg border px-2.5 py-1.5 text-[10px] leading-snug"
                  style={{ background: "#0a0a0a", borderColor: "#2a2a2a", color: "#c4b5a0" }}
                  role="status"
                >
                  {refreshMessage}
                </p>
              ) : null}

              {loading && !model ? (
                <p className="text-[12px]" style={{ color: "#555" }}>
                  Loading packaging…
                </p>
              ) : null}

              {emptyCopy ? (
                <div
                  className="rounded-xl border border-dashed px-4 py-8 text-center"
                  style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
                >
                  <p className="text-[13px] font-medium text-white">{emptyCopy}</p>
                  <p className="mt-1 text-[11px]" style={{ color: "#555" }}>
                    Stats stay empty until this post has a packaging work.
                  </p>
                </div>
              ) : null}

              <AnimatePresence mode="wait">
                {!emptyCopy && viewMode === "relay" && model?.relay ? (
                  <HeroRelayPanels key="relay" relay={model.relay} />
                ) : null}

                {!emptyCopy && viewMode === "per-platform" ? (
                  <motion.div
                    key="rows"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="flex flex-col gap-2"
                  >
                    {model?.rows.map((row, idx) => (
                      <HeroPresentRow
                        key={`present-${row.destination}`}
                        row={row}
                        delay={idx * 0.06}
                        onOpen={(url) => window.open(url, "_blank", "noopener,noreferrer")}
                        onRefresh={(id) => void handleRefresh(id)}
                        refreshBusy={refreshBusyId === row.platform_instance_id}
                      />
                    ))}
                    {model?.gaps.map((dest, idx) => (
                      <HeroGapRow
                        key={`gap-${dest}`}
                        destination={dest}
                        delay={((model.rows.length ?? 0) + idx) * 0.06}
                        onFill={(d) => {
                          const source = model.gap_source_post_id ?? heroKey.post_id;
                          onGapFill(d, source);
                        }}
                      />
                    ))}
                    {model && model.rows.length === 0 && model.gaps.length === 0 ? (
                      <p className="text-[12px]" style={{ color: "#555" }}>
                        No platform rows for this post yet.
                      </p>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(overlay, document.body);
}
