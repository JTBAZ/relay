"use client"

import { useState } from "react"

// ─── Shared prop type ────────────────────────────────────────────────────────

export type PlatformPreviewProps = {
  /** Compiled post text (body + hashtags for X/Bluesky; description for others). */
  postText: string
  /** Post title — used by Patreon and DeviantArt only. */
  title?: string | null
  /** Tag array (already normalised: "#tag" for X, "tag" for DA). */
  tags?: string[]
  /** First image preview URL from the user's staged media. Pass null if none. */
  imageUrl?: string | null
  /** Whether more than one image is attached (shows "+N more" badge). */
  extraImageCount?: number
  /** Creator display name — shown in the platform chrome. Default: "Your name". */
  creatorName?: string
  /** Creator avatar URL. Default: a generic dark circle placeholder. */
  avatarUrl?: string | null
}

// ─── Inline SVG atoms ────────────────────────────────────────────────────────

function AvatarPlaceholder({ size = 40, url }: { size?: number; url?: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt="avatar"
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className="rounded-full flex-shrink-0"
    >
      <rect width="40" height="40" rx="20" fill="#d1d5db" />
      <circle cx="20" cy="16" r="7" fill="#9ca3af" />
      <path d="M4 38c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="#9ca3af" />
    </svg>
  )
}

function XVerifiedBadge() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-label="Verified">
      <circle cx="12" cy="12" r="12" fill="#1d9bf0" />
      <path d="M7 12.5l3.5 3.5 6.5-7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BlueSkyButterfly() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-label="Bluesky">
      <path
        d="M12 10C10 6 6 4 4 6c-2 2-1 6 2 7 1.5.5 3 0 4-1"
        stroke="#0085ff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M12 10C14 6 18 4 20 6c2 2 1 6-2 7-1.5.5-3 0-4-1"
        stroke="#0085ff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M12 10v7" stroke="#0085ff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// Generic action bar icons
function IconReply() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#536471" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function IconRepost() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 16V8h10M7 8l-3 3m13 5l3-3" stroke="#536471" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconLike({ color = "#536471" }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function IconBookmark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="#536471" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function IconShare() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" stroke="#536471" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconComment({ color = "#9ca3af" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function IconFave() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="#00b33c" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function IconWatch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="#00b33c" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Text renderer — highlights #hashtags ────────────────────────────────────

function RenderedText({
  text,
  hashColor,
  className = "",
}: {
  text: string
  hashColor: string
  className?: string
}) {
  const lines = text.split("\n")
  return (
    <p className={className} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          {line.split(/(\s+)/).map((word, wi) =>
            word.startsWith("#") ? (
              <span key={wi} style={{ color: hashColor }}>
                {word}
              </span>
            ) : (
              word
            )
          )}
        </span>
      ))}
    </p>
  )
}

// ─── Image block ─────────────────────────────────────────────────────────────

