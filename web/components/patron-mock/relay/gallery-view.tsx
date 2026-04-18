"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X,
  Heart,
  Share2,
  ChevronLeft,
  Crosshair,
  Tag,
  Star,
  Loader,
} from "lucide-react";
import type { FeedPost, PositionalComment } from "@/lib/relay-fixtures";
import { GalleryMediaStack } from "./gallery-media-stack";

interface GalleryViewProps {
  post: FeedPost;
  onClose: () => void;
  onNavigate?: (direction: "prev" | "next") => void;
  hasPrev?: boolean;
  hasNext?: boolean;
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

export function GalleryView({
  post,
  onClose,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: GalleryViewProps) {
  const [liked, setLiked] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [comments, setComments] = useState<PositionalComment[]>(
    post.comments || []
  );
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
  const [stackIndex, setStackIndex] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);
  const imageSurfaceRef = useRef<HTMLDivElement>(null);
  const expandedStackRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    setMediaExpanded(false);
    setStackIndex(0);
  }, [post.id]);

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

  const imageUrls = useMemo(() => {
    if (post.galleryImageUrls && post.galleryImageUrls.length > 0) {
      return post.galleryImageUrls;
    }
    const single =
      post.highResImageUrl ||
      post.coverImageUrl ||
      "/placeholder.svg?height=800&width=1200";
    return [single];
  }, [post.galleryImageUrls, post.highResImageUrl, post.coverImageUrl]);

  const multiImage = imageUrls.length > 1;

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

  const handleCommentSubmit = () => {
    if (!pendingComment || !commentText.trim()) return;

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
    clearPreviewHideTimer();
    pinPreviewBridgeRef.current = false;
    setPinPreviewPhase("hidden");
    collapseExpanded();
    setViewMode("comment");
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
      {viewMode === "comment" && !pendingComment && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1B4332] border border-[#2D6A4F] text-[#40916C] text-sm font-medium shadow-lg">
          <Crosshair size={14} />
          Click anywhere on the image to leave a comment
        </div>
      )}

      {/* Main content — scroll the card when image + chrome + copy exceed the viewport */}
      <div
        className={[
          "relative z-10 mx-4 flex w-full max-w-6xl min-h-0 max-h-[90vh] flex-col overflow-x-hidden overscroll-contain transition-all duration-300 animate-[scaleIn_0.2s_ease-out]",
          viewMode === "comment"
            ? "max-w-5xl overflow-y-visible"
            : "overflow-y-auto",
        ].join(" ")}
      >
        {/* Letterbox media — not painted while expanded overlay is shown (avoids duplicate img compositing) */}
        <div
          ref={imageRef}
          className={[
            "relative z-0 isolate flex flex-col justify-center rounded-t-xl group",
            /* Gallery: shrink-0 so the preview is never flex-squashed (was flex-1 + overflow-hidden clipping object-contain). Comment: keep flex-1 for pin canvas. */
            viewMode === "comment"
              ? "min-h-0 flex-1 cursor-crosshair overflow-visible bg-[#0A0A0A]"
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
            <GalleryMediaStack
              stackRef={imageSurfaceRef}
              imageUrls={imageUrls}
              displayIndex={0}
              visualStack={false}
              title={post.title}
              comments={comments}
              pinLayerVisible={pinLayerVisible}
              ghostPins={viewMode === "comment"}
              cascadeEnter={(i) => i * 42}
              cascadeExit={(i) => (comments.length - 1 - i) * 36}
              surfaceClassName={[
                "relative flex w-full max-w-full flex-col items-center justify-center outline-none",
                viewMode === "comment" ? "max-h-[60vh]" : "",
                viewMode === "gallery" ? "cursor-zoom-in" : "",
              ].join(" ")}
              imgClassName="pointer-events-none h-auto w-auto max-h-[60vh] max-w-full object-contain"
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
          </div>
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
              onClick={() => setIsFavorited(!isFavorited)}
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
              onClick={enterCommentMode}
              onMouseEnter={onCommentButtonEnter}
              onMouseLeave={onCommentButtonLeave}
              onFocus={onCommentButtonEnter}
              onBlur={onCommentButtonLeave}
              className="group flex items-center gap-1.5 px-3 py-1.5 bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg text-[#555555] text-xs hover:text-[#40916C] hover:border-[#2D6A4F]/50 transition-all"
              aria-label="Leave a pinned comment on this image. Hover to preview pins on the image."
            >
              <Crosshair size={12} className="group-hover:rotate-45 transition-transform" />
              Comment
              {comments.length > 0 && (
                <span className="opacity-60">({comments.length})</span>
              )}
            </button>

            {/* Snip button - right wing */}
            <button
              className={[
                "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
                "text-[#555555] border border-[#2A2A2A] bg-[#0E0E0E] hover:text-[#40916C] hover:border-[#2D6A4F]/50",
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
          <div className="relative z-10 shrink-0 rounded-b-xl border-t border-[#1A1A1A] bg-[#0E0E0E] p-5">
            {/* Artist info row */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full overflow-hidden bg-[#2A2A2A] ring-2 ring-[#1A1A1A]">
                  <img
                    src={post.creator.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    width={44}
                    height={44}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#F0F0F0]">
                      {post.creator.displayName}
                    </span>
                    <span className="text-xs text-[#555555]">
                      @{post.creator.handle}
                    </span>
                  </div>
                  <span className="text-xs text-[#444444]">
                    {post.creator.discipline}
                  </span>
                </div>
              </div>
            </div>

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
                onClick={() => setLiked(!liked)}
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
                className="flex items-center gap-1.5 text-sm text-[#5A5A5A] hover:text-[#9CA3AF] transition-colors"
                aria-label="Share"
              >
                <Share2 size={16} />
                Share
              </button>

              <span className="ml-auto text-xs text-[#444444]">
                {post.publishedAt}
              </span>
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
