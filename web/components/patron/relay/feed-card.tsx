"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent
} from "react";
import {
  Heart,
  MessageCircle,
  FileText,
  ImageIcon,
  Music,
  Video,
  UserPlus,
  Check,
  Star,
  Crosshair,
  X,
} from "lucide-react";
import SnipIcon from "@/app/components/icons/SnipIcon";
import type { FeedPost, PositionalComment } from "@/lib/relay-fixtures";
import {
  isPatronFeedVideoPost,
  patronFeedPlaybackSrc,
  patronFeedPosterSrc
} from "@/lib/patron-feed-media";
import { GalleryMediaStack } from "./gallery-media-stack";
import { MediaEdgeRail } from "./media-edge-rail";
import { PatronFeedVideo } from "./patron-feed-playback";
import { listPostComments, type PatronCommentRecord } from "@/lib/relay-api";
import { formatFeedPublishedDate } from "@/lib/format-feed-published-date";
import { SnipToCollectionDialog, type SnipTarget } from "./snip-to-collection-dialog";
import { emitRelayInteractionTelemetryEvent } from "@/lib/relay-interaction-telemetry";

const MEDIA_ICONS = {
  writing: FileText,
  photo: ImageIcon,
  audio: Music,
  video: Video,
} as const;

const HYBRID_MEDIA_BAR_EXPERIMENT_POST_ID = "pilot_post_ava_multi_gallery";

type HybridMediaBarProps = {
  count: number;
  activeIndex: number;
  favorited: boolean;
  snipDisabled: boolean;
  onSelect: (index: number) => void;
  onFavorite: () => void;
  onComment: () => void;
  onSnip: () => void;
  onCommentPreviewEnter: () => void;
  onCommentPreviewLeave: () => void;
  onOpenChange?: (open: boolean) => void;
};