function ImageBlock({
  imageUrl,
  extraImageCount = 0,
  aspectClass = "aspect-video",
  objectFit = "cover",
  maxHeight,
  bg = "#111",
}: {
  imageUrl: string
  extraImageCount?: number
  aspectClass?: string
  objectFit?: "cover" | "contain"
  maxHeight?: number
  bg?: string
}) {
  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden ${maxHeight ? "" : aspectClass}`}
      style={{ background: bg, ...(maxHeight ? { maxHeight } : {}) }}
    >
      <img
        src={imageUrl}
        alt="Post media"
        className="w-full h-full"
        style={{ objectFit, display: "block" }}
      />
      {extraImageCount > 0 && (
        <div
          className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
        >
          +{extraImageCount} more
        </div>
      )}
    </div>
  )
}

// ─── 1. X Post Preview ───────────────────────────────────────────────────────

export function XPostPreview({
  postText,
  imageUrl,
  extraImageCount = 0,
  creatorName = "Your name",
  avatarUrl,
}: PlatformPreviewProps) {
  const len = postText.length
  const counterColor = len > 280 ? "#ef4444" : len > 250 ? "#f59e0b" : "#536471"
  const handle = creatorName.toLowerCase().replace(/\s+/g, "_")

  return (
    <div
      className="w-full rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "#ffffff",
        border: "1px solid #e7e7e7",
        boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <AvatarPlaceholder size={40} url={avatarUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-bold text-sm text-[#0f1419] leading-tight">{creatorName}</span>
            <XVerifiedBadge />
            <span className="text-[#536471] text-sm">@{handle}</span>
            <span className="text-[#536471] text-sm">·</span>
            <span className="text-[#536471] text-sm">just now</span>
          </div>
          <RenderedText
            text={postText}
            hashColor="#1d9bf0"
            className="text-[15px] text-[#0f1419] leading-[1.5] mt-1"
          />
        </div>
      </div>

      {/* Image */}
      {imageUrl && (
        <ImageBlock imageUrl={imageUrl} extraImageCount={extraImageCount} aspectClass="aspect-video" />
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between pt-1" style={{ borderTop: "1px solid #eff3f4" }}>
        <div className="flex items-center gap-5">
          <button className="flex items-center gap-1 text-[#536471] hover:text-[#1d9bf0] transition-colors" aria-label="Reply">
            <IconReply />
          </button>
          <button className="flex items-center gap-1 text-[#536471] hover:text-[#00ba7c] transition-colors" aria-label="Repost">
            <IconRepost />
          </button>
          <button className="flex items-center gap-1 text-[#536471] hover:text-[#f91880] transition-colors" aria-label="Like">
            <IconLike />
          </button>
          <button className="flex items-center gap-1 text-[#536471] hover:text-[#1d9bf0] transition-colors" aria-label="Bookmark">
            <IconBookmark />
          </button>
          <button className="flex items-center gap-1 text-[#536471] hover:text-[#1d9bf0] transition-colors" aria-label="Share">
            <IconShare />
          </button>
        </div>
        <span className="text-[13px] tabular-nums" style={{ color: counterColor }}>
          {len} / 280
        </span>
      </div>
    </div>
  )
}

// ─── 2. Patreon Post Preview ─────────────────────────────────────────────────

export function PatreonPostPreview({
  postText,
  title,
  imageUrl,
  extraImageCount = 0,
  creatorName = "Your name",
  avatarUrl,
}: PlatformPreviewProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <AvatarPlaceholder size={40} url={avatarUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-[#111827]">{creatorName}</span>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,66,77,0.1)", color: "#FF424D" }}
            >
              Patron post
            </span>
          </div>
          <span className="text-xs text-[#9ca3af]">Just now</span>
        </div>
      </div>

      {/* Image */}
      {imageUrl && (
        <div className="px-0">
          <ImageBlock imageUrl={imageUrl} extraImageCount={extraImageCount} aspectClass="aspect-video" objectFit="cover" />
        </div>
      )}

      {/* Body */}
      <div className="px-4 pt-3 pb-1 flex flex-col gap-2">
        {title && (
          <h3 className="font-semibold text-base text-[#111827] leading-snug">{title}</h3>
        )}
        <div className="relative">
          <p
            className="text-sm text-[#4b5563] leading-relaxed"
            style={{
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: expanded ? undefined : 3,
              WebkitBoxOrient: "vertical",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {postText}
          </p>
          {!expanded && postText.length > 180 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-sm font-semibold mt-0.5"
              style={{ color: "#FF424D" }}
            >
              Read more
            </button>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div
        className="flex items-center gap-4 px-4 py-3 mt-1"
        style={{ borderTop: "1px solid #f3f4f6" }}
      >
        <button className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#FF424D] transition-colors">
          <IconLike color="#9ca3af" />
          Like
        </button>
        <button className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#111827] transition-colors">
          <IconComment color="#9ca3af" />
          Comment
        </button>
        <button className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#111827] transition-colors">
          <IconShare />
          Share
        </button>
      </div>
    </div>
  )
}

// ─── 3. DeviantArt Preview ───────────────────────────────────────────────────

export function DeviantArtPreview({
  postText,
  title,
  tags = [],
  imageUrl,
  extraImageCount = 0,
  creatorName = "Your name",
  avatarUrl,
}: PlatformPreviewProps) {
  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{
        background: "#1e1e2e",
        border: "1px solid #2d2d3f",
        boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <AvatarPlaceholder size={36} url={avatarUrl} />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-white">{creatorName}</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
            style={{ background: "rgba(0,179,60,0.15)", color: "#00b33c", border: "1px solid rgba(0,179,60,0.25)" }}
          >
            Deviation
          </span>
        </div>
      </div>

      {/* Title */}
      {title && (
        <div className="px-4 pb-2">
          <h3 className="font-bold text-base text-white leading-snug">{title}</h3>
        </div>
      )}

      {/* Image */}
      {imageUrl ? (
        <div
          className="w-full flex items-center justify-center"
          style={{ background: "#12121e", borderTop: "1px solid #2d2d3f", borderBottom: "1px solid #2d2d3f", minHeight: 120, maxHeight: 240 }}
        >
          <img
            src={imageUrl}
            alt="Deviation preview"
            className="max-h-60 max-w-full"
            style={{ objectFit: "contain", display: "block" }}
          />
          {extraImageCount > 0 && (
            <div
              className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
              style={{ background: "rgba(0,0,0,0.65)" }}
            >
              +{extraImageCount} more
            </div>
          )}
        </div>
      ) : null}

      {/* Description */}
      <div className="px-4 pt-3 pb-2">
        <p
          className="text-[13px] leading-relaxed"
          style={{
            color: "#9ca3af",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {postText}
        </p>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "#9ca3af",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {tag.replace(/^#/, "")}
            </span>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div
        className="flex items-center gap-4 px-4 py-3"
        style={{ borderTop: "1px solid #2d2d3f" }}
      >
        <button className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#00b33c] transition-colors">
          <IconFave />
          Fave
        </button>
        <button className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#00b33c] transition-colors">
          <IconComment color="#6b7280" />
          Comment
        </button>
        <button className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#00b33c] transition-colors">
          <IconWatch />
          +Watch
        </button>
      </div>
    </div>
  )
}

// ─── 4. Bluesky Post Preview ─────────────────────────────────────────────────

export function BlueSkyPostPreview({
  postText,
  imageUrl,
  extraImageCount = 0,
  creatorName = "Your name",
  avatarUrl,
}: PlatformPreviewProps) {
  const handle = creatorName.toLowerCase().replace(/\s+/g, "")

  return (
    <div
      className="w-full rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "#ffffff",
        border: "1px solid #e7e7e7",
        boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <AvatarPlaceholder size={40} url={avatarUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-[#0f1419] leading-tight">{creatorName}</span>
            <BlueSkyButterfly />
            <span className="text-[#536471] text-sm">@{handle}.bsky.social</span>
            <span className="text-[#536471] text-sm">·</span>
            <span className="text-[#536471] text-sm">just now</span>
          </div>
          <RenderedText
            text={postText}
            hashColor="#0085ff"
            className="text-[15px] text-[#0f1419] leading-[1.5] mt-1"
          />
        </div>
      </div>

      {/* Image */}
      {imageUrl && (
        <ImageBlock imageUrl={imageUrl} extraImageCount={extraImageCount} aspectClass="aspect-video" />
      )}

      {/* Action bar */}
      <div className="flex items-center gap-5 pt-1" style={{ borderTop: "1px solid #eff3f4" }}>
        <button className="text-[#536471] hover:text-[#0085ff] transition-colors" aria-label="Reply">
          <IconReply />
        </button>
        <button className="text-[#536471] hover:text-[#0085ff] transition-colors" aria-label="Repost">
          <IconRepost />
        </button>
        <button className="text-[#536471] hover:text-[#f91880] transition-colors" aria-label="Like">
          <IconLike />
        </button>
        <button className="text-[#536471] hover:text-[#0085ff] transition-colors" aria-label="Share">
          <IconShare />
        </button>
      </div>
    </div>
  )
}

// ─── 5. Dispatcher ───────────────────────────────────────────────────────────

export function PlatformPostPreview(
  props: PlatformPreviewProps & { destination: string }
) {
  const { destination, ...rest } = props

  switch (destination) {
    case "x":
    case "twitter":
      return <XPostPreview {...rest} />
    case "patreon":
      return <PatreonPostPreview {...rest} />
    case "deviantart":
      return <DeviantArtPreview {...rest} />
    case "bluesky":
      return <BlueSkyPostPreview {...rest} />
    default:
      return <XPostPreview {...rest} />
  }
}
