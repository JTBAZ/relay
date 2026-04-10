"use client";

import { useState } from "react";
import {
  Heart,
  MessageCircle,
  FileText,
  ImageIcon,
  Music,
  Video,
  UserPlus,
  Check,
} from "lucide-react";
import type { FeedPost } from "@/lib/relay-fixtures";

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

export function FeedCard({ post, onClick }: FeedCardProps) {
  const [liked, setLiked] = useState(false);
  const [followed, setFollowed] = useState(false);

  const isDiscovery = post.kind === "discovery";
  const MediaIcon = MEDIA_ICONS[post.mediaType] ?? FileText;

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

        {/* Body: title + excerpt + optional thumbnail */}
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

          {post.coverImageUrl && (
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