function HybridMediaActionBar({
  count,
  activeIndex,
  favorited,
  snipDisabled,
  onSelect,
  onFavorite,
  onComment,
  onSnip,
  onCommentPreviewEnter,
  onCommentPreviewLeave,
  onOpenChange
}: HybridMediaBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionMenuOpenForIndex, setActionMenuOpenForIndex] = useState<number | null>(null);
  const [radialMenuAnimated, setRadialMenuAnimated] = useState(false);
  const [hoveredDot, setHoveredDot] = useState<number | null>(null);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeCount = Math.max(1, count);
  const actionMenuOpen = actionMenuOpenForIndex !== null;
  const dotIndexWithMenu =
    actionMenuOpenForIndex !== null ? Math.min(actionMenuOpenForIndex, safeCount - 1) : null;

  const radialPositions = [
    { x: -34, y: -38 },
    { x: 0, y: -48 },
    { x: 34, y: -38 }
  ];

  const dotHit = 20;
  const dotRingRest = 9;
  const dotRingHover = 13;
  const dotRingSelected = 18;
  const dotGlowRest = 11;
  const dotGlowHover = 16;
  const dotGlowSelected = 20;
  const innerDot = 3;
  const closeSize = 19;
  const actionSize = 28;
  const actionIcon = 12;
  const trackHeightCollapsed = 40;
  const trackHeightExpanded = 52;
  const trackWidthCollapsed = 58;
  const trackWidthExpanded = 210;
  const trackHeight = expanded || actionMenuOpen ? trackHeightExpanded : trackHeightCollapsed;

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current != null) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const open = useCallback(() => {
    clearCollapseTimer();
    setExpanded(true);
  }, [clearCollapseTimer]);

  const scheduleCollapse = useCallback(() => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(() => {
      setExpanded(false);
      setActionMenuOpenForIndex(null);
      setHoveredDot(null);
      collapseTimerRef.current = null;
    }, 160);
  }, [clearCollapseTimer]);

  useEffect(() => () => clearCollapseTimer(), [clearCollapseTimer]);

  useEffect(() => {
    onOpenChange?.(expanded || actionMenuOpen);
  }, [expanded, actionMenuOpen, onOpenChange]);

  useEffect(
    () => () => {
      onOpenChange?.(false);
    },
    [onOpenChange]
  );

  useEffect(() => {
    if (dotIndexWithMenu !== null && dotIndexWithMenu !== actionMenuOpenForIndex) {
      setActionMenuOpenForIndex(dotIndexWithMenu);
    }
  }, [actionMenuOpenForIndex, dotIndexWithMenu]);

  useEffect(() => {
    if (actionMenuOpenForIndex === null) {
      setRadialMenuAnimated(false);
      return;
    }

    setRadialMenuAnimated(false);
    const frame = window.requestAnimationFrame(() => setRadialMenuAnimated(true));
    return () => window.cancelAnimationFrame(frame);
  }, [actionMenuOpenForIndex]);

  const stop = (e: MouseEvent) => e.stopPropagation();

  const radialActions = [
    {
      key: "favorite",
      label: favorited ? "Unfavorite" : "Favorite",
      Icon: Heart,
      disabled: false,
      active: favorited,
      onSelect: onFavorite
    },
    {
      key: "snip",
      label: "Snip",
      Icon: SnipIcon,
      disabled: snipDisabled,
      active: false,
      onSelect: onSnip
    },
    {
      key: "comment",
      label: "Comment",
      Icon: MessageCircle,
      disabled: false,
      active: false,
      onSelect: onComment,
      onEnter: onCommentPreviewEnter,
      onLeave: onCommentPreviewLeave
    }
  ] as const;

  const mediaPositionLabelIndex =
    hoveredDot !== null ? hoveredDot : Math.min(Math.max(0, activeIndex), safeCount - 1);

  return (
    <div
      ref={rootRef}
      className="relative z-50 flex shrink-0 justify-center overflow-visible border-t border-[#1A1A1A] bg-[#0E0E0E]/95 py-1.5"
      onClick={stop}
      onMouseEnter={open}
      onMouseLeave={scheduleCollapse}
      onFocusCapture={open}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        scheduleCollapse();
      }}
    >
      <div
        className="relative z-50 overflow-visible transition-[width,height] duration-500 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]"
        style={{
          width: expanded || actionMenuOpen ? `${trackWidthExpanded}px` : `${trackWidthCollapsed}px`,
          height: trackHeight
        }}
        aria-label={`Open media actions (${safeCount} assets)`}
      >
        <button
          type="button"
          aria-label="Snip"
          tabIndex={-1}
          disabled={snipDisabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!snipDisabled) onSnip();
          }}
          className="sr-only"
        />
        <div
          className={[
            "absolute inset-0 border backdrop-blur-sm transition-all duration-300",
            expanded || actionMenuOpen ? "rounded-[26px]" : "rounded-full"
          ].join(" ")}
          style={{
            backgroundColor: actionMenuOpen
              ? "rgba(16,16,16,0.98)"
              : expanded
                ? "rgba(14,14,14,0.96)"
                : "rgba(12,12,12,0.86)",
            borderColor: actionMenuOpen
              ? "rgba(64,145,108,0.46)"
              : expanded
                ? "rgba(255,255,255,0.18)"
                : "rgba(255,255,255,0.12)",
            boxShadow: actionMenuOpen
              ? "0 0 0 1px rgba(64,145,108,0.16), 0 0 22px rgba(27,155,110,0.12), inset 0 0 18px rgba(255,255,255,0.03)"
              : expanded
                ? "0 0 0 1px rgba(255,255,255,0.05), 0 12px 26px rgba(0,0,0,0.28)"
                : "0 0 0 1px rgba(255,255,255,0.04), 0 8px 18px rgba(0,0,0,0.28)"
          }}
        />

        {!expanded && !actionMenuOpen ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-300">
            <span className="relative flex items-center justify-center gap-1.5" aria-hidden="true">
              {[0, 1, 2].map((idx) => (
                <span
                  key={`hybrid-media-ring-badge-${idx}`}
                  className="block h-[7px] w-[7px] shrink-0 rounded-full border-2 border-[#1B9B6E]/75 bg-transparent shadow-[0_0_7px_rgba(27,155,110,0.22)]"
                />
              ))}
            </span>
          </div>
        ) : null}

        <div
          className={[
            "absolute inset-0 flex flex-col items-center justify-center overflow-visible px-6 py-2 transition-all duration-300",
            expanded || actionMenuOpen ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95"
          ].join(" ")}
          aria-hidden={!expanded && !actionMenuOpen}
        >
          <span
            className={[
              "pointer-events-none mb-1 whitespace-nowrap text-center text-[10px] font-medium tracking-wide text-[#888888] transition-all duration-200",
              actionMenuOpen ? "-translate-y-0.5 opacity-0" : "translate-y-0 opacity-100"
            ].join(" ")}
            aria-live="polite"
          >
            {mediaPositionLabelIndex + 1} of {safeCount}
          </span>
          <div className="relative flex h-6 w-full items-center justify-between">
            {Array.from({ length: safeCount }).map((_, idx) => {
              const isCurrent = idx === activeIndex;
              const isHovered = hoveredDot === idx;
              const isSelected = dotIndexWithMenu === idx;
              const isOtherDotSelected = actionMenuOpen && !isSelected;
              return (
                <div
                  key={`hybrid-media-dot-${idx}`}
                  className="relative flex items-center justify-center transition-all duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]"
                  style={{
                    width: dotHit,
                    height: dotHit,
                    opacity: isOtherDotSelected ? 0.3 : 1
                  }}
                >
                  <button
                    type="button"
                    onMouseEnter={() => {
                      if (!actionMenuOpen) {
                        setHoveredDot(idx);
                        onSelect(idx);
                      }
                    }}
                    onMouseLeave={() => {
                      if (!actionMenuOpen) setHoveredDot(null);
                    }}
                    onFocus={() => {
                      if (!actionMenuOpen) {
                        setHoveredDot(idx);
                        onSelect(idx);
                      }
                    }}
                    onBlur={() => {
                      if (!actionMenuOpen) setHoveredDot(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSelected) {
                        setActionMenuOpenForIndex(null);
                        return;
                      }
                      onSelect(idx);
                      setActionMenuOpenForIndex(idx);
                    }}
                    className="relative flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1B9B6E]/80"
                    style={{ width: dotHit, height: dotHit }}
                    aria-label={isSelected ? `Close media ${idx + 1} actions` : `Open media ${idx + 1} actions`}
                    aria-current={isCurrent ? "true" : undefined}
                    aria-expanded={isSelected || undefined}
                    tabIndex={expanded || actionMenuOpen ? 0 : -1}
                  >
                    <span
                      className="absolute rounded-full transition-all duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        width: isSelected ? dotGlowSelected : isHovered ? dotGlowHover : dotGlowRest,
                        height: isSelected ? dotGlowSelected : isHovered ? dotGlowHover : dotGlowRest,
                        opacity: isSelected || isHovered ? 0.6 : 0,
                        background: "radial-gradient(circle, rgba(27,155,110,0.25) 0%, transparent 70%)"
                      }}
                    />
                    <span
                      className="absolute rounded-full transition-all duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        width: isSelected ? dotRingSelected : isHovered ? dotRingHover : dotRingRest,
                        height: isSelected ? dotRingSelected : isHovered ? dotRingHover : dotRingRest,
                        borderWidth: 2,
                        borderStyle: "solid",
                        borderColor: isSelected || isHovered ? "#1B9B6E" : "rgba(255,255,255,0.22)",
                        backgroundColor: isSelected ? "#101010" : "transparent",
                        boxShadow: isSelected
                          ? "0 0 12px rgba(27,155,110,0.3)"
                          : isHovered
                            ? "0 0 8px rgba(27,155,110,0.28)"
                            : "none"
                      }}
                    />
                    <span
                      className={[
                        "absolute rounded-full bg-[#1B9B6E] transition-all duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
                        !isSelected && isHovered ? "scale-100 opacity-100" : "scale-50 opacity-0"
                      ].join(" ")}
                      style={{ width: innerDot, height: innerDot }}
                      aria-hidden="true"
                    />
                    {isSelected ? (
                      <span
                        className="absolute z-[31] flex items-center justify-center rounded-full text-[#1B9B6E] transition-all duration-200"
                        style={{ width: closeSize, height: closeSize }}
                        aria-hidden="true"
                      >
                        <X style={{ width: actionIcon, height: actionIcon }} />
                      </span>
                    ) : null}
                  </button>

                  {isSelected ? (
                    <div
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[90] transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        opacity: radialMenuAnimated ? 1 : 0,
                        transform: radialMenuAnimated ? "scale(1)" : "scale(0.72)"
                      }}
                      aria-hidden={!isSelected}
                    >
                      <div
                        className="pointer-events-none absolute left-0 top-0 h-[126px] w-[126px] -translate-x-1/2 -translate-y-[104px] rounded-full transition-all duration-300"
                        style={{
                          opacity: radialMenuAnimated ? 1 : 0,
                          background:
                            "radial-gradient(circle at center bottom, rgba(27,155,110,0.14) 0%, rgba(27,155,110,0.05) 42%, transparent 72%)"
                        }}
                      />
                      <svg
                        className="pointer-events-none absolute left-0 top-0 overflow-visible"
                        width="1"
                        height="1"
                        aria-hidden="true"
                      >
                        {radialActions.map((action, actionIdx) => {
                          const pos = radialPositions[actionIdx] ?? radialPositions[1];
                          return (
                            <line
                              key={`hybrid-radial-line-${action.key}`}
                              x1={0}
                              y1={0}
                              x2={pos.x}
                              y2={pos.y}
                              stroke="#1B9B6E"
                              strokeWidth={2}
                              strokeLinecap="round"
                              opacity={hoveredAction === action.key ? 0.95 : 0.34}
                              style={{
                                strokeDasharray: 120,
                                strokeDashoffset: radialMenuAnimated ? 0 : 120,
                                transition: `stroke-dashoffset 280ms ${actionIdx * 45}ms ease-out, opacity 160ms ease-out`
                              }}
                            />
                          );
                        })}
                      </svg>
                      {radialActions.map((action, actionIdx) => {
                        const Icon = action.Icon;
                        const pos = radialPositions[actionIdx] ?? radialPositions[1];
                        const labelVisible = hoveredAction === action.key;
                        return (
                          <div
                            key={action.key}
                            className="absolute left-0 top-0 transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]"
                            style={{
                              opacity: radialMenuAnimated ? 1 : 0,
                              transform: radialMenuAnimated
                                ? `translate(${pos.x}px, ${pos.y}px) scale(1)`
                                : "translate(0px, 0px) scale(0.22)",
                              transitionDelay: radialMenuAnimated ? `${actionIdx * 50}ms` : "0ms"
                            }}
                          >
                            <span
                              className={[
                                "pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black shadow-lg transition-all duration-150",
                                labelVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-1 scale-95 opacity-0"
                              ].join(" ")}
                            >
                              {action.label}
                              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
                            </span>
                            <button
                              type="button"
                              disabled={action.disabled}
                              aria-label={action.label}
                              tabIndex={isSelected ? 0 : -1}
                              onMouseEnter={() => {
                                setHoveredAction(action.key);
                                if ("onEnter" in action) action.onEnter();
                              }}
                              onMouseLeave={() => {
                                setHoveredAction(null);
                                if ("onLeave" in action) action.onLeave();
                              }}
                              onFocus={() => {
                                setHoveredAction(action.key);
                                if ("onEnter" in action) action.onEnter();
                              }}
                              onBlur={() => {
                                setHoveredAction(null);
                                if ("onLeave" in action) action.onLeave();
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (action.disabled) return;
                                action.onSelect();
                                if ("onLeave" in action) action.onLeave();
                                setHoveredAction(null);
                                setActionMenuOpenForIndex(null);
                              }}
                              className={[
                                "relative z-[91] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#1B9B6E]/55 bg-[#101010] text-[#1B9B6E] shadow-[0_3px_14px_rgba(0,0,0,0.38)] transition-all duration-200 hover:scale-110 hover:border-[#1B9B6E] hover:text-[#2BC48A] hover:shadow-[0_0_18px_rgba(27,155,110,0.42)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1B9B6E]/80 disabled:cursor-not-allowed disabled:opacity-45",
                                action.active ? "border-[#1B9B6E] text-[#2BC48A]" : ""
                              ].join(" ")}
                              style={{ width: actionSize, height: actionSize }}
                            >
                              <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1B9B6E] opacity-80 shadow-[0_0_9px_rgba(27,155,110,0.55)]" />
                              <Icon className="relative z-[1]" style={{ width: actionIcon, height: actionIcon }} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function humanizeTimestamp(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function toPinnedPositionalComment(record: PatronCommentRecord): PositionalComment | null {
  if (record.anchorX === null || record.anchorY === null || !record.mediaId) {
    return null;
  }
  const visibleTags = record.tagIds.filter((t) => !record.tagsRevokedByOwner.includes(t));
  return {
    id: record.id,
    author: {
      id: record.patronUserId,
      displayName: `Patron · ${record.patronUserId.slice(-6)}`,
      handle: record.patronUserId,
      avatarUrl: "/placeholder.svg?height=32&width=32"
    },
    text: record.body,
    position: { x: record.anchorX, y: record.anchorY },
    createdAt: humanizeTimestamp(record.createdAt),
    tags: visibleTags.length > 0 ? visibleTags : undefined
  };
}

function normalizeTierLabel(label: string): string {
  return label.trim().toLowerCase();
}

/** Post access chip from `post.tierLabel` (catalog / PostVersion.tierIds). */
function postAccessChipLabel(post: FeedPost): string {
  const raw = post.tierLabel?.trim();
  return raw || "Free";
}

function postAccessChipClassName(label: string): string {
  if (normalizeTierLabel(label) === "free") {
    return "inline-flex items-center gap-1.5 rounded-full border border-[#1B4332]/50 bg-[#0D1F17] px-1.5 py-0.5 text-[10px] font-medium text-[#2D6A4F] shrink-0";
  }
  return "inline-flex items-center gap-1.5 rounded-full border border-[#1B4332]/70 bg-[#0D1F17] px-1.5 py-0.5 text-[10px] font-medium text-[#40916C] shrink-0";
}

interface FeedCardProps {
  post: FeedPost;
  onClick?: () => void;
  /** Direct action hook for feed-level "Comment" controls. */
  onCommentClick?: (args: {
    creatorId: string;
    postId: string;
    mediaId?: string;
  }) => void;
  /** Direct action hook for feed-level "Snip" controls. */
  onSnipClick?: (args: {
    creatorId: string;
    postId: string;
    mediaId?: string;
  }) => void;
  /**
   * PE-E (BO-P2-04) — when set, the comment-count badge is refreshed from the live API on
   * mount + every time `refreshSignal` changes (typically the parent bumps it after the
   * post-detail modal closes). When null/undefined, today's static `post.commentCount`
   * fixture value is shown unchanged.
   */
  liveCommentCountScope?: {
    relayCreatorId: string;
    postId: string;
    /** Bump to force a refetch (e.g. when the gallery modal closes after a submit/delete). */
    refreshSignal?: number;
  } | null;
}

/** Matches gallery pin-preview: comment chrome → image surface, with timed hide */
type PinPreviewPhase = "hidden" | "chrome" | "image";

export function FeedCard({
  post,
  onClick,
  onCommentClick,
  onSnipClick,
  liveCommentCountScope = null
}: FeedCardProps) {
  const [liked, setLiked] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [inlineFavorite, setInlineFavorite] = useState(false);
  const [radialMenuOpen, setRadialMenuOpen] = useState(false);
  const [liveCommentCount, setLiveCommentCount] = useState<number | null>(null);
  const [livePinnedComments, setLivePinnedComments] = useState<PositionalComment[] | null>(null);
  const [snipDialogOpen, setSnipDialogOpen] = useState(false);

  useEffect(() => {
    if (!liveCommentCountScope) {
      setLiveCommentCount(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const items = await listPostComments({
          relayCreatorId: liveCommentCountScope.relayCreatorId,
          postId: liveCommentCountScope.postId
        });
        if (!cancelled) setLiveCommentCount(items.length);
      } catch {
        // Silent fallback to fixture value -- a stale badge is better than a crashed feed.
        if (!cancelled) setLiveCommentCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    liveCommentCountScope?.relayCreatorId,
    liveCommentCountScope?.postId,
    liveCommentCountScope?.refreshSignal
  ]);

  const displayedCommentCount = liveCommentCount ?? post.commentCount;

  const feedSource =
    post.feed_item_source ?? (post.kind === "discovery" ? "discover" : "subscribed");
  const isDiscover = feedSource === "discover";
  const MediaIcon = MEDIA_ICONS[post.mediaType] ?? FileText;
  const isVideoPost = isPatronFeedVideoPost(post);
  const playbackSrc = patronFeedPlaybackSrc(post);
  const posterSrc = patronFeedPosterSrc(post);
  const hasRenderableVideo =
    isVideoPost &&
    Boolean(playbackSrc) &&
    !playbackSrc.includes("placeholder.svg");

  const mediaItems = useMemo(() => {
    if (post.mediaItems && post.mediaItems.length > 0) {
      return post.mediaItems;
    }
    const fallbackUrl = post.highResImageUrl || post.coverImageUrl || posterSrc || playbackSrc || undefined;
    if (!post.primaryMediaId) return [];
    return [
      {
        mediaId: post.primaryMediaId,
        url: fallbackUrl,
        previewUrl: post.coverImageUrl || posterSrc || undefined,
        mimeType: post.primaryMimeType ?? null
      }
    ];
  }, [
    post.mediaItems,
    post.primaryMediaId,
    post.highResImageUrl,
    post.coverImageUrl,
    post.primaryMimeType,
    posterSrc,
    playbackSrc
  ]);
  const imageUrls = useMemo(() => {
    const mediaUrls = mediaItems
      .map((item) => item.url || item.previewUrl)
      .filter((u): u is string => Boolean(u));
    if (mediaUrls.length > 0) {
      return mediaUrls;
    }
    if (post.galleryImageUrls && post.galleryImageUrls.length > 0) {
      return post.galleryImageUrls;
    }
    if (isPatronFeedVideoPost(post)) {
      return [];
    }
    const single =
      post.highResImageUrl ||
      post.coverImageUrl ||
      "/placeholder.svg?height=800&width=1200";
    return [single];
  }, [
    mediaItems,
    post.galleryImageUrls,
    post.highResImageUrl,
    post.coverImageUrl,
    post.mediaType,
    post.primaryMimeType
  ]);

  const [inlineMediaIndex, setInlineMediaIndex] = useState(0);
  useEffect(() => {
    setInlineMediaIndex(0);
  }, [post.id]);

  const inlineMediaCount = imageUrls.length;
  const hasInlineMedia =
    hasRenderableVideo ||
    mediaItems.length > 0 ||
    Boolean(post.coverImageUrl || post.highResImageUrl);
  const layout = hasInlineMedia ? "inlineMedia" : post.feedCardLayout ?? "classic";
  const activeInlineMediaIndex =
    inlineMediaCount > 0
      ? ((inlineMediaIndex % inlineMediaCount) + inlineMediaCount) % inlineMediaCount
      : 0;

  const activeSnipMedia = mediaItems[activeInlineMediaIndex] ?? mediaItems[0];
  const activeMediaId = activeSnipMedia?.mediaId ?? post.primaryMediaId ?? undefined;
  const snipTarget: SnipTarget | null = activeSnipMedia?.mediaId
    ? {
        creatorId: post.creator.id,
        postId: post.id,
        mediaId: activeSnipMedia.mediaId,
        title: post.title,
        previewUrl:
          activeSnipMedia.url ||
          activeSnipMedia.previewUrl ||
          post.coverImageUrl ||
          posterSrc ||
          undefined
      }
    : null;

  useEffect(() => {
    if (
      !liveCommentCountScope ||
      !activeMediaId?.trim() ||
      hasRenderableVideo
    ) {
      setLivePinnedComments(null);
      return;
    }
    let cancelled = false;
    setLivePinnedComments([]);
    void listPostComments({
      relayCreatorId: liveCommentCountScope.relayCreatorId,
      postId: liveCommentCountScope.postId,
      mediaId: activeMediaId
    })
      .then((items) => {
        if (cancelled) return;
        const next = items
          .map(toPinnedPositionalComment)
          .filter((v): v is PositionalComment => v !== null);
        setLivePinnedComments(next);
      })
      .catch(() => {
        if (!cancelled) setLivePinnedComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [
    liveCommentCountScope?.relayCreatorId,
    liveCommentCountScope?.postId,
    liveCommentCountScope?.refreshSignal,
    activeMediaId,
    hasRenderableVideo
  ]);

  const cardComments = livePinnedComments ?? post.comments ?? [];

  const [pinPreviewPhase, setPinPreviewPhase] = useState<PinPreviewPhase>("hidden");
  const previewHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinPreviewBridgeRef = useRef(false);

  const clearPreviewHideTimer = useCallback(() => {
    if (previewHideTimerRef.current != null) {
      clearTimeout(previewHideTimerRef.current);
      previewHideTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPreviewHideTimer(), [clearPreviewHideTimer]);

  const onCommentChromeEnter = useCallback(() => {
    clearPreviewHideTimer();
    pinPreviewBridgeRef.current = true;
    setPinPreviewPhase("chrome");
  }, [clearPreviewHideTimer]);

  const onCommentChromeLeave = useCallback(() => {
    previewHideTimerRef.current = setTimeout(() => {
      setPinPreviewPhase((prev) => {
        if (prev === "chrome") {
          pinPreviewBridgeRef.current = false;
          return "hidden";
        }
        return prev;
      });
      previewHideTimerRef.current = null;
    }, 220);
  }, []);

  const onImageSurfaceEnter = useCallback(() => {
    clearPreviewHideTimer();
    if (!pinPreviewBridgeRef.current) return;
    setPinPreviewPhase("image");
  }, [clearPreviewHideTimer]);

  const onImageSurfaceLeave = useCallback(() => {
    previewHideTimerRef.current = setTimeout(() => {
      setPinPreviewPhase((prev) => {
        if (prev === "image") {
          pinPreviewBridgeRef.current = false;
          return "hidden";
        }
        return prev;
      });
      previewHideTimerRef.current = null;
    }, 100);
  }, []);

  const pinLayerVisible = pinPreviewPhase !== "hidden";
  const useHybridMediaBar =
    post.id === HYBRID_MEDIA_BAR_EXPERIMENT_POST_ID && inlineMediaCount > 1 && !hasRenderableVideo;

  const postTierChip = !isDiscover ? postAccessChipLabel(post) : null;
  const showFooterTierBadge = isDiscover;
  const publishedLabel = formatFeedPublishedDate(post.publishedAt);
  useEffect(() => {
    emitRelayInteractionTelemetryEvent({
      event_name: "post_impression",
      surface: "patron_feed_card",
      creator_id: post.creator.id,
      post_id: post.id,
      media_id: activeMediaId,
      feed_source: feedSource
    });
  }, [post.creator.id, post.id, activeMediaId, feedSource]);

  useEffect(() => {
    if (!activeMediaId?.trim()) return;
    emitRelayInteractionTelemetryEvent({
      event_name: "media_view",
      surface: "patron_feed_card",
      creator_id: post.creator.id,
      post_id: post.id,
      media_id: activeMediaId
    });
  }, [post.creator.id, post.id, activeMediaId]);

  const emitCommentClick = useCallback(() => {
    emitRelayInteractionTelemetryEvent({
      event_name: "cta_clicked",
      surface: "patron_feed_card",
      creator_id: post.creator.id,
      post_id: post.id,
      media_id: activeMediaId,
      interaction: "comment_open",
      target: "comment_thread"
    });
    onCommentClick?.({
      creatorId: post.creator.id,
      postId: post.id,
      mediaId: activeMediaId
    });
  }, [onCommentClick, post.creator.id, post.id, activeMediaId]);
  const emitSnipClick = useCallback(() => {
    emitRelayInteractionTelemetryEvent({
      event_name: "cta_clicked",
      surface: "patron_feed_card",
      creator_id: post.creator.id,
      post_id: post.id,
      media_id: activeMediaId,
      interaction: "snip_open",
      target: "snip_to_collection"
    });
    onSnipClick?.({
      creatorId: post.creator.id,
      postId: post.id,
      mediaId: activeMediaId
    });
  }, [onSnipClick, post.creator.id, post.id, activeMediaId]);
  const toggleInlineFavorite = useCallback(() => {
    setInlineFavorite((nextCurrent) => {
      const next = !nextCurrent;
      if (next) {
        emitRelayInteractionTelemetryEvent({
          event_name: "favorite_created",
          surface: "patron_feed_card",
          creator_id: post.creator.id,
          post_id: post.id,
          media_id: activeMediaId,
          target_kind: "post",
          target_id: post.id
        });
      }
      return next;
    });
  }, [activeMediaId, post.creator.id, post.id]);
  const togglePostLike = useCallback(() => {
    setLiked((current) => {
      const next = !current;
      if (next) {
        emitRelayInteractionTelemetryEvent({
          event_name: "post_liked",
          surface: "patron_feed_card",
          creator_id: post.creator.id,
          post_id: post.id,
          media_id: activeMediaId
        });
      }
      return next;
    });
  }, [activeMediaId, post.creator.id, post.id]);

  return (
    <>
    <article
      onClick={onClick}
      className={[
        "group relative rounded-lg border transition-colors duration-150",
        radialMenuOpen ? "overflow-visible z-30" : "overflow-hidden",
        isDiscover
          ? "bg-[#131313] border-[#232323] border-l-2 border-l-[#1B4332]"
          : "bg-[#161616] border-[#242424] hover:border-[#2E2E2E]",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
      aria-label={`${isDiscover ? "Discover: " : `${postTierChip ?? "Following"}: `}${post.title} by ${post.creator.displayName}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {/* Source label — public vs membership-gated (P6-patron-003) */}
      {isDiscover && (
        <div className="flex items-center gap-2 px-5 pt-4">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-widest uppercase border border-[#2D6A4F]/50 text-[#40916C] bg-[#0D1F17]/60">
            Discover
          </span>
        </div>
      )}

      <div className="p-5">
        {/* Header row: avatar, creator info, follow/timestamp */}
        <div className="flex items-start justify-between gap-3 mb-4">
          {/* Creator identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-[#2A2A2A] ring-1 ring-[#2A2A2A]"
              aria-hidden="true"
            >
              <img
                src={post.creator.avatarUrl}
                alt={`${post.creator.displayName} avatar`}
                className="w-full h-full object-cover"
                width={40}
                height={40}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[#F0F0F0] leading-tight">
                  {post.creator.displayName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-xs text-[#555555]">
                  @{post.creator.handle}
                </span>
                <span className="text-[#2A2A2A]" aria-hidden="true">
                  ·
                </span>
                <span className="text-xs text-[#555555] truncate">
                  {post.creator.discipline}
                </span>
              </div>
            </div>
          </div>

          {/* Right: follow CTA (discovery only) + timestamp */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              {isDiscover && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFollowed(!followed);
                  }}
                  className={[
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-150",
                    followed
                      ? "bg-[#1B4332] border-[#2D6A4F] text-[#40916C]"
                      : "bg-transparent border-[#2E2E2E] text-[#7A7A7A] hover:border-[#2D6A4F]/60 hover:text-[#40916C]",
                  ].join(" ")}
                  aria-label={followed ? "Unfollow creator" : "Follow creator"}
                >
                  {followed ? (
                    <Check size={11} aria-hidden="true" />
                  ) : (
                    <UserPlus size={11} aria-hidden="true" />
                  )}
                  {followed ? "Following" : "Follow"}
                </button>
              )}
              <time
                className="text-xs text-[#444444] whitespace-nowrap"
                dateTime={post.publishedAt}
              >
                {publishedLabel}
              </time>
            </div>
            {!isDiscover && postTierChip ? (
              <span
                className={postAccessChipClassName(postTierChip)}
                aria-label={`Tier: ${postTierChip}`}
              >
                {postTierChip}
              </span>
            ) : null}
          </div>
        </div>

        {/* Canonical feed media: prominent in-card art with comment / collect affordances. */}
        {layout === "inlineMedia" && hasInlineMedia ? (
          <div className="-mx-5 mb-4 border-y border-[#1C1C1C] bg-[#0E0E0E] relative overflow-visible">
            {hasRenderableVideo ? (
              <div className="relative flex w-full min-w-0 max-w-full flex-col items-center justify-center outline-none">
                <PatronFeedVideo
                  src={playbackSrc}
                  poster={posterSrc}
                  controls={false}
                  muted
                  preload="metadata"
                  className="pointer-events-none h-auto w-auto max-h-[min(42vh,320px)] max-w-full object-contain"
                />
              </div>
            ) : (
              <GalleryMediaStack
                imageUrls={imageUrls}
                displayIndex={activeInlineMediaIndex}
                visualStack={false}
                pinLayerPointerEvents={
                  pinLayerVisible && cardComments.length > 0 ? "auto" : "none"
                }
                pinStopClickPropagation
                title={post.title}
                comments={cardComments}
                pinLayerVisible={pinLayerVisible && cardComments.length > 0}
                ghostPins={false}
                cascadeEnter={(i) => i * 42}
                cascadeExit={(i) => (cardComments.length - 1 - i) * 36}
                surfaceClassName="relative flex h-[min(42vh,320px)] w-full min-w-0 max-w-full flex-col items-center justify-center overflow-hidden outline-none"
                imgClassName="pointer-events-none h-full w-full object-contain"
                onMouseEnter={onImageSurfaceEnter}
                onMouseLeave={onImageSurfaceLeave}
              />
            )}
            {!useHybridMediaBar && !hasRenderableVideo && inlineMediaCount > 1 ? (
              <MediaEdgeRail
                count={inlineMediaCount}
                activeIndex={activeInlineMediaIndex}
                onSelect={setInlineMediaIndex}
                onActionMenuOpenChange={setRadialMenuOpen}
                actions={[
                  {
                    kind: "favorite",
                    label: "Favorite",
                    active: inlineFavorite,
                    onSelect: toggleInlineFavorite
                  },
                  {
                    kind: "snip",
                    label: "Snip",
                    disabled: !snipTarget,
                    onSelect: () => {
                      if (onSnipClick) {
                        emitSnipClick();
                        return;
                      }
                      if (snipTarget) setSnipDialogOpen(true);
                    }
                  },
                  {
                    kind: "comment",
                    label: "Comment",
                    onSelect: emitCommentClick
                  }
                ]}
              />
            ) : null}
            {useHybridMediaBar ? (
              <HybridMediaActionBar
                count={inlineMediaCount}
                activeIndex={activeInlineMediaIndex}
                favorited={inlineFavorite}
                snipDisabled={!snipTarget}
                onSelect={setInlineMediaIndex}
                onFavorite={toggleInlineFavorite}
                onComment={emitCommentClick}
                onSnip={() => {
                  if (onSnipClick) {
                    emitSnipClick();
                    return;
                  }
                  if (snipTarget) setSnipDialogOpen(true);
                }}
                onCommentPreviewEnter={onCommentChromeEnter}
                onCommentPreviewLeave={onCommentChromeLeave}
                onOpenChange={setRadialMenuOpen}
              />
            ) : (
              /* Condensed gallery chrome — rail hover bridges to image (pins readable via CommentPin tooltips) */
              <div
                className="relative z-10 shrink-0 border-t border-[#1A1A1A] bg-[#0E0E0E] opacity-[0.38] transition-opacity duration-200 ease-out hover:opacity-100 focus-within:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center items-center gap-0.5 py-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleInlineFavorite();
                    }}
                    className={[
                      "flex items-center justify-center w-7 h-7 rounded-md transition-all",
                      inlineFavorite
                        ? "text-[#40916C] border border-[#2D6A4F] bg-[#0D1F17]"
                        : "text-[#555555] border border-[#2A2A2A] bg-[#0E0E0E] hover:text-[#40916C] hover:border-[#2D6A4F]/50",
                    ].join(" ")}
                    aria-label={inlineFavorite ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={inlineFavorite}
                    title="Favorite"
                  >
                    <Star size={12} fill={inlineFavorite ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    disabled={hasRenderableVideo}
                    title={hasRenderableVideo ? "Pinned comments apply to images only" : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      emitCommentClick();
                    }}
                    onMouseEnter={hasRenderableVideo ? undefined : onCommentChromeEnter}
                    onMouseLeave={hasRenderableVideo ? undefined : onCommentChromeLeave}
                    onFocus={hasRenderableVideo ? undefined : onCommentChromeEnter}
                    onBlur={hasRenderableVideo ? undefined : onCommentChromeLeave}
                    className={[
                      "group flex items-center gap-1 px-2 py-1 bg-[#0E0E0E] border border-[#2A2A2A] rounded-md text-[11px] leading-tight transition-all",
                      hasRenderableVideo
                        ? "cursor-not-allowed opacity-40 text-[#555555]"
                        : "text-[#555555] hover:text-[#40916C] hover:border-[#2D6A4F]/50",
                    ].join(" ")}
                    aria-label="Preview pinned comments on image. Hover pins on the image to read. Click card for full gallery."
                  >
                    <Crosshair size={11} className="group-hover:rotate-45 transition-transform shrink-0" />
                    <span>Comment</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSnipClick) {
                        emitSnipClick();
                        return;
                      }
                      if (snipTarget) setSnipDialogOpen(true);
                    }}
                    disabled={!snipTarget}
                    className={[
                      "flex items-center justify-center w-7 h-7 rounded-md transition-all",
                      snipTarget
                        ? "text-[#555555] border border-[#2A2A2A] bg-[#0E0E0E] hover:text-[#40916C] hover:border-[#2D6A4F]/50"
                        : "cursor-not-allowed opacity-40 text-[#555555] border border-[#2A2A2A] bg-[#0E0E0E]",
                    ].join(" ")}
                    aria-label="Snip this image"
                    title="Snip"
                  >
                    <SnipIcon className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Body: title + excerpt + optional thumbnail (classic only) */}
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <h2
              className={[
                "font-semibold leading-snug mb-2 text-balance",
                isDiscover
                  ? "text-base text-[#C8C8C8]"
                  : "text-[17px] text-[#F0F0F0]",
              ].join(" ")}
            >
              {post.title}
            </h2>
            <p className="text-sm text-[#5A5A5A] leading-relaxed line-clamp-2">
              {post.excerpt}
            </p>
          </div>

          {layout === "classic" && (post.coverImageUrl || hasRenderableVideo) && (
            <div
              className={[
                "shrink-0 rounded-md overflow-hidden bg-[#2A2A2A]",
                isDiscover ? "w-[108px] h-[72px]" : "w-[124px] h-[80px]",
              ].join(" ")}
              aria-hidden="true"
            >
              {hasRenderableVideo ? (
                posterSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- patron export / poster URL
                  <img
                    src={posterSrc}
                    alt=""
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-150"
                    width={124}
                    height={80}
                  />
                ) : (
                  <PatronFeedVideo
                    src={playbackSrc}
                    controls={false}
                    muted
                    preload="metadata"
                    className="h-full w-full object-cover opacity-80 transition-opacity duration-150 group-hover:opacity-100"
                  />
                )
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.coverImageUrl}
                  alt=""
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-150"
                  width={124}
                  height={80}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer: media type, engagement, tier */}
        <div className="flex items-center gap-4 mt-4 pt-3.5 border-t border-[#1C1C1C]">
          {/* Media type + read time */}
          <div className="flex items-center gap-1.5 text-[#444444]">
            <MediaIcon size={12} aria-hidden="true" />
            <span className="text-xs">{post.readTimeLabel}</span>
          </div>

          {/* Likes */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePostLike();
            }}
            className={[
              "flex items-center gap-1.5 text-xs transition-colors duration-150",
              liked
                ? "text-[#40916C]"
                : "text-[#4B5563] hover:text-[#9CA3AF]",
            ].join(" ")}
            aria-label={liked ? "Unlike post" : "Like post"}
            aria-pressed={liked}
          >
            <Heart
              size={12}
              fill={liked ? "currentColor" : "none"}
              aria-hidden="true"
            />
            {post.likeCount + (liked ? 1 : 0)}
          </button>

          {/* Comments */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              emitCommentClick();
            }}
            className="flex items-center gap-1.5 text-xs text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150"
            aria-label="View comments"
          >
            <MessageCircle size={12} aria-hidden="true" />
            {displayedCommentCount}
          </button>

          {/* Tier badge — discover cards only; subscribed cards show post tier in header */}
          {showFooterTierBadge ? (
            <div className="ml-auto">
              <span
                className={[
                  "text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold",
                  post.tierLabel.trim().toLowerCase() === "free"
                    ? "bg-[#0D1F17] text-[#2D6A4F] border border-[#1B4332]/50"
                    : "text-[#3A3A3A] border border-[#222222]",
                ].join(" ")}
                aria-label={`Tier: ${post.tierLabel}`}
              >
                {post.tierLabel}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </article>
    <SnipToCollectionDialog
      open={snipDialogOpen}
      target={snipTarget}
      onClose={() => setSnipDialogOpen(false)}
    />
    </>
  );
}
