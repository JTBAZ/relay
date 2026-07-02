"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  X,
  Heart,
  Share2,
  ChevronLeft,
  Crosshair,
  MessageCircle,
  Tag,
  Star,
  Loader,
} from "lucide-react";
import type { FeedPost, PositionalComment } from "@/lib/relay-fixtures";
import {
  isPatronFeedVideoPost,
  patronFeedPlaybackSrc,
  patronFeedPosterSrc
} from "@/lib/patron-feed-media";
import { GalleryMediaStack } from "./gallery-media-stack";
import { MediaEdgeRail } from "./media-edge-rail";
import { PatronFeedVideo } from "./patron-feed-playback";
import { CommentThreadPanel } from "./comment-thread-panel";
import { useLiveComments, type LiveCommentsScope } from "./use-live-comments";
import { SnipToCollectionDialog, type SnipTarget } from "./snip-to-collection-dialog";
import { emitRelayInteractionTelemetryEvent } from "@/lib/relay-interaction-telemetry";

interface GalleryViewProps {
  post: FeedPost;
  onClose: () => void;
  onNavigate?: (direction: "prev" | "next") => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** When set, initialize the media stack on the matching media item. */
  initialMediaId?: string | null;
  /** Optional deep-link action requested by feed-level controls. */
  initialIntent?: "comment" | "snip" | null;
  /**
   * PE-E (BO-P2-04) — when set, comments load from the live API and submit/edit/delete/react/mod
   * actions hit the PE-E endpoints. When null/undefined, today's fixture-driven local-state path
   * is preserved unchanged. Pass null from any caller that doesn't need live wiring (mock pages,
   * design previews) so this surface remains zero-risk.
   */
  liveCommentsScope?: LiveCommentsScope | null;
  /** P6-patron-007 — tier / access chips above the post body (deep-link detail). */
  entitlementStrip?: ReactNode | null;
}

type ViewMode = "gallery" | "comment";

/** Gallery-only preview: hover Comment → pins; move to image → keep; leave image → hide */
type PinPreviewPhase = "hidden" | "button" | "image";

interface PendingComment {
  position: { x: number; y: number };
  text: string;
  tags: string[];
}

const TAG_SUGGESTIONS = [
  "landscape",
  "portrait",
  "abstract",
  "nature",
  "texture",
  "light study",
  "composition",
  "color",
];

function resolveInitialStackIndex(
  mediaItems: FeedPost["mediaItems"],
  initialMediaId?: string | null
): number {
  if (!initialMediaId?.trim() || !mediaItems?.length) {
    return 0;
  }
  const idx = mediaItems.findIndex((item) => item.mediaId === initialMediaId.trim());
  return idx >= 0 ? idx : 0;
}

