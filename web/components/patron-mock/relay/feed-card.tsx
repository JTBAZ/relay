"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Loader,
} from "lucide-react";
import type { FeedPost } from "@/lib/relay-fixtures";
import { GalleryMediaStack } from "./gallery-media-stack";

const MEDIA_ICONS = {
  writing: FileText,
  photo: ImageIcon,
  audio: Music,
  video: Video,
} as const;

interface FeedCardProps {
  post: FeedPost;
  onClick?: () => void;
}

/** Matches gallery pin-preview: comment chrome → image surface, with timed hide */
type PinPreviewPhase = "hidden" | "chrome" | "image";

export function FeedCard({ post, onClick }: FeedCardProps) {
  const [liked, setLiked] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [inlineFavorite, setInlineFavorite] = useState(false);

  const isDiscovery = post.kind === "discovery";
  const MediaIcon = MEDIA_ICONS[post.mediaType] ?? FileText;
  const layout = post.feedCardLayout ?? "classic";

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

  const cardComments = post.comments ?? [];

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

  return (
    <article
      onClick={onClick}
      className={[
        "group relative rounded-lg border transition-colors duration-150 overflow-hidden",
        isDiscovery
          ? "bg-[#131313] border-[#232323] border-l-2 border-l-[#1B4332]"
          : "bg-[#161616] border-[#242424] hover:border-[#2E2E2E]",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
      aria-label={`${isDiscovery ? "Discover: " : ""}${post.title} by ${post.creator.displayName}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {/* Discovery label strip */}
      {isDiscovery && (
        <div className="flex items-center gap-2 px-5 pt-4">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-widest uppercase border border-[#2D6A4F]/50 text-[#40916C] bg-[#0D1F17]/60">
            Free to read
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
                {!isDiscovery && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#0D1F17] text-[#40916C] border border-[#1B4332]/70 shrink-0">
                    <span
                      className="w-1 h-1 rounded-full bg-[#2D6A4F] inline-block"
                      aria-hidden="true"
                    />
                    Following
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
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
          <div className="flex items-center gap-2 shrink-0">
            {isDiscovery && (
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
              {post.publishedAt}
            </time>
          </div>
        </div>

        {/* Inline hero + pins (A/B vs classic thumb) — opens same GalleryView on card click */}
        {layout === "inlineMedia" && post.coverImageUrl ? (
          <div className="-mx-5 mb-4 border-y border-[#1C1C1C] bg-[#0E0E0E]">
            <GalleryMediaStack
              imageUrls={imageUrls}
              displayIndex={0}
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
              surfaceClassName="relative flex w-full min-w-0 max-w-full flex-col items-center justify-center outline-none"
              imgClassName="pointer-events-none h-auto w-auto max-h-[min(42vh,320px)] max-w-full object-contain"
              onMouseEnter={onImageSurfaceEnter}
              onMouseLeave={onImageSurfaceLeave}
            />
            {/* Condensed gallery chrome — rail hover bridges to image (pins readable via CommentPin tooltips) */}
            <div
              className="relative z-10 shrink-0 border-t border-[#1A1A1A] bg-[#0E0E0E] opacity-[0.38] transition-opacity duration-200 ease-out hover:opacity-100 focus-within:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center items-center gap-0.5 py-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInlineFavorite((v) => !v);
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
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={onCommentChromeEnter}
                  onMouseLeave={onCommentChromeLeave}
                  onFocus={onCommentChromeEnter}
                  onBlur={onCommentChromeLeave}
                  className="group flex items-center gap-1 px-2 py-1 bg-[#0E0E0E] border border-[#2A2A2A] rounded-md text-[#555555] text-[11px] leading-tight hover:text-[#40916C] hover:border-[#2D6A4F]/50 transition-all"
                  aria-label="Preview pinned comments on image. Hover pins on the image to read. Click card for full gallery."
                >
                  <Crosshair size={11} className="group-hover:rotate-45 transition-transform shrink-0" />
                  <span>Comment</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className={[
                    "flex items-center justify-center w-7 h-7 rounded-md transition-all",
                    "text-[#555555] border border-[#2A2A2A] bg-[#0E0E0E] hover:text-[#40916C] hover:border-[#2D6A4F]/50",
                  ].join(" ")}
                  aria-label="Snip this image"
                  title="Snip"
                >
                  <Loader size={12} />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Body: title + excerpt + optional thumbnail (classic only) */}
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <h2
              className={[
                "font-semibold leading-snug mb-2 text-balance",
                isDiscovery
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

          {layout === "classic" && post.coverImageUrl && (
            <div
              className={[
                "shrink-0 rounded-md overflow-hidden bg-[#2A2A2A]",
                isDiscovery ? "w-[108px] h-[72px]" : "w-[124px] h-[80px]",
              ].join(" ")}
              aria-hidden="true"
            >
              <img
                src={post.coverImageUrl}
                alt=""
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-150"
                width={124}
                height={80}
              />
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
              setLiked(!liked);
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
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150"
            aria-label="View comments"
          >
            <MessageCircle size={12} aria-hidden="true" />
            {post.commentCount}
          </button>

          {/* Tier badge */}
          <div className="ml-auto">
            <span
              className={[
                "text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold",
                post.tierLabel === "Free"
                  ? "bg-[#0D1F17] text-[#2D6A4F] border border-[#1B4332]/50"
                  : "text-[#3A3A3A] border border-[#222222]",
              ].join(" ")}
              aria-label={`Tier: ${post.tierLabel}`}
            >
              {post.tierLabel}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
