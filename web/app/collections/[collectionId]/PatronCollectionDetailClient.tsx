"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Lock,
  Monitor,
  Search,
  Tag,
  Trash2,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { EntitlementBadge } from "@/components/patron/GatedTile";
import {
  patronCollectionLockedTierMessage,
  patronCollectionLockedTierSubscript,
} from "@/lib/patron-collection-locked-access";
import {
  fetchPatronCollectionDetail,
  patronCollectionDetailContentUrl,
  patronCollectionDetailThumbUrl,
  patronCollectionMediaPageLabel,
  patronCollectionPostDetailHref,
  patronCreatorProfileHref,
  removePatronCollectionEntry,
  RelayApiError,
  type PatronCollectionDetailEntry,
  type PatronOwnerCollectionDetail,
} from "@/lib/relay-api";

type MediaKind = "image" | "video" | "text";
type FilterKind = MediaKind | "all";
type SortKind = "date" | "name" | "creator";
type MobilePane = "grid" | "viewer";

type FallbackPagePosition = {
  index: number;
  count: number;
  label: string;
};

const TYPE_OPTIONS: Array<{ label: string; value: FilterKind }> = [
  { label: "All", value: "all" },
  { label: "Image", value: "image" },
  { label: "Video", value: "video" },
  { label: "Text", value: "text" },
];

const TYPE_CONFIG: Record<
  MediaKind,
  { label: string; Icon: LucideIcon; color: string; badge: string }
> = {
  image: {
    label: "IMAGE",
    Icon: ImageIcon,
    color: "text-blue-300",
    badge: "border-blue-400/15 bg-blue-400/5",
  },
  video: {
    label: "VIDEO",
    Icon: Video,
    color: "text-emerald-300",
    badge: "border-emerald-400/15 bg-emerald-400/5",
  },
  text: {
    label: "TEXT",
    Icon: FileText,
    color: "text-purple-300",
    badge: "border-purple-400/15 bg-purple-400/5",
  },
};

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function mediaTypeLabel(mimeType: string | undefined): string {
  if (!mimeType) return "Media";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  return mimeType.split("/")[0] ?? "Media";
}

function mediaKind(mimeType: string | undefined): MediaKind {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  return "text";
}

function creatorInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "C";
}

function creatorDisplayFallback(handleOrId: string): string {
  const lastToken = handleOrId
    .trim()
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .at(-1);
  if (!lastToken) return "Creator";
  return `${lastToken.slice(0, 1).toUpperCase()}${lastToken.slice(1)}`;
}

function mediaSortKey(mediaId: string): string {
  const numericSuffix = mediaId.match(/(\d+)$/)?.[1];
  return numericSuffix ? numericSuffix.padStart(8, "0") : mediaId;
}

function fallbackGroupKey(entry: PatronCollectionDetailEntry): string {
  const title = entry.source_post_title?.trim().toLowerCase();
  if (title) {
    return `${entry.creator_id}:title:${title}`;
  }
  return `${entry.creator_id}:post:${entry.post_id}`;
}

function fallbackPageLabels(
  entries: ReadonlyArray<PatronCollectionDetailEntry>
): Map<string, FallbackPagePosition> {
  const byPost = new Map<string, PatronCollectionDetailEntry[]>();
  for (const entry of entries) {
    const key = fallbackGroupKey(entry);
    byPost.set(key, [...(byPost.get(key) ?? []), entry]);
  }

  const labels = new Map<string, FallbackPagePosition>();
  for (const group of Array.from(byPost.values())) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) =>
      mediaSortKey(a.media_id).localeCompare(mediaSortKey(b.media_id))
    );
    ordered.forEach((entry, idx) => {
      const index = idx + 1;
      const count = ordered.length;
      labels.set(entry.entry_id, {
        index,
        count,
        label: `${index} of ${count}`,
      });
    });
  }
  return labels;
}

function entryAddedAt(entry: PatronCollectionDetailEntry): number {
  const t = new Date(entry.created_at).getTime();
  return Number.isFinite(t) ? t : 0;
}

function entryPostOrder(
  entry: PatronCollectionDetailEntry,
  fallbackPagePosition: FallbackPagePosition | null | undefined
): number {
  return entry.source_media_index ?? fallbackPagePosition?.index ?? Number.MAX_SAFE_INTEGER;
}