export function GalleryView({
  post,
  onClose,
  onNavigate,
  hasPrev = false,
  hasNext = false,
  initialMediaId = null,
  initialIntent = null,
  liveCommentsScope = null,
  entitlementStrip = null,
}: GalleryViewProps) {
  const [liked, setLiked] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const live = useLiveComments(liveCommentsScope);
  const [fixtureComments, setFixtureComments] = useState<PositionalComment[]>(
    post.comments || []
  );
  // When live wiring is on, the rendered pin layer + count come from the API; otherwise the
  // fixture-driven local list is the source of truth. This flag is the single switch every
  // downstream branch reads so the two modes never interleave by accident.
  const isLive = liveCommentsScope !== null;
  const setComments = setFixtureComments;
  const [pendingComment, setPendingComment] = useState<PendingComment | null>(
    null
  );
  const [commentText, setCommentText] = useState("");
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [pinPreviewPhase, setPinPreviewPhase] = useState<PinPreviewPhase>("hidden");
  /** Full-screen art overlay; enter animation is Z+scale (toward viewer), not letterbox FLIP */
  const [mediaExpanded, setMediaExpanded] = useState(false);
  /** Multi-image zoom: which slide is on top (wheel cycles). */
  const [stackIndex, setStackIndex] = useState(() =>
    resolveInitialStackIndex(post.mediaItems, initialMediaId)
  );
  const [isFavorited, setIsFavorited] = useState(false);
  const [snipDialogOpen, setSnipDialogOpen] = useState(false);
  /** Thread board is on-demand: opened from the Thread toggle, not always visible. */
  const [threadOpen, setThreadOpen] = useState(false);
  const [radialMenuOpen, setRadialMenuOpen] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);
  const imageSurfaceRef = useRef<HTMLDivElement>(null);
  const expandedStackRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const threadComposerRef = useRef<HTMLTextAreaElement>(null);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const previewHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True after Comment is hovered until preview fully ends (image leave or button→hidden timeout). */
  const pinPreviewBridgeRef = useRef(false);

  const clearPreviewHideTimer = useCallback(() => {
    if (previewHideTimerRef.current != null) {
      clearTimeout(previewHideTimerRef.current);
      previewHideTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPreviewHideTimer(), [clearPreviewHideTimer]);

  /** Expanded overlay is gallery-only; never keep enlarge state alongside comment mode */
  useEffect(() => {
    if (viewMode !== "gallery") {
      setMediaExpanded(false);
    }
  }, [viewMode]);

  const collapseExpanded = useCallback(() => {
    setMediaExpanded(false);
  }, []);

  const openExpanded = useCallback(() => {
    setStackIndex(0);
    setMediaExpanded(true);
  }, []);

  const pinLayerVisible =
    viewMode === "comment" || pinPreviewPhase !== "hidden";

  const onCommentButtonEnter = useCallback(() => {
    clearPreviewHideTimer();
    pinPreviewBridgeRef.current = true;
    setPinPreviewPhase("button");
  }, [clearPreviewHideTimer]);

  const onCommentButtonLeave = useCallback(() => {
    previewHideTimerRef.current = setTimeout(() => {
      setPinPreviewPhase((prev) => {
        if (prev === "button") {
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

  const isVideoPost = isPatronFeedVideoPost(post);
  const playbackSrc = patronFeedPlaybackSrc(post);
  const posterSrc = patronFeedPosterSrc(post);

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
    if (isPatronFeedVideoPost(post)) {
      return [];
    }
    const mediaUrls = mediaItems
      .map((item) => item.url || item.previewUrl)
      .filter((u): u is string => Boolean(u));
    if (mediaUrls.length > 0) {
      return mediaUrls;
    }
    if (post.galleryImageUrls && post.galleryImageUrls.length > 0) {
      return post.galleryImageUrls;
    }
    const single =
      post.highResImageUrl ||
      post.coverImageUrl ||
      "/placeholder.svg?height=800&width=1200";
    return [single];
  }, [
    post.galleryImageUrls,
    post.highResImageUrl,
    post.coverImageUrl,
    post.mediaType,
    post.primaryMimeType,
    mediaItems
  ]);

  const multiImage = imageUrls.length > 1;
  const activeMediaIndex = imageUrls.length > 0
    ? ((stackIndex % imageUrls.length) + imageUrls.length) % imageUrls.length
    : 0;
  const activeMediaItem = mediaItems[activeMediaIndex] ?? mediaItems[0];
  const activeMediaId = activeMediaItem?.mediaId ?? post.primaryMediaId ?? undefined;
  const snipTarget: SnipTarget | null = activeMediaItem?.mediaId
    ? {
        creatorId: post.creator.id,
        postId: post.id,
        mediaId: activeMediaItem.mediaId,
        title: post.title,
        previewUrl:
          activeMediaItem.url ||
          activeMediaItem.previewUrl ||
          post.coverImageUrl ||
          posterSrc ||
          undefined
      }
    : null;

  const comments: PositionalComment[] = useMemo(() => {
    if (!isLive) return fixtureComments;
    const mediaId = activeMediaItem?.mediaId;
    if (!mediaId) return [];
    const pinnedForActiveMedia: PositionalComment[] = [];
    for (let idx = 0; idx < live.records.length; idx += 1) {
      const record = live.records[idx];
      if (!record) continue;
      if (record.mediaId !== mediaId) continue;
      if (record.anchorX === null || record.anchorY === null) continue;
      const positional = live.positional[idx];
      if (!positional) continue;
      pinnedForActiveMedia.push(positional);
    }
    return pinnedForActiveMedia;
  }, [isLive, fixtureComments, activeMediaItem?.mediaId, live.records, live.positional]);

  useEffect(() => {
    if (!activeMediaId?.trim()) return;
    emitRelayInteractionTelemetryEvent({
      event_name: "media_view",
      surface: "post_detail_gallery",
      creator_id: post.creator.id,
      post_id: post.id,
      media_id: activeMediaId,
      actor_key: liveCommentsScope?.viewerAccountId
    });
  }, [activeMediaId, liveCommentsScope?.viewerAccountId, post.creator.id, post.id]);

  const hasRealImageMedia = useMemo(() => {
    if (isVideoPost) return true;
    return imageUrls.some((u) => u && !u.includes("/placeholder.svg"));
  }, [imageUrls, isVideoPost]);

  const prefersThreadComposer =
    isLive && (post.mediaType === "writing" || !hasRealImageMedia);

  const focusThreadComposer = useCallback(() => {
    setThreadOpen(true);
    // Defer focus to the next frame so the panel is mounted before we focus its composer.
    requestAnimationFrame(() => {
      threadComposerRef.current?.focus();
      threadComposerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    setMediaExpanded(false);
    setStackIndex(resolveInitialStackIndex(post.mediaItems, initialMediaId));
    setPinPreviewPhase("hidden");
    setPendingComment(null);
    setCommentText("");
    setPendingTags([]);
    setCustomTag("");
    pinPreviewBridgeRef.current = false;
    if (initialIntent === "snip") {
      setViewMode("gallery");
      setSnipDialogOpen(true);
      return;
    }
    if (initialIntent === "comment" && !isVideoPost) {
      setSnipDialogOpen(false);
      if (prefersThreadComposer) {
        setViewMode("gallery");
        focusThreadComposer();
      } else {
        setViewMode("comment");
      }
      return;
    }
    setViewMode("gallery");
    setSnipDialogOpen(false);
  }, [
    post.id,
    initialMediaId,
    post.mediaItems,
    initialIntent,
    isVideoPost,
    prefersThreadComposer,
    focusThreadComposer
  ]);

  const handleThreadCompose = useCallback(
    async (body: string) => {
      if (!isLive) return;
      setComposeError(null);
      setComposeBusy(true);
      try {
        await live.submit({
          body,
          mediaId: null,
          anchorX: null,
          anchorY: null
        });
      } catch (err) {
        setComposeError(err instanceof Error ? err.message : String(err));
      } finally {
        setComposeBusy(false);
      }
    },
    [isLive, live]
  );

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewMode === "gallery" && mediaExpanded) {
          collapseExpanded();
          return;
        }
        if (viewMode === "comment") {
          pinPreviewBridgeRef.current = false;
          setPinPreviewPhase("hidden");
          setViewMode("gallery");
          setPendingComment(null);
          setCommentText("");
          setPendingTags([]);
          setCustomTag("");
        } else {
          onClose();
        }
      }
      if (viewMode === "gallery") {
        if (
          mediaExpanded &&
          multiImage &&
          (e.key === "ArrowUp" || e.key === "ArrowDown")
        ) {
          e.preventDefault();
          const n = imageUrls.length;
          const dir = e.key === "ArrowDown" ? 1 : -1;
          setStackIndex((i) => ((i + dir) % n + n) % n);
          return;
        }
        if (e.key === "ArrowLeft" && hasPrev && onNavigate) {
          onNavigate("prev");
        }
        if (e.key === "ArrowRight" && hasNext && onNavigate) {
          onNavigate("next");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onClose,
    onNavigate,
    hasPrev,
    hasNext,
    viewMode,
    mediaExpanded,
    collapseExpanded,
    multiImage,
    imageUrls.length,
  ]);

  // Focus comment input when placing pin
  useEffect(() => {
    if (pendingComment && commentInputRef.current) {
      commentInputRef.current.focus();
    }
  }, [pendingComment]);

  /** Clicks on the shared media stack: gallery = toggle zoom; comment = place pin. Pins use same box as transform wrapper. */
  const handleMediaStackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;

      if (viewMode === "comment") {
        if (pendingComment) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setPendingComment({ position: { x, y }, text: "", tags: [] });
        return;
      }

      openExpanded();
    },
    [viewMode, pendingComment, openExpanded]
  );

  const handleExpandedStackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      collapseExpanded();
    },
    [collapseExpanded]
  );

  const handleCommentSubmit = async () => {
    if (!pendingComment || !commentText.trim()) return;

    if (isLive) {
      setComposeError(null);
      setComposeBusy(true);
      try {
        await live.submit({
          body: commentText.trim(),
          mediaId: activeMediaItem?.mediaId ?? null,
          anchorX: pendingComment.position.x,
          anchorY: pendingComment.position.y,
          tagIds: pendingTags
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setComposeError(msg);
        setComposeBusy(false);
        return;
      }
      setComposeBusy(false);
    } else {
      const newComment: PositionalComment = {
        id: `cm-${Date.now()}`,
        author: {
          id: "v1",
          displayName: "You",
          handle: "you",
          avatarUrl: "/placeholder.svg?height=32&width=32",
        },
        text: commentText.trim(),
        position: pendingComment.position,
        createdAt: "Just now",
        tags: pendingTags.length > 0 ? pendingTags : undefined,
      };
      setComments((prev) => [...prev, newComment]);
    }

    setPendingComment(null);
    setCommentText("");
    setPendingTags([]);
    setCustomTag("");
    setViewMode("gallery");
  };

  const toggleTag = (tag: string) => {
    setPendingTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const tag = customTag.trim().toLowerCase();
    if (tag && !pendingTags.includes(tag)) {
      setPendingTags((prev) => [...prev, tag]);
      setCustomTag("");
    }
  };

  const enterCommentMode = () => {
    if (isVideoPost) return;
    emitRelayInteractionTelemetryEvent({
      event_name: "cta_clicked",
      surface: "post_detail_gallery",
      creator_id: post.creator.id,
      post_id: post.id,
      media_id: activeMediaId,
      actor_key: liveCommentsScope?.viewerAccountId,
      interaction: prefersThreadComposer ? "comment_thread_open" : "comment_pin_mode",
      target: "comment"
    });
    if (prefersThreadComposer) {
      focusThreadComposer();
      return;
    }
    clearPreviewHideTimer();
    pinPreviewBridgeRef.current = false;
    setPinPreviewPhase("hidden");
    collapseExpanded();
    setViewMode("comment");
  };

  const toggleFavorite = () => {
    setIsFavorited((current) => {
      const next = !current;
      if (next) {
        emitRelayInteractionTelemetryEvent({
          event_name: "favorite_created",
          surface: "post_detail_gallery",
          creator_id: post.creator.id,
          post_id: post.id,
          media_id: activeMediaId,
          actor_key: liveCommentsScope?.viewerAccountId,
          target_kind: "post",
          target_id: post.id
        });
      }
      return next;
    });
  };

  const toggleLike = () => {
    setLiked((current) => {
      const next = !current;
      if (next) {
        emitRelayInteractionTelemetryEvent({
          event_name: "post_liked",
          surface: "post_detail_gallery",
          creator_id: post.creator.id,
          post_id: post.id,
          media_id: activeMediaId,
          actor_key: liveCommentsScope?.viewerAccountId
        });
      }
      return next;
    });
  };

  const emitShareClick = () => {
    emitRelayInteractionTelemetryEvent({
      event_name: "cta_clicked",
      surface: "post_detail_gallery",
      creator_id: post.creator.id,
      post_id: post.id,
      media_id: activeMediaId,
      actor_key: liveCommentsScope?.viewerAccountId,
      interaction: "share_click",
      target: "share"
    });
  };

  const exitCommentMode = () => {
    pinPreviewBridgeRef.current = false;
    setPinPreviewPhase("hidden");
    collapseExpanded();
    setViewMode("gallery");
    setPendingComment(null);
    setCommentText("");
    setPendingTags([]);
    setCustomTag("");
  };

  /** Popover opens above the pin when the pin is low, so it is not clipped by overflow */
  const pendingPopoverOpensUp =
    pendingComment != null && pendingComment.position.y > 58;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center animate-[fadeIn_0.2s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label={`${post.title} by ${post.creator.displayName}`}
    >
      {/* Opaque backdrop — alpha backdrops let the feed (same cover img) show through and read as a duplicate */}
      <div
        className="absolute inset-0 bg-[#0A0A0A] transition-colors duration-300"
        onClick={
          viewMode === "gallery"
            ? mediaExpanded
              ? collapseExpanded
              : onClose
            : undefined
        }
      />

      {/* PE-E live thread panel — on-demand overlay. Opened from the Thread toggle so the
          media + rail keep the stage; the board is for reading/replying when wanted. */}
      {isLive && liveCommentsScope ? (
        <CommentThreadPanel
          live={live}
          open={threadOpen}
          viewerAccountId={liveCommentsScope.viewerAccountId}
          isCreatorOwner={liveCommentsScope.isCreatorOwner}
          onClose={() => setThreadOpen(false)}
          onCompose={handleThreadCompose}
          composeBusy={composeBusy}
          composeError={composeError}
          composeHint={
            prefersThreadComposer
              ? "This post has no image to pin on — add your comment here."
              : "Post-level comment, or use Comment below the image to pin on the artwork."
          }
          composerRef={threadComposerRef}
        />
      ) : null}

      {/* Thread toggle — sits left of the close button so the board can be opened on demand. */}
      {isLive && liveCommentsScope && !threadOpen && viewMode === "gallery" && !mediaExpanded ? (
        <button
          type="button"
          onClick={() => setThreadOpen(true)}
          className="absolute top-4 right-16 z-50 flex h-10 items-center gap-1.5 rounded-full border border-[#2A2A2A] bg-[#1A1A1A] px-3.5 text-[#888888] transition-colors hover:border-[#3A3A3A] hover:text-white"
          aria-label={`Open comment thread${live.records.length > 0 ? ` (${live.records.length})` : ""}`}
        >
          <MessageCircle size={15} aria-hidden />
          <span className="text-xs font-medium">Thread</span>
          {live.records.length > 0 ? (
            <span className="rounded-full border border-[#2A2A2A] px-1.5 text-[10px] text-[#9CA3AF]">
              {live.records.length}
            </span>
          ) : null}
        </button>
      ) : null}

      {/* Close button */}
      <button
        onClick={
          viewMode !== "gallery"
            ? exitCommentMode
            : mediaExpanded
              ? collapseExpanded
              : onClose
        }
        className={[
          "absolute top-4 right-4 w-10 h-10 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#888888] hover:text-white hover:border-[#3A3A3A] transition-colors",
          mediaExpanded && viewMode === "gallery" ? "z-[110]" : "z-50",
        ].join(" ")}
        aria-label={viewMode !== "gallery" ? "Exit comment mode" : "Close gallery"}
      >
        <X size={18} />
      </button>

      {/* Navigation arrows */}
      {viewMode === "gallery" && onNavigate && (
        <>
          {hasPrev && (
            <button
              onClick={() => onNavigate("prev")}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-50 w-10 h-10 rounded-full bg-[#1A1A1A]/80 border border-[#2A2A2A] flex items-center justify-center text-[#888888] hover:text-white hover:border-[#3A3A3A] transition-colors"
              aria-label="Previous post"
            >
              <ChevronLeft size={20} />
            </button>
          )}
        </>
      )}

      {/* Comment mode instruction banner */}
      {viewMode === "comment" && !pendingComment && !prefersThreadComposer && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1B4332] border border-[#2D6A4F] text-[#40916C] text-sm font-medium shadow-lg">
          <Crosshair size={14} />
          Click anywhere on the image to leave a comment
        </div>
      )}

      {/* Main content — scroll the card when image + chrome + copy exceed the viewport */}
      <div
        className={[
          "relative z-10 mx-4 flex w-full max-w-6xl min-h-0 max-h-[90vh] flex-col rounded-xl border border-[#242424] bg-[#0E0E0E] shadow-2xl shadow-black/40 overscroll-contain transition-all duration-300 animate-[scaleIn_0.2s_ease-out] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          radialMenuOpen ? "overflow-visible" : "overflow-x-hidden",
          viewMode === "comment"
            ? "max-w-5xl overflow-y-visible"
            : radialMenuOpen
              ? "overflow-y-visible"
              : "overflow-y-auto",
        ].join(" ")}
      >
        {/* Feed-like post header so deep-linked detail keeps creator context above the media. */}
        {viewMode === "gallery" ? (
          <div
            className={[
              "relative z-10 flex shrink-0 items-start justify-between gap-4 rounded-t-xl border-b border-[#1A1A1A] bg-[#161616] p-5 transition-opacity duration-300 ease-out",
              mediaExpanded ? "pointer-events-none opacity-[0.22]" : "opacity-100",
            ].join(" ")}
            aria-hidden={mediaExpanded}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#2A2A2A] ring-1 ring-[#2A2A2A]">
                <img
                  src={post.creator.avatarUrl}
                  alt={`${post.creator.displayName} avatar`}
                  className="h-full w-full object-cover"
                  width={44}
                  height={44}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold leading-tight text-[#F0F0F0]">
                    {post.creator.displayName}
                  </span>
                </div>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-xs text-[#555555]">@{post.creator.handle}</span>
                  <span className="text-[#2A2A2A]" aria-hidden="true">
                    ·
                  </span>
                  <span className="truncate text-xs text-[#555555]">
                    {post.creator.discipline}
                  </span>
                </div>
              </div>
            </div>
            <time className="shrink-0 text-xs text-[#444444]" dateTime={post.publishedAt}>
              {post.publishedAt}
            </time>
          </div>
        ) : null}

        {/* Letterbox media — not painted while expanded overlay is shown (avoids duplicate img compositing) */}
        <div
          ref={imageRef}
          className={[
            "relative z-0 isolate flex flex-col justify-center group",
            /* Gallery: shrink-0 so the preview is never flex-squashed (was flex-1 + overflow-hidden clipping object-contain). Comment: keep flex-1 for pin canvas. */
            viewMode === "comment"
              ? [
                  "min-h-0 flex-1 cursor-crosshair overflow-visible bg-[#0A0A0A]",
                  prefersThreadComposer ? "min-h-[120px]" : "",
                ].join(" ")
              : "shrink-0 overflow-visible bg-[#0E0E0E]",
          ].join(" ")}
        >
          <div
            className={[
              "flex w-full shrink-0 items-center justify-center",
              viewMode === "comment"
                ? "min-h-0 flex-1 max-h-[60vh] overflow-visible"
                : "max-h-[60vh] overflow-visible",
              viewMode === "gallery" && mediaExpanded ? "hidden" : "",
            ].join(" ")}
            aria-hidden={viewMode === "gallery" && mediaExpanded}
          >
            {isVideoPost ? (
              <div
                ref={imageSurfaceRef}
                className={[
                  "relative flex w-full max-w-full flex-col items-center justify-center outline-none",
                  viewMode === "gallery" ? "cursor-zoom-in" : "",
                ].join(" ")}
                onClick={handleMediaStackClick}
                onMouseEnter={viewMode === "gallery" ? onImageSurfaceEnter : undefined}
                onMouseLeave={viewMode === "gallery" ? onImageSurfaceLeave : undefined}
                onKeyDown={
                  viewMode === "gallery"
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openExpanded();
                        }
                      }
                    : undefined
                }
                role={viewMode === "gallery" ? "button" : undefined}
                tabIndex={viewMode === "gallery" ? 0 : undefined}
                aria-label={viewMode === "gallery" ? "Click to enlarge video" : undefined}
              >
                <PatronFeedVideo
                  src={playbackSrc}
                  poster={posterSrc}
                  controls={false}
                  muted
                  preload="metadata"
                  className="pointer-events-none h-auto w-auto max-h-[60vh] max-w-full object-contain"
                />
              </div>
            ) : (
            <GalleryMediaStack
              stackRef={imageSurfaceRef}
              imageUrls={imageUrls}
              displayIndex={activeMediaIndex}
              visualStack={false}
              title={post.title}
              comments={comments}
              pinLayerVisible={pinLayerVisible}
              ghostPins={viewMode === "comment"}
              cascadeEnter={(i) => i * 42}
              cascadeExit={(i) => (comments.length - 1 - i) * 36}
              surfaceClassName={[
                "relative flex h-[min(60vh,620px)] w-full max-w-full flex-col items-center justify-center overflow-hidden outline-none",
                viewMode === "gallery" ? "cursor-zoom-in" : "",
              ].join(" ")}
              imgClassName="pointer-events-none h-full w-full object-contain"
              onClick={handleMediaStackClick}
              onMouseEnter={viewMode === "gallery" ? onImageSurfaceEnter : undefined}
              onMouseLeave={viewMode === "gallery" ? onImageSurfaceLeave : undefined}
              onKeyDown={
                viewMode === "gallery"
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openExpanded();
                      }
                    }
                  : undefined
              }
              role={viewMode === "gallery" ? "button" : undefined}
              tabIndex={viewMode === "gallery" ? 0 : undefined}
              aria-label={viewMode === "gallery" ? "Click to enlarge image" : undefined}
            >
            {/* Pending comment pin */}
            {pendingComment && (
              <div
                className="absolute z-20"
                style={{
                  left: `${pendingComment.position.x}%`,
                  top: `${pendingComment.position.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="w-8 h-8 rounded-full bg-[#2D6A4F] border-2 border-[#40916C] flex items-center justify-center text-white animate-pulse shadow-lg shadow-[#2D6A4F]/30">
                  <span className="text-xs font-semibold">
                    {comments.length + 1}
                  </span>
                </div>

                {/* Comment input popover — flip up when pin is near bottom edge */}
                <div
                  className={[
                    "absolute left-1/2 -translate-x-1/2 w-72 bg-[#161616] border border-[#2A2A2A] rounded-lg p-2.5 shadow-2xl",
                    pendingPopoverOpensUp
                      ? "bottom-full mb-3"
                      : "top-full mt-3",
                  ].join(" ")}
                  onClick={(e) => e.stopPropagation()}
                >
                  {pendingPopoverOpensUp ? (
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[#161616] border-r border-b border-[#2A2A2A]" />
                  ) : (
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[#161616] border-l border-t border-[#2A2A2A]" />
                  )}
                  
                  {/* Comment textarea */}
                  <textarea
                    ref={commentInputRef}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write your comment..."
                    className="w-full bg-[#1A1A1A] border border-[#242424] rounded px-2.5 py-2 text-sm text-[#E0E0E0] placeholder:text-[#444444] resize-none focus:outline-none focus:border-[#2D6A4F] transition-colors"
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.metaKey) {
                        handleCommentSubmit();
                      }
                    }}
                  />

                  {/* Custom tag input */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <Tag size={10} className="text-[#555555] shrink-0" />
                    <input
                      type="text"
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomTag();
                        }
                      }}
                      placeholder="Add tag..."
                      className="flex-1 bg-transparent border-none text-[11px] text-[#E0E0E0] placeholder:text-[#444444] focus:outline-none"
                    />
                  </div>

                  {/* Selected tags + Quick tag suggestions */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {pendingTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[#1B4332] text-[#40916C] border border-[#2D6A4F]"
                      >
                        #{tag}
                        <button
                          onClick={() => toggleTag(tag)}
                          className="hover:text-white ml-0.5"
                        >
                          <X size={8} />
                        </button>
                      </span>
                    ))}
                    {TAG_SUGGESTIONS.slice(0, 4)
                      .filter((tag) => !pendingTags.includes(tag))
                      .map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-[#2A2A2A] text-[#555555] hover:border-[#2D6A4F]/50 hover:text-[#40916C] transition-all"
                        >
                          {tag}
                        </button>
                      ))}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end items-center gap-2 mt-2.5 pt-2 border-t border-[#1F1F1F]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingComment(null);
                        setCommentText("");
                        setPendingTags([]);
                        setCustomTag("");
                      }}
                      className="px-2 py-1 text-[10px] text-[#555555] hover:text-[#888888] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCommentSubmit();
                      }}
                      disabled={!commentText.trim()}
                      className="px-2.5 py-1 bg-[#2D6A4F] text-white rounded text-[10px] font-medium hover:bg-[#40916C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Pin
                    </button>
                  </div>
                </div>
              </div>
            )}
            </GalleryMediaStack>
            )}
          </div>

          {/* Vertical media rail — same affordance as the patron feed card */}
          {viewMode === "gallery" && !isVideoPost && multiImage && !mediaExpanded ? (
            <MediaEdgeRail
              count={imageUrls.length}
              activeIndex={activeMediaIndex}
              onSelect={(idx) => setStackIndex(idx)}
              className="absolute right-3 top-1/2 z-30 -translate-y-1/2"
              onActionMenuOpenChange={setRadialMenuOpen}
              actions={[
                {
                  kind: "favorite",
                  label: "Favorite",
                  active: isFavorited,
                    onSelect: toggleFavorite
                },
                {
                  kind: "snip",
                  label: "Snip",
                  disabled: !snipTarget,
                  onSelect: () => {
                    if (snipTarget) setSnipDialogOpen(true);
                  }
                },
                {
                  kind: "comment",
                  label: "Comment",
                  disabled: isVideoPost,
                  onSelect: enterCommentMode
                }
              ]}
            />
          ) : null}
        </div>

        {/* Faded chrome while art is expanded */}
        <div
          className={[
            "flex min-h-0 flex-col transition-opacity duration-300 ease-out",
            viewMode === "gallery" && mediaExpanded ? "pointer-events-none opacity-[0.22]" : "opacity-100",
          ].join(" ")}
          aria-hidden={viewMode === "gallery" && mediaExpanded}
        >
        {/* Comment button with side actions */}
        {viewMode === "gallery" && (
          <div className="relative z-20 flex shrink-0 justify-center items-center gap-1 border-t border-[#1A1A1A] bg-[#0E0E0E] py-1">
            {/* Favorite button - left wing */}
            <button
              onClick={toggleFavorite}
              className={[
                "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
                isFavorited
                  ? "text-[#40916C] border border-[#2D6A4F] bg-[#0D1F17]"
                  : "text-[#555555] border border-[#2A2A2A] bg-[#0E0E0E] hover:text-[#40916C] hover:border-[#2D6A4F]/50",
              ].join(" ")}
              aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={isFavorited}
              title="Favorite"
            >
              <Star size={14} fill={isFavorited ? "currentColor" : "none"} />
            </button>

            {/* Pin a comment button - center (hover shows pin preview on image) */}
            <button
              type="button"
              disabled={isVideoPost}
              title={
                isVideoPost
                  ? "Pinned comments apply to images only"
                  : prefersThreadComposer
                    ? "Add a comment in the thread panel"
                    : undefined
              }
              onClick={enterCommentMode}
              onMouseEnter={
                viewMode === "gallery" && !prefersThreadComposer
                  ? onCommentButtonEnter
                  : undefined
              }
              onMouseLeave={
                viewMode === "gallery" && !prefersThreadComposer
                  ? onCommentButtonLeave
                  : undefined
              }
              onFocus={
                viewMode === "gallery" && !prefersThreadComposer
                  ? onCommentButtonEnter
                  : undefined
              }
              onBlur={
                viewMode === "gallery" && !prefersThreadComposer
                  ? onCommentButtonLeave
                  : undefined
              }
              className={[
                "group flex items-center gap-1.5 px-3 py-1.5 bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg text-xs transition-all",
                isVideoPost
                  ? "cursor-not-allowed opacity-40 text-[#555555]"
                  : "text-[#555555] hover:text-[#40916C] hover:border-[#2D6A4F]/50",
              ].join(" ")}
              aria-label={
                prefersThreadComposer
                  ? "Add a comment in the thread panel on the right"
                  : "Leave a pinned comment on this image. Hover to preview pins on the image."
              }
            >
              <Crosshair size={12} className="group-hover:rotate-45 transition-transform" />
              {prefersThreadComposer ? "Comment in thread" : "Comment"}
              {comments.length > 0 && (
                <span className="opacity-60">({comments.length})</span>
              )}
            </button>

            {/* Snip button - right wing */}
            <button
              type="button"
              onClick={() => {
                if (snipTarget) setSnipDialogOpen(true);
              }}
              disabled={!snipTarget}
              className={[
                "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
                snipTarget
                  ? "text-[#555555] border border-[#2A2A2A] bg-[#0E0E0E] hover:text-[#40916C] hover:border-[#2D6A4F]/50"
                  : "cursor-not-allowed opacity-40 text-[#555555] border border-[#2A2A2A] bg-[#0E0E0E]",
              ].join(" ")}
              aria-label="Snip this image"
              title="Snip"
            >
              <Loader size={14} />
            </button>
          </div>
        )}

        {/* Info panel */}
        {viewMode === "gallery" && (
          <div className="relative z-10 shrink-0 rounded-b-xl border-t border-[#1A1A1A] bg-[#161616] p-5">
            {entitlementStrip ? (
              <div className="mb-4 rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2.5">
                {entitlementStrip}
              </div>
            ) : null}

            {/* Title and description */}
            <h1 className="text-xl font-semibold text-[#F0F0F0] mb-2 text-balance">
              {post.title}
            </h1>
            <p className="text-sm text-[#5A5A5A] leading-relaxed mb-4">
              {post.description || post.excerpt}
            </p>

            {/* Community tags */}
            {post.communityTags && post.communityTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4 pb-4 border-b border-[#1A1A1A]">
                {post.communityTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full bg-[#0D1F17] text-[#40916C] border border-[#1B4332]/50 hover:border-[#2D6A4F] cursor-pointer transition-colors"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Action bar */}
            <div className="flex items-center gap-4">
              <button
              onClick={toggleLike}
                className={[
                  "flex items-center gap-1.5 text-sm transition-colors",
                  liked
                    ? "text-[#40916C]"
                    : "text-[#5A5A5A] hover:text-[#9CA3AF]",
                ].join(" ")}
                aria-label={liked ? "Unlike" : "Like"}
                aria-pressed={liked}
              >
                <Heart
                  size={16}
                  fill={liked ? "currentColor" : "none"}
                />
                {post.likeCount + (liked ? 1 : 0)}
              </button>

              <button
                onClick={emitShareClick}
                className="flex items-center gap-1.5 text-sm text-[#5A5A5A] hover:text-[#9CA3AF] transition-colors"
                aria-label="Share"
              >
                <Share2 size={16} />
                Share
              </button>

            </div>
          </div>
        )}
        </div>
      </div>

      {/* Expanded art: dim veil + perspective “pop toward camera” (no letterbox FLIP / lateral pan) */}
      {mediaExpanded && viewMode === "gallery" ? (
        <div
          className="fixed inset-0 z-[100] flex animate-[fadeIn_0.2s_ease-out] items-center justify-center bg-black/55 p-4 backdrop-blur-[1px] sm:p-8 [perspective:min(1100px,100vw)]"
          onClick={collapseExpanded}
          role="presentation"
        >
          <div
            className="max-h-[min(92vh,900px)] max-w-[min(96vw,1200px)] overflow-auto overscroll-contain touch-pan-x touch-pan-y [transform-style:preserve-3d]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="origin-center [transform-style:preserve-3d] motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:transform-none animate-[patron-art-pop-out_0.46s_cubic-bezier(0.22,1,0.36,1)_both]">
              {isVideoPost ? (
                <div
                  ref={expandedStackRef}
                  className="relative mx-auto flex w-max max-w-full flex-col items-center justify-center outline-none"
                  onClick={handleExpandedStackClick}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      collapseExpanded();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Enlarged video — click outside the player or press Enter to return to post"
                >
                  <PatronFeedVideo
                    src={playbackSrc}
                    poster={posterSrc}
                    controls
                    muted={false}
                    preload="metadata"
                    className="max-h-[min(92vh,900px)] max-w-[min(96vw,1200px)] object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <>
                  <GalleryMediaStack
                    stackRef={expandedStackRef}
                    imageUrls={imageUrls}
                    displayIndex={stackIndex}
                    onDisplayIndexChange={multiImage ? setStackIndex : undefined}
                    enableStackWheel={multiImage}
                    visualStack={multiImage}
                    title={post.title}
                    comments={comments}
                    pinLayerVisible={pinLayerVisible}
                    ghostPins={false}
                    cascadeEnter={(i) => i * 42}
                    cascadeExit={(i) => (comments.length - 1 - i) * 36}
                    surfaceClassName="relative mx-auto flex w-max max-w-full flex-col items-center justify-center outline-none"
                    imgClassName="pointer-events-none max-h-[min(92vh,900px)] max-w-[min(96vw,1200px)] object-contain"
                    onClick={handleExpandedStackClick}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        collapseExpanded();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={
                      multiImage
                        ? "Enlarged artwork — scroll or arrow keys to move between images; click to return to post"
                        : "Enlarged artwork — click to return to post"
                    }
                  />
                  {multiImage ? (
                    <p className="pointer-events-none mt-3 text-center text-xs text-white/70 tabular-nums">
                      {stackIndex + 1} / {imageUrls.length}
                      <span className="text-white/45"> · scroll or ↑↓</span>
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <SnipToCollectionDialog
        open={snipDialogOpen}
        target={snipTarget}
        onClose={() => setSnipDialogOpen(false)}
      />
    </div>
  );
}