function comparePostOrder(
  a: PatronCollectionDetailEntry,
  b: PatronCollectionDetailEntry,
  fallbackLabels: ReadonlyMap<string, FallbackPagePosition>
): number {
  const byIndex =
    entryPostOrder(a, fallbackLabels.get(a.entry_id)) -
    entryPostOrder(b, fallbackLabels.get(b.entry_id));
  if (byIndex !== 0) return byIndex;
  return mediaSortKey(a.media_id).localeCompare(mediaSortKey(b.media_id));
}

function sortByCollectionContinuity(
  entries: ReadonlyArray<PatronCollectionDetailEntry>,
  fallbackLabels: ReadonlyMap<string, FallbackPagePosition>
): PatronCollectionDetailEntry[] {
  const groups = new Map<string, PatronCollectionDetailEntry[]>();
  for (const entry of entries) {
    const key = fallbackGroupKey(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return Array.from(groups.values())
    .map((group) => ({
      firstAddedAt: Math.min(...group.map(entryAddedAt)),
      entries: [...group].sort((a, b) => comparePostOrder(a, b, fallbackLabels)),
    }))
    .sort((a, b) => a.firstAddedAt - b.firstAddedAt)
    .flatMap((group) => group.entries);
}

function creatorHandle(entry: PatronCollectionDetailEntry): string {
  return entry.creator_handle?.trim() || entry.creator_id;
}

function creatorName(entry: PatronCollectionDetailEntry): string {
  return (
    entry.creator_display_name?.trim() ||
    entry.creator_handle?.trim() ||
    creatorDisplayFallback(creatorHandle(entry))
  );
}

function entryTitle(entry: PatronCollectionDetailEntry): string {
  return entry.source_post_title?.trim() || `Post ${shortId(entry.post_id)}`;
}

function pageLabelFor(
  entry: PatronCollectionDetailEntry,
  fallbackPagePosition: FallbackPagePosition | null | undefined
): string {
  const backendPageLabel = patronCollectionMediaPageLabel(
    entry.source_media_index,
    entry.source_media_count
  );
  const pageLabel =
    fallbackPagePosition &&
    fallbackPagePosition.count > (entry.source_media_count ?? 0)
      ? fallbackPagePosition.label
      : backendPageLabel ?? fallbackPagePosition?.label ?? null;
  return pageLabel ?? "1 of 1";
}

function creatorColor(entry: PatronCollectionDetailEntry): string {
  const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#2D6A4F"];
  let acc = 0;
  for (const char of creatorHandle(entry)) {
    acc += char.charCodeAt(0);
  }
  return colors[acc % colors.length] ?? "#2D6A4F";
}

function entryImageUrl(entry: PatronCollectionDetailEntry): string | null {
  return (
    patronCollectionDetailThumbUrl(entry.thumb_url_path) ??
    patronCollectionDetailContentUrl(entry.content_url_path)
  );
}

function entryContentUrl(entry: PatronCollectionDetailEntry): string | null {
  return (
    patronCollectionDetailContentUrl(entry.content_url_path) ??
    patronCollectionDetailThumbUrl(entry.thumb_url_path)
  );
}

function entryTags(entry: PatronCollectionDetailEntry): string[] {
  const kind = mediaKind(entry.mime_type);
  return [
    kind,
    entry.viewer_entitlement.state,
    creatorName(entry).toLowerCase(),
  ];
}

function CollectionFilterBar({
  searchQuery,
  setSearchQuery,
  activeType,
  setActiveType,
  activeCreator,
  setActiveCreator,
  sortBy,
  setSortBy,
  creators,
}: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  activeType: FilterKind;
  setActiveType: (value: FilterKind) => void;
  activeCreator: string;
  setActiveCreator: (value: string) => void;
  sortBy: SortKind;
  setSortBy: (value: SortKind) => void;
  creators: string[];
}) {
  return (
    <div className="shrink-0 space-y-2.5 border-b border-[#1f1f1f] px-3 pb-2.5 pt-3">
      <div className="relative">
        <Search
          size={13}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
          aria-hidden
        />
        <input
          type="text"
          placeholder="Search title, creator, tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 w-full rounded-md border border-transparent bg-[#111111] pl-8 pr-3 text-xs text-[#F9FAFB] outline-none transition-colors placeholder:text-[#555555] focus:border-[#2A2A2A]"
        />
      </div>

      <div className="flex gap-1">
        {TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setActiveType(option.value)}
            className={[
              "h-8 flex-1 rounded text-[11px] font-medium transition-all",
              activeType === option.value
                ? "bg-[#40916C] text-white"
                : "bg-[#111111] text-[#6B7280] hover:bg-[#171717] hover:text-[#E5E7EB]",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <select
            value={activeCreator}
            onChange={(e) => setActiveCreator(e.target.value)}
            className="h-8 w-full appearance-none rounded border border-transparent bg-[#111111] pl-2.5 pr-7 text-xs text-[#E5E7EB] outline-none transition-colors focus:border-[#2A2A2A]"
          >
            <option value="all">All Creators</option>
            {creators.map((creator) => (
              <option key={creator} value={creator}>
                {creator}
              </option>
            ))}
          </select>
          <ChevronDown
            size={11}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280]"
            aria-hidden
          />
        </div>

        <div className="relative">
          <ArrowUpDown
            size={11}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#6B7280]"
            aria-hidden
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKind)}
            className="h-8 appearance-none rounded border border-transparent bg-[#111111] pl-6 pr-7 text-xs text-[#E5E7EB] outline-none transition-colors focus:border-[#2A2A2A]"
          >
            <option value="date">Added</option>
            <option value="name">Name</option>
            <option value="creator">Creator</option>
          </select>
          <ChevronDown
            size={11}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280]"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}

function CollectionTagCloud({
  allTags,
  activeTags,
  onToggleTag,
}: {
  allTags: string[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
}) {
  if (allTags.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-[#1f1f1f] px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Tag size={11} className="text-[#6B7280]" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6B7280]">
          Tags
        </span>
        {activeTags.length > 0 ? (
          <span className="ml-auto text-[10px] font-medium text-[#40916C]">
            {activeTags.length} active
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {allTags.map((tag) => {
          const active = activeTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleTag(tag)}
              className={[
                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all",
                active
                  ? "border-[#40916C]/70 bg-[#40916C] text-white"
                  : "border-transparent bg-[#151515] text-[#6B7280] hover:border-[#2A2A2A] hover:bg-[#1A1A1A] hover:text-[#E5E7EB]",
              ].join(" ")}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TypeBadge({ kind }: { kind: MediaKind }) {
  const config = TYPE_CONFIG[kind];
  const Icon = config.Icon;
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5",
        config.badge,
      ].join(" ")}
    >
      <Icon size={10} className={config.color} aria-hidden />
      <span className={["font-mono text-[10px] font-bold tracking-widest", config.color].join(" ")}>
        {config.label}
      </span>
    </span>
  );
}

function CreatorAvatar({
  entry,
  size = "md",
}: {
  entry: PatronCollectionDetailEntry;
  size?: "sm" | "md";
}) {
  const avatar = entry.creator_avatar_url?.trim();
  const name = creatorName(entry);
  const dimensions = size === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]";

  return (
    <span
      className={[
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        dimensions,
      ].join(" ")}
      style={{ backgroundColor: creatorColor(entry) }}
      aria-hidden
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        creatorInitial(name)
      )}
    </span>
  );
}

function CollectionMediaCard({
  entry,
  selected,
  index,
  fallbackPagePosition,
  onSelect,
}: {
  entry: PatronCollectionDetailEntry;
  selected: boolean;
  index: number;
  fallbackPagePosition: FallbackPagePosition | null;
  onSelect: (entry: PatronCollectionDetailEntry) => void;
}) {
  const kind = mediaKind(entry.mime_type);
  const imageUrl = entryImageUrl(entry);
  const title = entryTitle(entry);
  const pageLabel = pageLabelFor(entry, fallbackPagePosition);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={[
        "group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all duration-300 ease-out",
        selected
          ? "border-[#40916C]/80 bg-[#0D1F17] shadow-[0_0_0_1px_rgba(64,145,108,0.35)]"
          : "border-[#242424] bg-[#111111] hover:-translate-y-0.5 hover:border-[#343434] hover:bg-[#151515]",
      ].join(" ")}
      style={{ transitionDelay: `${Math.min(index, 8) * 18}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#0A0A0A]">
        {imageUrl && kind === "video" ? (
          <video
            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
            src={imageUrl}
            muted
            playsInline
            preload="metadata"
            aria-hidden
          />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#111827] via-[#1f1830] to-[#111111] text-[#6B7280]">
            {entry.viewer_entitlement.state === "visible" ? (
              <FileText size={22} aria-hidden />
            ) : (
              <Lock size={22} aria-hidden />
            )}
          </div>
        )}
        <div className="absolute left-2 top-2">
          {entry.viewer_entitlement.state === "visible" ? (
            <TypeBadge kind={kind} />
          ) : (
            <EntitlementBadge state={entry.viewer_entitlement.state} />
          )}
        </div>
        {selected ? (
          <div className="pointer-events-none absolute inset-0 bg-[#40916C]/10" />
        ) : null}
      </div>
      <div className="flex flex-col gap-2 p-2.5">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-[#F0F0F0]">
          {title}
        </p>
        <div className="flex items-center gap-1.5">
          <CreatorAvatar entry={entry} size="sm" />
          <span className="truncate text-[11px] text-[#6B7280]">{creatorName(entry)}</span>
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[#555555]">
            {pageLabel}
          </span>
        </div>
      </div>
      {selected ? (
        <span className="absolute bottom-0 left-0 top-0 w-0.5 rounded-l-lg bg-[#40916C]" />
      ) : null}
    </button>
  );
}

function EmptyResults() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <Search size={24} className="text-[#6B7280] opacity-40" aria-hidden />
      <p className="text-sm text-[#9CA3AF]">No media matches your filters</p>
      <p className="text-xs text-[#6B7280]">Try adjusting search or removing tags.</p>
    </div>
  );
}

function CollectionMediaViewer({
  entry,
  currentIndex,
  totalFiltered,
  fallbackPagePosition,
  onPrev,
  onNext,
  onBackToGrid,
  onRemove,
  removing,
}: {
  entry: PatronCollectionDetailEntry;
  currentIndex: number;
  totalFiltered: number;
  fallbackPagePosition: FallbackPagePosition | null;
  onPrev: () => void;
  onNext: () => void;
  onBackToGrid: () => void;
  onRemove: (entry: PatronCollectionDetailEntry) => void;
  removing: boolean;
}) {
  const kind = mediaKind(entry.mime_type);
  const title = entryTitle(entry);
  const contentUrl = entryContentUrl(entry);
  const href = patronCollectionPostDetailHref(entry);
  const profileHref = patronCreatorProfileHref(creatorHandle(entry));
  const pageLabel = pageLabelFor(entry, fallbackPagePosition);
  const description =
    entry.source_post_description?.trim() ||
    `${mediaTypeLabel(entry.mime_type)} snip from ${title}.`;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalFiltered - 1;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrev) onPrev();
      if (event.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasNext, hasPrev, onNext, onPrev]);

  return (
    <div className="flex h-full w-full flex-col bg-[#0A0A0A]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#1f1f1f] px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToGrid}
            className="flex items-center gap-1 text-xs text-[#6B7280] transition-colors hover:text-[#E5E7EB] md:hidden"
          >
            <ArrowLeft size={13} aria-hidden />
            Grid
          </button>
          <TypeBadge kind={kind} />
          <h2 className="truncate text-sm font-medium tracking-tight text-[#F9FAFB]">
            {title}
          </h2>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-[#6B7280]">
          {currentIndex + 1} / {totalFiltered}
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,rgba(45,106,79,0.08),transparent_46%)]">
        <div
          key={entry.entry_id}
          className="absolute inset-0 flex animate-[fadeIn_0.22s_ease-out] items-center justify-center"
        >
          {entry.viewer_entitlement.state !== "visible" ? (
            <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
              <Lock className="h-8 w-8 text-[#6B7280]" aria-hidden />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium leading-snug text-[#E5E7EB]">
                  {patronCollectionLockedTierMessage()}
                </p>
                <p className="text-[11px] leading-relaxed text-[#6B7280]">
                  {patronCollectionLockedTierSubscript()}
                </p>
              </div>
              <Link
                href={profileHref}
                className="mt-1 inline-flex items-center justify-center rounded-md bg-[#40916C] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#2D6A4F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#40916C]"
              >
                Unlock
              </Link>
            </div>
          ) : kind === "video" && contentUrl ? (
            <video
              key={entry.entry_id}
              src={contentUrl}
              controls
              className="max-h-full max-w-full object-contain"
            />
          ) : kind === "image" && contentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={entry.entry_id}
              src={contentUrl}
              alt={title}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="mx-auto max-w-xl rounded-xl border border-[#242424] bg-[#111111] p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-[#6B7280]" aria-hidden />
              <h3 className="mt-4 text-lg font-medium text-[#F9FAFB]">{title}</h3>
              <p className="mt-3 text-sm text-[#6B7280]">
                Open the source post to inspect this saved item.
              </p>
            </div>
          )}
        </div>

        {hasPrev ? (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white backdrop-blur-sm transition-all hover:border-white/20 hover:bg-black/70"
            aria-label="Previous item"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
        ) : null}
        {hasNext ? (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white backdrop-blur-sm transition-all hover:border-white/20 hover:bg-black/70"
            aria-label="Next item"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-[#1f1f1f] px-5 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={profileHref} className="shrink-0" aria-label={`View ${creatorName(entry)} profile`}>
            <CreatorAvatar entry={entry} />
          </Link>
          <div className="min-w-0">
            <Link
              href={profileHref}
              className="truncate text-xs font-medium text-[#F9FAFB] transition-colors hover:text-[#B7E4C7]"
            >
              {creatorName(entry)}
            </Link>
            <p className="text-[11px] text-[#6B7280]">
              Saved {new Date(entry.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="min-w-0 max-w-2xl lg:flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
            Description
          </p>
          <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-[#C5CBC8]">
            {description}
            <span className="ml-2 whitespace-nowrap tabular-nums text-[#6B7280]">{pageLabel}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          {entryTags(entry).slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#151515] px-2 py-0.5 text-[10px] text-[#6B7280]"
            >
              {tag}
            </span>
          ))}
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-md border border-[#2A2A2A] bg-[#0E0E0E] px-2.5 py-1.5 text-[11px] font-medium text-[#E5E7EB] transition-colors hover:border-[#2D6A4F]/50 hover:text-[#40916C]"
          >
            View post
            <ExternalLink size={11} aria-hidden />
          </Link>
          <button
            type="button"
            disabled={removing}
            onClick={() => onRemove(entry)}
            className="inline-flex items-center gap-1 rounded-md border border-[#2A2A2A] bg-[#0E0E0E] px-2.5 py-1.5 text-[11px] font-medium text-[#9CA3AF] transition-colors hover:border-[#5a1f1f]/60 hover:text-[#fca5a5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={11} aria-hidden />
            {removing ? "Removing" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PatronCollectionDetailClient({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<PatronOwnerCollectionDetail | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeType, setActiveType] = useState<FilterKind>("all");
  const [activeCreator, setActiveCreator] = useState("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKind>("date");
  const [mobilePane, setMobilePane] = useState<MobilePane>("grid");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setDetail(null);
    setSelectedEntryId(null);

    void fetchPatronCollectionDetail(collectionId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setSelectedEntryId(d.entries[0]?.entry_id ?? null);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof RelayApiError && err.status === 404) {
          setPhase("not-found");
          return;
        }
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  const handleRemove = useCallback(
    async (entry: PatronCollectionDetailEntry) => {
      setRemoveError(null);
      setRemovingEntryId(entry.entry_id);
      try {
        await removePatronCollectionEntry({
          creatorId: entry.creator_id,
          collectionId,
          postId: entry.post_id,
          mediaId: entry.media_id,
        });
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                entry_count: Math.max(0, prev.entry_count - 1),
                entries: prev.entries.filter((e) => e.entry_id !== entry.entry_id),
              }
            : prev
        );
      } catch {
        setRemoveError("Could not remove that snip. Try again.");
      } finally {
        setRemovingEntryId(null);
      }
    },
    [collectionId]
  );

  const lockedCount = useMemo(
    () => detail?.entries.filter((e) => e.viewer_entitlement.state !== "visible").length ?? 0,
    [detail]
  );
  const fallbackLabels = useMemo(
    () => fallbackPageLabels(detail?.entries ?? []),
    [detail?.entries]
  );
  const creators = useMemo(
    () => Array.from(new Set((detail?.entries ?? []).map(creatorName))).sort(),
    [detail?.entries]
  );
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const entry of detail?.entries ?? []) {
      for (const tag of entryTags(entry)) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [detail?.entries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const entries = [...(detail?.entries ?? [])].filter((entry) => {
      const kind = mediaKind(entry.mime_type);
      const name = creatorName(entry);
      const tags = entryTags(entry);
      const fallback = fallbackLabels.get(entry.entry_id);
      const pageLabel = pageLabelFor(entry, fallback);
      if (q) {
        const haystack = [
          entryTitle(entry),
          name,
          pageLabel,
          mediaTypeLabel(entry.mime_type),
          entry.post_id,
          entry.media_id,
          ...tags,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (activeType !== "all" && kind !== activeType) return false;
      if (activeCreator !== "all" && name !== activeCreator) return false;
      if (activeTags.length > 0 && !activeTags.every((tag) => tags.includes(tag))) return false;
      return true;
    });

    if (sortBy === "name") {
      return entries.sort((a, b) => entryTitle(a).localeCompare(entryTitle(b)));
    }
    if (sortBy === "creator") {
      return entries.sort((a, b) => {
        const byCreator = creatorName(a).localeCompare(creatorName(b));
        if (byCreator !== 0) return byCreator;
        return comparePostOrder(a, b, fallbackLabels);
      });
    }
    return sortByCollectionContinuity(entries, fallbackLabels);
  }, [activeCreator, activeTags, activeType, detail?.entries, fallbackLabels, searchQuery, sortBy]);

  const selectedEntry = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    return filteredEntries.find((entry) => entry.entry_id === selectedEntryId) ?? filteredEntries[0] ?? null;
  }, [filteredEntries, selectedEntryId]);

  useEffect(() => {
    if (!selectedEntry && filteredEntries[0]) {
      setSelectedEntryId(filteredEntries[0].entry_id);
      return;
    }
    if (selectedEntry && selectedEntry.entry_id !== selectedEntryId) {
      setSelectedEntryId(selectedEntry.entry_id);
    }
  }, [filteredEntries, selectedEntry, selectedEntryId]);

  const selectedIndex = selectedEntry
    ? filteredEntries.findIndex((entry) => entry.entry_id === selectedEntry.entry_id)
    : -1;

  const selectEntry = useCallback((entry: PatronCollectionDetailEntry) => {
    setSelectedEntryId(entry.entry_id);
    setMobilePane("viewer");
  }, []);

  const selectRelative = useCallback(
    (direction: "prev" | "next") => {
      if (selectedIndex < 0) return;
      const nextIndex = direction === "next" ? selectedIndex + 1 : selectedIndex - 1;
      const next = filteredEntries[nextIndex];
      if (next) {
        setSelectedEntryId(next.entry_id);
      }
    },
    [filteredEntries, selectedIndex]
  );

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setActiveType("all");
    setActiveCreator("all");
    setActiveTags([]);
    setSortBy("date");
  }, []);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    activeType !== "all" ||
    activeCreator !== "all" ||
    activeTags.length > 0;

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-6">
        <Loader2 className="h-6 w-6 animate-spin text-[#2D6A4F]" aria-hidden="true" />
        <p className="mt-3 text-sm text-[#6B7280]">Loading collection...</p>
      </div>
    );
  }

  if (phase === "not-found") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-6 text-center">
        <Lock className="mb-3 h-8 w-8 text-[#6B7280]" aria-hidden="true" />
        <p className="text-sm font-medium text-[#E5E7EB]">Collection not found</p>
        <p className="mt-2 max-w-md text-xs text-[#6B7280]">
          This collection may have been deleted or belongs to another account.
        </p>
        <Link
          href="/library"
          className="mt-6 text-sm font-medium text-[#2D6A4F] hover:text-[#40916C]"
        >
          Back to library
        </Link>
      </div>
    );
  }

  if (phase === "error" || !detail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-6 text-center">
        <p className="text-sm font-medium text-[#E5E7EB]">Could not load this collection</p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-6 text-sm font-medium text-[#2D6A4F] hover:text-[#40916C]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (detail.entries.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-[#E5E7EB]">
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[#1f1f1f] px-5">
          <Link
            href="/library"
            className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] transition-colors hover:text-[#2D6A4F]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Library
          </Link>
          <h1 className="text-sm font-medium text-[#F9FAFB]">{detail.title}</h1>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="rounded-lg border border-dashed border-[#2A2A2A] px-8 py-16">
            <p className="text-sm text-[#9CA3AF]">This collection is empty</p>
            <p className="mt-2 text-xs text-[#6B7280]">
              Snip artwork from the patron feed to save pieces here.
            </p>
            <Link
              href="/feed"
              className="mt-6 inline-block text-sm font-medium text-[#2D6A4F] hover:text-[#40916C]"
            >
              Browse feed
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0A] text-[#E5E7EB]">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[#1f1f1f] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/library"
            className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] transition-colors hover:text-[#2D6A4F]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Library
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#555555]">
            Collection
          </span>
          <span className="text-xs text-[#2A2A2A]" aria-hidden>
            /
          </span>
          <h1 className="truncate text-sm font-medium tracking-tight text-[#F9FAFB]">
            {detail.title}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="shrink-0 text-xs tabular-nums text-[#6B7280]">
            <span className="font-medium text-[#F9FAFB]">{filteredEntries.length}</span>
            <span>/{detail.entry_count}</span>
            {lockedCount > 0 ? <span className="hidden sm:inline"> · {lockedCount} locked</span> : null}
          </span>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="hidden items-center gap-1.5 text-[11px] text-[#40916C] transition-colors hover:text-[#F9FAFB] sm:flex"
            >
              <X size={11} aria-hidden />
              Clear filters
            </button>
          ) : null}
        </div>
      </header>

      {removeError ? (
        <p className="shrink-0 border-b border-[#5a1f1f]/50 bg-[#1a1010] px-5 py-2 text-xs text-[#fca5a5]">
          {removeError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside
          className={[
            "w-full shrink-0 flex-col overflow-hidden border-r border-[#1f1f1f] md:flex md:w-[380px] lg:w-[420px]",
            mobilePane === "viewer" ? "hidden" : "flex",
          ].join(" ")}
        >
          <CollectionFilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            activeType={activeType}
            setActiveType={setActiveType}
            activeCreator={activeCreator}
            setActiveCreator={setActiveCreator}
            sortBy={sortBy}
            setSortBy={setSortBy}
            creators={creators}
          />
          <CollectionTagCloud
            allTags={allTags}
            activeTags={activeTags}
            onToggleTag={toggleTag}
          />
          {filteredEntries.length === 0 ? (
            <EmptyResults />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin] [scrollbar-color:#2A2A2A_transparent]">
              <div className="grid grid-cols-2 gap-2.5">
                {filteredEntries.map((entry, index) => (
                  <CollectionMediaCard
                    key={entry.entry_id}
                    entry={entry}
                    selected={selectedEntry?.entry_id === entry.entry_id}
                    index={index}
                    fallbackPagePosition={fallbackLabels.get(entry.entry_id) ?? null}
                    onSelect={selectEntry}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>

        <main
          className={[
            "min-w-0 flex-1 overflow-hidden md:flex",
            mobilePane === "grid" ? "hidden" : "flex",
          ].join(" ")}
        >
          {selectedEntry ? (
            <CollectionMediaViewer
              entry={selectedEntry}
              currentIndex={Math.max(0, selectedIndex)}
              totalFiltered={filteredEntries.length}
              fallbackPagePosition={fallbackLabels.get(selectedEntry.entry_id) ?? null}
              onPrev={() => selectRelative("prev")}
              onNext={() => selectRelative("next")}
              onBackToGrid={() => setMobilePane("grid")}
              onRemove={handleRemove}
              removing={removingEntryId === selectedEntry.entry_id}
            />
          ) : (
            <EmptyResults />
          )}
        </main>
      </div>

      <div className="flex shrink-0 border-t border-[#1f1f1f] bg-[#111111] md:hidden">
        <button
          type="button"
          onClick={() => setMobilePane("grid")}
          className={[
            "flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium transition-colors",
            mobilePane === "grid" ? "text-[#40916C]" : "text-[#6B7280]",
          ].join(" ")}
        >
          <LayoutGrid size={14} aria-hidden />
          Grid
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("viewer")}
          className={[
            "flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium transition-colors",
            mobilePane === "viewer" ? "text-[#40916C]" : "text-[#6B7280]",
          ].join(" ")}
        >
          <Monitor size={14} aria-hidden />
          Viewer
        </button>
      </div>
    </div>
  );
}
