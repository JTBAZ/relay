"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AtSign,
  BarChart2,
  Bell,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  GalleryHorizontal,
  Globe,
  Grid2X2,
  GripVertical,
  Heart,
  Image as ImageIcon,
  Instagram,
  Layers,
  LayoutGrid,
  Link2,
  List,
  Lock,
  MessageCircle,
  MessageSquarePlus,
  Palette,
  RefreshCw,
  Rows3,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Twitter,
  User,
  Users,
  X,
} from "lucide-react";
import {
  buildGalleryFacetsQuery,
  buildGalleryQuery,
  RELAY_API_BASE,
  getCreatorProfile,
  relayFetch,
  type Collection as ApiCollection,
  type CreatorProfileIdentity,
  type FacetsData,
  type GalleryItem,
  type GalleryListData,
  type VisitorHeroData,
} from "@/lib/relay-api";
import { dedupeShadowCoverRows } from "@/lib/gallery-group";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "@/lib/tier-access";
import { useStudioSession } from "@/lib/studio-session-context";
import CollectionBuilderDrawer from "@/app/components/CollectionBuilderDrawer";

type ViewMode = "public" | "tier" | "creator";
type SelectedSection = string | null;
type SelectedMedia = Set<string>;
type GalleryLayout = "grid" | "masonry" | "showcase" | "editorial" | "list";
type HeroStyle = "full" | "split" | "minimal" | "banner";
type AccentColor = "emerald" | "violet" | "gold" | "rose" | "sky" | "custom";
type UpdateSize = "minimal" | "medium" | "billboard";

type GalleryThemeSection = {
  id: string;
  title: string;
  layout: GalleryLayout;
  visible: boolean;
  order: number;
  itemIds: string[];
};

type FeaturedBlock =
  | { type: "latest" }
  | { type: "collection"; collectionId: string }
  | { type: "media"; mediaId: string }
  | { type: "post"; postId: string };

type DesignerMedia = {
  id: string;
  postId: string;
  title: string;
  tierLabel: string | null;
  tierRank: number;
  aspectRatio: string;
  publishedAt: string;
  thumbUrl: string | null;
  lockedForPublic: boolean;
  formatLabel: string;
  collectionIds: string[];
};

type ProfileTheme = {
  heroStyle: HeroStyle;
  heroHeight: "compact" | "standard" | "tall";
  showBio: boolean;
  showSocials: boolean;
  updateSize: UpdateSize;
  accentColor: AccentColor;
  customAccent: string;
  defaultLayout: GalleryLayout;
  showTierBadges: boolean;
  enableLightbox: boolean;
  featured: FeaturedBlock;
  sections: GalleryThemeSection[];
  enableAnimations: boolean;
  enableHoverEffects: boolean;
};

type PollOption = { id: string; label: string };
type PollData = {
  question: string;
  options: PollOption[];
  voteType: "single" | "multiple";
  durationDays: number | null;
  allowWriteIn: boolean;
  shuffleOptions: boolean;
};
type UpdateData = {
  body: string;
  mediaUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  tiers: string[];
  notify: boolean;
  poll?: PollData;
};
type CurrentUpdate = UpdateData & { timestamp: string; author: string };

type DesignerHeroData = VisitorHeroData & {
  username?: string | null;
  public_slug?: string | null;
  bio?: string | null;
  discipline?: string | null;
};

const ACCENT_COLORS: Record<AccentColor, string> = {
  emerald: "#00c781",
  violet: "#a78bfa",
  gold: "#d4af37",
  rose: "#fb7185",
  sky: "#38bdf8",
  custom: "#00c781",
};

const LAYOUT_LABELS: Record<GalleryLayout, string> = {
  grid: "Grid",
  masonry: "Masonry",
  showcase: "Showcase",
  editorial: "Editorial",
  list: "List",
};

const HERO_STYLE_LABELS: Record<HeroStyle, string> = {
  full: "Full Width",
  split: "Split",
  minimal: "Minimal",
  banner: "Banner",
};

const UPDATE_SIZE_LABELS: Record<UpdateSize, string> = {
  minimal: "Minimal",
  medium: "Medium",
  billboard: "Billboard",
};

const DEFAULT_SECTIONS: GalleryThemeSection[] = [
  { id: "featured", title: "Featured", layout: "showcase", visible: true, order: 0, itemIds: ["m1", "m2", "m3"] },
  { id: "gallery", title: "All Works", layout: "grid", visible: true, order: 1, itemIds: ["m4", "m5", "m6", "m7", "m8", "m9"] },
  { id: "process", title: "Process Notes", layout: "masonry", visible: true, order: 2, itemIds: ["m10", "m11", "m12", "m13"] },
];

const DEFAULT_THEME: ProfileTheme = {
  heroStyle: "full",
  heroHeight: "standard",
  showBio: true,
  showSocials: true,
  updateSize: "medium",
  accentColor: "emerald",
  customAccent: "#00c781",
  defaultLayout: "grid",
  showTierBadges: true,
  enableLightbox: true,
  featured: { type: "latest" },
  sections: DEFAULT_SECTIONS,
  enableAnimations: true,
  enableHoverEffects: true,
};

const DEFAULT_UPDATE: CurrentUpdate = {
  body: "Commissions are open for January. Tier 2+ members get priority booking and 15% off. I am also sharing process work from the winter forest series this week.",
  tiers: ["public", "basic"],
  notify: false,
  timestamp: "2 hours ago",
  author: "Elena Adler",
};

const MOCK_MEDIA: Record<string, { title: string; tier?: number; aspectRatio: string }> = {
  m1: { title: "Autumn Series No. 4", aspectRatio: "4/5" },
  m2: { title: "On Silence", tier: 2, aspectRatio: "3/4" },
  m3: { title: "Dreamscape VII", aspectRatio: "16/9" },
  m4: { title: "Portrait Study III", tier: 1, aspectRatio: "3/4" },
  m5: { title: "Margins Essay", aspectRatio: "1/1" },
  m6: { title: "Digital Flora", aspectRatio: "4/5" },
  m7: { title: "Night Walk", tier: 3, aspectRatio: "16/9" },
  m8: { title: "Process Notes", aspectRatio: "3/4" },
  m9: { title: "Sketch Collection", aspectRatio: "1/1" },
  m10: { title: "Chromatic Study", aspectRatio: "4/5" },
  m11: { title: "Ambient Vol. 2", tier: 2, aspectRatio: "1/1" },
  m12: { title: "Reflection", aspectRatio: "3/4" },
  m13: { title: "Self Portrait", aspectRatio: "3/4" },
};

const FALLBACK_MEDIA: Record<string, DesignerMedia> = Object.fromEntries(
  Object.entries(MOCK_MEDIA).map(([id, item], index) => [
    id,
    {
      id,
      postId: `mock-post-${index}`,
      title: item.title,
      tierLabel: item.tier ? `Tier ${item.tier}` : null,
      tierRank: item.tier ?? 0,
      aspectRatio: item.aspectRatio,
      publishedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
      thumbUrl: null,
      lockedForPublic: Boolean(item.tier),
      formatLabel: item.aspectRatio,
      collectionIds: [],
    } satisfies DesignerMedia,
  ])
);

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function genId() {
  return Math.random().toString(36).slice(2, 8);
}

function defaultPoll(): PollData {
  return {
    question: "",
    options: [
      { id: genId(), label: "" },
      { id: genId(), label: "" },
    ],
    voteType: "single",
    durationDays: 3,
    allowWriteIn: false,
    shuffleOptions: false,
  };
}

function sectionsFromCollections(collections: ApiCollection[]): GalleryThemeSection[] {
  const collectionSections = collections
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 2)
    .map((collection, index) => ({
      id: `collection-${collection.collection_id}`,
      title: collection.title,
      layout: index === 0 ? "masonry" : "grid",
      visible: true,
      order: index + 2,
      itemIds: ["m10", "m11", "m12", "m13"].slice(0, Math.max(2, Math.min(collection.post_ids.length || 3, 4))),
    } satisfies GalleryThemeSection));

  return [
    { ...DEFAULT_SECTIONS[0] },
    { ...DEFAULT_SECTIONS[1], order: 1 },
    ...collectionSections,
  ].map((section, order) => ({ ...section, order }));
}

function liveMediaFromGalleryItem(
  item: GalleryItem,
  tierOrderIds: string[],
  tierTitleById: Record<string, string>
): DesignerMedia {
  let tierRank = 0;
  let tierLabel: string | null = null;
  for (const tierId of item.tier_ids) {
    const rank = tierOrderIds.indexOf(tierId) + 1;
    if (rank > tierRank) {
      tierRank = rank;
      tierLabel = tierTitleById[tierId] ?? tierId;
    }
  }
  const mime = item.mime_type ?? "";
  const formatLabel = mime.startsWith("video/")
    ? "video"
    : mime.startsWith("audio/")
      ? "audio"
      : mime.startsWith("image/")
        ? "image"
        : "media";
  const thumbPath = item.content_url_path?.trim() || item.preview_url_path?.trim();

  return {
    id: item.media_id,
    postId: item.post_id,
    title: item.title || "Untitled",
    tierLabel,
    tierRank,
    aspectRatio: formatLabel === "video" ? "16/9" : "4/5",
    publishedAt: item.published_at,
    thumbUrl: thumbPath ? `${RELAY_API_BASE}${thumbPath}` : null,
    lockedForPublic: tierRank > 0,
    formatLabel,
    collectionIds: item.collection_ids,
  };
}

function sectionsFromLiveLibrary(
  collections: ApiCollection[],
  items: GalleryItem[]
): GalleryThemeSection[] {
  if (items.length === 0) return DEFAULT_SECTIONS;

  const ids = items.map((item) => item.media_id);
  const sections: GalleryThemeSection[] = [
    {
      id: "featured",
      title: "Featured",
      layout: "showcase",
      visible: true,
      order: 0,
      itemIds: ids.slice(0, 3),
    },
    {
      id: "gallery",
      title: "All Works",
      layout: "grid",
      visible: true,
      order: 1,
      itemIds: ids.slice(0, 24),
    },
  ];

  collections
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 3)
    .forEach((collection) => {
      const collectionIds = items
        .filter((item) => collection.post_ids.includes(item.post_id))
        .map((item) => item.media_id)
        .slice(0, 16);
      if (collectionIds.length === 0) return;
      sections.push({
        id: `collection-${collection.collection_id}`,
        title: collection.title,
        layout: "masonry",
        visible: true,
        order: sections.length,
        itemIds: collectionIds,
      });
    });

  return sections.map((section, order) => ({ ...section, order }));
}

async function fetchDesignerLibraryItems(creatorId: string): Promise<GalleryItem[]> {
  const items: GalleryItem[] = [];
  let cursor: string | null = null;

  for (;;) {
    const data: GalleryListData = await relayFetch<GalleryListData>(
      buildGalleryQuery({
        creator_id: creatorId,
        limit: 100,
        cursor: cursor ?? undefined,
      })
    );
    items.push(...data.items);
    cursor = data.next_cursor;
    if (!cursor || items.length >= 500) break;
  }

  return dedupeShadowCoverRows(items);
}

function paidTierOrderFromFacets(facets: FacetsData): string[] {
  return facets.tiers
    .filter((tier) => {
      const title = tier.title.trim().toLowerCase();
      return (
        tier.tier_id !== RELAY_TIER_PUBLIC &&
        tier.tier_id !== RELAY_TIER_ALL_PATRONS &&
        title !== "public" &&
        title !== "free"
      );
    })
    .slice()
    .sort((a, b) => (a.amount_cents ?? 0) - (b.amount_cents ?? 0))
    .map((tier) => tier.tier_id);
}

function heroFromCreatorProfile(profile: CreatorProfileIdentity): DesignerHeroData {
  return {
    relay_display_name:
      profile.display_name?.trim() ||
      profile.username?.trim() ||
      profile.public_slug?.trim() ||
      undefined,
    avatar_url: profile.avatar_url?.trim() || undefined,
    banner_url: profile.banner_url?.trim() || undefined,
    username: profile.username,
    public_slug: profile.public_slug,
    bio: profile.bio,
    discipline: profile.discipline,
  };
}

function creatorDisplayName(hero: DesignerHeroData | null): string {
  const username = hero?.username?.trim() || hero?.public_slug?.trim() || hero?.patreon_name?.trim();
  return hero?.relay_display_name?.trim() || username || "Elena Adler";
}

function creatorInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "EA"
  );
}

function CreatorAvatar({
  hero,
  className,
  textClassName,
}: {
  hero: DesignerHeroData | null;
  className: string;
  textClassName: string;
}) {
  const name = creatorDisplayName(hero);
  const avatarUrl = hero?.avatar_url?.trim();
  return (
    <div
      className={cx("shrink-0 bg-[#242424] bg-cover bg-center font-semibold text-[#8a8a8a]", className, textClassName)}
      style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
      aria-label={`${name} avatar`}
    >
      {avatarUrl ? null : creatorInitials(name)}
    </div>
  );
}

function latestMediaIds(mediaCatalog: Record<string, DesignerMedia>, limit: number) {
  return Object.values(mediaCatalog)
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit)
    .map((item) => item.id);
}

function featuredMediaIds(
  featured: FeaturedBlock,
  mediaCatalog: Record<string, DesignerMedia>,
  collections: ApiCollection[]
): string[] {
  if (featured.type === "media") {
    return mediaCatalog[featured.mediaId] ? [featured.mediaId] : latestMediaIds(mediaCatalog, 1);
  }

  if (featured.type === "post") {
    const ids = Object.values(mediaCatalog)
      .filter((item) => item.postId === featured.postId)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .map((item) => item.id);
    return ids.length > 0 ? ids : latestMediaIds(mediaCatalog, 3);
  }

  if (featured.type === "collection") {
    const collection = collections.find((item) => item.collection_id === featured.collectionId);
    const ids = Object.values(mediaCatalog)
      .filter((item) => collection?.post_ids.includes(item.postId) || item.collectionIds.includes(featured.collectionId))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 8)
      .map((item) => item.id);
    return ids.length > 0 ? ids : latestMediaIds(mediaCatalog, 3);
  }

  return latestMediaIds(mediaCatalog, 3);
}

function EditorSidebar({
  onPostUpdate,
  onFeature,
  onCurateGallery,
  onNewCollection,
}: {
  onPostUpdate: () => void;
  onFeature: () => void;
  onCurateGallery: () => void;
  onNewCollection: () => void;
}) {
  return (
    <aside className="fixed left-0 top-[var(--relay-app-nav-height)] z-40 flex h-[calc(100dvh-var(--relay-app-nav-height))] w-16 flex-col items-center gap-1 overflow-y-auto border-r border-[#242424] bg-[#070707] py-4">
      <Link
        href="/action-center"
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-[#7a7a7a] transition-colors hover:bg-[#171717] hover:text-[#f5f5f5]"
        title="Back to Action Center"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <div className="mb-3 h-px w-8 bg-[#242424]" />
      <button
        type="button"
        onClick={onPostUpdate}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00c781]/10 text-[#00c781] transition-colors hover:bg-[#00c781] hover:text-black"
        title="Post Update - publish a status to your billboard"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onFeature}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-[#00c781] transition-colors hover:bg-[#00c781]/10"
        title="Featured - choose the profile spotlight"
      >
        <Sparkles className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onCurateGallery}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-[#00c781] transition-colors hover:bg-[#00c781]/10"
        title="Customize Gallery"
      >
        <GalleryHorizontal className="h-5 w-5" />
      </button>
      <div className="my-2 h-px w-6 bg-[#242424]" />
      <button
        type="button"
        onClick={onNewCollection}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-[#7a7a7a] transition-colors hover:bg-[#171717] hover:text-[#f5f5f5]"
        title="New Collection - curate existing Library work"
      >
        <Layers className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-[#7a7a7a] transition-colors hover:bg-[#171717] hover:text-[#f5f5f5]"
        title="Page Settings"
      >
        <Settings className="h-5 w-5" />
      </button>
      <div className="flex-1" />
    </aside>
  );
}

function SectionWrapper({
  label,
  isSelected,
  onSelect,
  canReorder,
  children,
}: {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  canReorder?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "group relative rounded-2xl transition-all",
        isSelected
          ? "ring-2 ring-[#7c3aed] ring-offset-2 ring-offset-[#050505]"
          : "hover:ring-1 hover:ring-[#353535] hover:ring-offset-1 hover:ring-offset-[#050505]"
      )}
      onClick={onSelect}
    >
      <div
        className={cx(
          "absolute -top-3 left-4 z-10 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-opacity",
          isSelected ? "bg-[#7c3aed] text-white opacity-100" : "bg-[#242424] text-[#b4b4b4] opacity-0 group-hover:opacity-100"
        )}
      >
        {label}
      </div>
      {isSelected ? (
        <div className="absolute -top-3 right-4 z-10 flex items-center gap-1">
          {canReorder ? (
            <>
              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#353535] bg-[#242424] text-[#b4b4b4]">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#353535] bg-[#242424] text-[#b4b4b4]">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
          <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#353535] bg-[#242424] text-[#b4b4b4]">
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {isSelected && canReorder ? (
        <div className="absolute -left-5 top-1/2 -translate-y-1/2 cursor-grab">
          <GripVertical className="h-4 w-4 text-[#7c3aed]" />
        </div>
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

function HeroSection({
  viewMode,
  isSelected,
  theme,
  hero,
}: {
  viewMode: ViewMode;
  isSelected: boolean;
  theme: ProfileTheme;
  hero: DesignerHeroData | null;
}) {
  const height = theme.heroHeight === "compact" ? "h-32" : theme.heroHeight === "tall" ? "h-64" : "h-48";
  const username = hero?.username?.trim() || hero?.public_slug?.trim() || hero?.patreon_name?.trim() || "";
  const name = creatorDisplayName(hero);
  const discipline = hero?.discipline?.trim() || "Digital artist and illustrator";
  const bio =
    hero?.bio?.trim() ||
    "Creating surreal digital paintings inspired by dreams and mythology. Sharing process work and high-res downloads for supporters.";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#101010]">
      <div
        className={cx("relative bg-gradient-to-br from-[#181b1f] via-[#111] to-[#1a1a1a] transition-all duration-300", height)}
        style={hero?.banner_url ? { backgroundImage: `url(${hero.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {isSelected ? (
          <button type="button" className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-black/70 px-3 py-1.5 text-xs font-medium text-[#b4b4b4] backdrop-blur-sm">
            <Camera className="h-3.5 w-3.5" />
            Change Cover
          </button>
        ) : null}
      </div>
      <div className="relative px-6 pb-6">
        <div className="absolute -top-12 left-6">
          <div className="relative">
            <CreatorAvatar
              hero={hero}
              className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-4 border-[#101010]"
              textClassName="text-2xl font-bold"
            />
            {isSelected ? (
              <button type="button" className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#171717] text-[#b4b4b4]">
                <Camera className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="pt-16">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[#f5f5f5]">
                {name}
                {isSelected ? <Edit3 className="h-4 w-4 text-[#7c3aed]" /> : null}
              </h1>
              <p className="mt-1 text-sm text-[#b4b4b4]">
                {discipline}
                {username ? <span className="text-[#6f6f6f]"> · @{username}</span> : null}
              </p>
              {theme.showBio ? (
                <p className="mt-3 max-w-md text-sm leading-relaxed text-[#8a8a8a]">
                  {bio}
                </p>
              ) : null}
              {theme.showSocials ? (
                <div className="mt-3 flex items-center gap-2">
                  {[Twitter, Instagram, Globe].map((Icon, index) => (
                    <a key={index} href="#" className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#171717] text-[#8a8a8a] transition-colors hover:bg-[#242424] hover:text-[#f5f5f5]">
                      <Icon className="h-3.5 w-3.5" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <a href="#" className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--designer-accent)] px-5 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90">
              Support on Patreon
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          {(viewMode === "creator" || viewMode === "tier") ? (
            <div className="mt-4 flex items-center gap-3 border-t border-[#242424] pt-4">
              <span className="rounded-lg bg-[#2a2310] px-2.5 py-1 text-xs font-medium text-[#d4af37]">Tier 2</span>
              <span className="text-xs text-[#6f6f6f]">214 supporters · 1.2k followers</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MediaCard({
  media,
  isSelected,
  viewMode,
  enableHoverEffects,
  enableAnimations,
  className,
  onClick,
}: {
  media: DesignerMedia;
  isSelected: boolean;
  viewMode: ViewMode;
  enableHoverEffects: boolean;
  enableAnimations: boolean;
  className?: string;
  onClick: (event: React.MouseEvent) => void;
}) {
  const isLocked = viewMode === "public" && media.lockedForPublic;
  return (
    <button
      type="button"
      className={cx(
        "group relative w-full overflow-hidden rounded-xl bg-[#171717] text-left",
        enableAnimations ? "transition-all duration-300" : "transition-none",
        enableHoverEffects && !isSelected ? "hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(0,0,0,0.35)] hover:ring-1 hover:ring-[#353535]" : "",
        isSelected ? "scale-[0.98] ring-2 ring-[#7c3aed] ring-offset-2 ring-offset-[#101010]" : "",
        className
      )}
      onClick={onClick}
      style={{
        aspectRatio: media.aspectRatio,
        backgroundImage: media.thumbUrl ? `url(${media.thumbUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {!media.thumbUrl ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-[#25282d] via-[#171717] to-[#232323]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.12),transparent_60%)] opacity-30" />
          </div>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-xs text-[#5f5f5f]">{media.id}</span>
        </>
      ) : null}
      {isSelected ? (
        <div className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#7c3aed]">
          <Check className="h-3 w-3 text-white" />
        </div>
      ) : null}
      {isLocked ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-1">
            <Lock className="h-5 w-5 text-[#6f6f6f]" />
            <span className="text-[10px] text-[#6f6f6f]">{media.tierLabel ?? "Tiered"} only</span>
          </div>
        </div>
      ) : media.tierLabel ? (
        <div className="absolute left-2 top-2 z-10 rounded bg-[#2a2310] px-1.5 py-0.5 text-[10px] font-medium text-[#d4af37]">
          {media.tierLabel}
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="truncate text-xs font-medium text-[#f5f5f5]">{media.title}</p>
      </div>
    </button>
  );
}

function VariantStackCard({
  isSelected,
  enableHoverEffects,
  enableAnimations,
  onClick,
}: {
  isSelected: boolean;
  enableHoverEffects: boolean;
  enableAnimations: boolean;
  onClick: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={cx(
        "group relative w-full overflow-hidden rounded-xl bg-[#171717] text-left",
        enableAnimations ? "transition-all duration-300" : "transition-none",
        enableHoverEffects && !isSelected ? "hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(0,0,0,0.35)] hover:ring-1 hover:ring-[#353535]" : "",
        isSelected ? "scale-[0.98] ring-2 ring-[#7c3aed] ring-offset-2 ring-offset-[#101010]" : ""
      )}
      onClick={onClick}
      style={{ aspectRatio: "4/5" }}
    >
      <div className="absolute inset-1 translate-x-1 rotate-2 rounded-lg bg-[#242424]" />
      <div className="absolute inset-0.5 -rotate-1 rounded-lg bg-[#242424]" />
      <div className="absolute inset-0 z-10 rounded-xl bg-gradient-to-br from-[#2b2b2b] via-[#171717] to-[#242424]" />
      {isSelected ? (
        <div className="absolute right-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-[#7c3aed]">
          <Check className="h-3 w-3 text-white" />
        </div>
      ) : null}
      <div className="absolute left-2 top-2 z-20 flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-black/80 px-2 py-1 backdrop-blur-sm">
        <Layers className="h-3 w-3 text-[#d4af37]" />
        <span className="text-[10px] font-medium text-[#f5f5f5]">+9 variants</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent p-3">
        <p className="text-xs font-medium text-[#f5f5f5]">Autumn Series</p>
        <p className="mt-0.5 text-[10px] text-[#6f6f6f]">Variant Stack</p>
      </div>
    </button>
  );
}

function GallerySection({
  title,
  layout,
  viewMode,
  selectedMedia,
  toggleMediaSelection,
  mediaIds,
  mediaCatalog,
  enableHoverEffects,
  enableAnimations,
  showVariantStack,
  onLayoutChange,
  spotlightGallery,
}: {
  title: string;
  layout: GalleryLayout;
  viewMode: ViewMode;
  selectedMedia: SelectedMedia;
  toggleMediaSelection: (id: string, shiftKey: boolean) => void;
  mediaIds: string[];
  mediaCatalog: Record<string, DesignerMedia>;
  enableHoverEffects: boolean;
  enableAnimations: boolean;
  showVariantStack?: boolean;
  onLayoutChange?: (layout: GalleryLayout) => void;
  /** Featured spotlight: layout controls only — no search, sort, tier, or listing count. */
  spotlightGallery?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"az" | "latest">("latest");
  const [tierFirst, setTierFirst] = useState(false);
  const gridClass =
    layout === "list"
      ? "flex flex-col gap-2"
      : layout === "showcase"
        ? "grid grid-cols-2 gap-4"
        : layout === "masonry"
          ? "columns-2 gap-4 space-y-4"
          : layout === "editorial"
            ? "grid grid-cols-2 gap-6"
            : "grid grid-cols-3 gap-4";

  const layoutButtons: Array<[GalleryLayout, React.ElementType]> = [
    ["grid", Grid2X2],
    ["masonry", LayoutGrid],
    ["showcase", Sparkles],
    ["editorial", BookOpen],
    ["list", List],
  ];

  const visibleMediaIds = useMemo(() => {
    if (spotlightGallery) {
      return mediaIds.filter((id) => mediaCatalog[id]);
    }
    const q = searchQuery.trim().toLowerCase();
    const filtered = mediaIds.filter((id) => {
      const media = mediaCatalog[id];
      if (!media) return false;
      if (!q) return true;
      const tierText = media.tierLabel ?? "public";
      return [media.title, id, tierText, media.formatLabel]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return [...filtered].sort((a, b) => {
      const ma = mediaCatalog[a];
      const mb = mediaCatalog[b];
      if (!ma || !mb) return 0;
      if (tierFirst) {
        const tierDelta = ma.tierRank - mb.tierRank;
        if (tierDelta !== 0) return tierDelta;
      }
      if (sortMode === "az") return ma.title.localeCompare(mb.title);
      return mb.publishedAt.localeCompare(ma.publishedAt);
    });
  }, [mediaCatalog, mediaIds, searchQuery, sortMode, tierFirst, spotlightGallery]);

  const showStack = showVariantStack && (!searchQuery.trim() || "autumn series variant stack".includes(searchQuery.trim().toLowerCase()));

  return (
    <div className="rounded-2xl border border-[#242424] bg-[#101010] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-[#f5f5f5]">{title}</h3>
        {spotlightGallery ? null : (
          <div className="order-3 flex w-full items-center gap-2 rounded-xl border border-[#242424] bg-[#171717] px-3 py-2 md:order-none md:w-[min(100%,24rem)]">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#6f6f6f]" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="min-w-0 flex-1 bg-transparent text-xs text-[#f5f5f5] outline-none placeholder:text-[#6f6f6f]"
            />
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as "az" | "latest")}
              onClick={(event) => event.stopPropagation()}
              className="rounded-full border border-[#2f2f2f] bg-[#101010] px-2.5 py-1 text-[11px] text-[#b4b4b4] outline-none"
              title="Sort this section"
            >
              <option value="latest">Latest</option>
              <option value="az">A-Z</option>
            </select>
            <label
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#2f2f2f] bg-[#101010] px-2 py-1"
              title="Group this sort by visible tier"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="text-[11px] font-medium text-[#b4b4b4]">Tier</span>
              <span
                role="switch"
                aria-checked={tierFirst}
                tabIndex={0}
                onClick={() => setTierFirst((value) => !value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setTierFirst((value) => !value);
                  }
                }}
                className={cx(
                  "relative h-4 w-8 rounded-full transition-colors",
                  tierFirst ? "bg-[var(--designer-accent)]" : "bg-[#2f2f2f]"
                )}
              >
                <span
                  className={cx(
                    "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                    tierFirst ? "left-[18px]" : "left-0.5"
                  )}
                />
              </span>
            </label>
            <span className="shrink-0 text-[10px] text-[#6f6f6f]">
              {visibleMediaIds.length}/{mediaIds.length}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {layoutButtons.map(([value, Icon]) => (
            <button
              type="button"
              key={value}
              onClick={(event) => {
                event.stopPropagation();
                onLayoutChange?.(value);
              }}
              className={cx(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                layout === value ? "bg-[#242424] text-[#f5f5f5]" : "text-[#6f6f6f] hover:bg-[#171717] hover:text-[#b4b4b4]"
              )}
              title={LAYOUT_LABELS[value]}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>
      {visibleMediaIds.length === 0 && !showStack ? (
        <div className="rounded-xl border border-dashed border-[#2a2a2a] bg-[#0c0c0c] px-4 py-8 text-center text-xs text-[#6f6f6f]">
          No works match this section search.
        </div>
      ) : layout === "list" ? (
        <div className="flex flex-col gap-2">
          {visibleMediaIds.map((id) => {
            const media = mediaCatalog[id];
            if (!media) return null;
            const isSelected = selectedMedia.has(id);
            const isLocked = viewMode === "public" && media.lockedForPublic;
            return (
              <button
                type="button"
                key={id}
                onClick={(event) => toggleMediaSelection(id, event.shiftKey)}
                className={cx(
                  "flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
                  isSelected ? "border-[var(--designer-accent)] bg-[var(--designer-accent-soft)]" : "border-[#242424] bg-[#171717] hover:bg-[#242424]"
                )}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[#242424] bg-[#242424]">
                  {media.thumbUrl ? (
                    <div
                      className="h-full w-full rounded bg-cover bg-center"
                      style={{ backgroundImage: `url(${media.thumbUrl})` }}
                    />
                  ) : (
                    <span className="font-mono text-[10px] text-[#6f6f6f]">{id}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-[#f5f5f5]">{media.title}</p>
                  <p className="text-[11px] text-[#6f6f6f]">
                    {isLocked && media.tierLabel ? `${media.tierLabel} · ` : ""}
                    {media.formatLabel}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={gridClass}>
          {showStack ? (
            <VariantStackCard
              isSelected={selectedMedia.has("stack-autumn")}
              enableHoverEffects={enableHoverEffects}
              enableAnimations={enableAnimations}
              onClick={(event) => toggleMediaSelection("stack-autumn", event.shiftKey)}
            />
          ) : null}
          {visibleMediaIds.map((id, index) => {
            const media = mediaCatalog[id];
            if (!media) return null;
            const showcaseLead = layout === "showcase" && index === 0;
            return (
              <MediaCard
                key={id}
                media={showcaseLead ? { ...media, aspectRatio: "16/9" } : media}
                isSelected={selectedMedia.has(id)}
                viewMode={viewMode}
                enableHoverEffects={enableHoverEffects}
                enableAnimations={enableAnimations}
                className={showcaseLead ? "col-span-2" : undefined}
                onClick={(event) => toggleMediaSelection(id, event.shiftKey)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function UpdateCard({
  update,
  isEditing,
  size,
  hero,
  onReplace,
}: {
  update: CurrentUpdate;
  isEditing: boolean;
  size: UpdateSize;
  hero: DesignerHeroData | null;
  onReplace: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const authorName = creatorDisplayName(hero);
  const previewLimit = size === "minimal" ? 84 : size === "billboard" ? 180 : 120;
  const shouldTruncate = update.body.length > previewLimit;
  const previewText = shouldTruncate && !expanded ? `${update.body.slice(0, previewLimit)}...` : update.body;
  const showExpandedMedia = update.mediaUrl && (expanded || !shouldTruncate || size === "billboard");
  const showExpandedCta = update.ctaLabel && update.ctaUrl && (expanded || !shouldTruncate || size === "billboard");

  if (size === "minimal") {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#242424] bg-[#101010]">
        <div className="flex items-start gap-3 p-4">
          <CreatorAvatar
            hero={hero}
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            textClassName="text-xs"
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[#f5f5f5]">{authorName}</span>
              <span className="text-xs text-[#6f6f6f]">· {update.timestamp}</span>
              {update.tiers.slice(0, 1).map((tier) => (
                <span key={tier} className="rounded-md bg-[#171717] px-1.5 py-0.5 text-[10px] font-medium text-[#b4b4b4]">
                  {tier === "public" ? "Public" : tier}
                </span>
              ))}
            </div>
            <p className="line-clamp-2 text-sm leading-relaxed text-[#b4b4b4]">{previewText}</p>
          </div>
          {isEditing ? (
            <button type="button" onClick={onReplace} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[var(--designer-accent)] hover:bg-[var(--designer-accent-soft)]">
              Replace
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (size === "billboard") {
    return (
      <div className="overflow-hidden rounded-3xl border border-[#242424] bg-[#101010] shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <div className="relative min-h-[18rem] bg-gradient-to-br from-[#191d22] via-[#101010] to-[#202020]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,var(--designer-accent-soft),transparent_42%)]" />
          {update.mediaUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#171717]/80">
              <span className="text-xs text-[#6f6f6f]">Media billboard</span>
            </div>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/78 to-transparent p-6 pt-20">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-[var(--designer-accent)] px-2.5 py-1 text-[11px] font-semibold text-black">Current Update</span>
              <span className="text-xs text-[#8a8a8a]">{update.timestamp}</span>
              {update.tiers.slice(0, 2).map((tier) => (
                <span key={tier} className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium text-[#d6d6d6]">
                  {tier === "public" ? "Public" : tier === "basic" ? "Basic" : tier}
                </span>
              ))}
            </div>
            <p className="max-w-2xl text-lg font-medium leading-relaxed text-[#f5f5f5]">{previewText}</p>
            <div className="mt-5 flex items-center justify-between gap-4">
              {showExpandedCta ? (
                <a href={update.ctaUrl} className="inline-flex items-center gap-2 rounded-xl bg-[var(--designer-accent)] px-4 py-2 text-sm font-semibold text-black">
                  {update.ctaLabel}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : <div />}
              {isEditing ? (
                <button type="button" onClick={onReplace} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--designer-accent)] hover:bg-[var(--designer-accent-soft)]">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Replace billboard
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#242424] bg-[#101010]">
      <div className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CreatorAvatar
              hero={hero}
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              textClassName="text-sm"
            />
            <div>
              <p className="text-sm font-medium text-[#f5f5f5]">{authorName}</p>
              <div className="flex items-center gap-2 text-xs text-[#6f6f6f]">
                <Clock className="h-3 w-3" />
                <span>{update.timestamp}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {update.tiers.slice(0, 2).map((tier) => (
              <span key={tier} className="rounded-md bg-[#171717] px-2 py-0.5 text-[10px] font-medium text-[#b4b4b4]">
                {tier === "public" ? "Public" : tier === "basic" ? "Basic" : tier}
              </span>
            ))}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-[#b4b4b4]">{previewText}</p>
        {update.poll ? <PollDisplay poll={update.poll} /> : null}
        {showExpandedMedia ? (
          <div className="mt-4 flex h-48 items-center justify-center overflow-hidden rounded-xl bg-[#171717]">
            <span className="text-xs text-[#6f6f6f]">Media billboard</span>
          </div>
        ) : null}
        {showExpandedCta ? (
          <a href={update.ctaUrl} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--designer-accent)] px-4 py-2 text-sm font-medium text-black">
            {update.ctaLabel}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
        {expanded ? (
          <div className="mt-4 flex items-center gap-4 border-t border-[#242424] pt-4">
            <span className="flex items-center gap-1.5 text-xs text-[#6f6f6f]"><Heart className="h-3.5 w-3.5" />24 likes</span>
            <span className="flex items-center gap-1.5 text-xs text-[#6f6f6f]"><MessageCircle className="h-3.5 w-3.5" />8 comments</span>
            <span className="flex items-center gap-1.5 text-xs text-[#6f6f6f]"><Users className="h-3.5 w-3.5" />Reached 412</span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t border-[#242424] bg-black/30 px-5 py-3">
        {shouldTruncate ? (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="flex items-center gap-1.5 text-xs text-[#8a8a8a] hover:text-[#b4b4b4]">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Collapse" : "Read more"}
          </button>
        ) : <div />}
        {isEditing ? (
          <button type="button" onClick={onReplace} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--designer-accent)] hover:bg-[var(--designer-accent-soft)]">
            <RefreshCw className="h-3.5 w-3.5" />
            Replace
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PollDisplay({ poll }: { poll: PollData }) {
  const [voted, setVoted] = useState<Set<number>>(new Set());
  const totalVotes = 100;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-[#6f6f6f]">
        <BarChart2 className="h-3.5 w-3.5" />
        <span>{poll.voteType === "single" ? "Single choice" : "Multiple choice"}</span>
        {poll.durationDays ? <span>· {poll.durationDays}d remaining</span> : null}
      </div>
      <div className="space-y-2">
        {poll.options.map((option, index) => {
          const active = voted.has(index);
          const pct = active ? 38 + index * 12 : 0;
          return (
            <button
              type="button"
              key={option.id}
              onClick={() => setVoted(new Set([index]))}
              className={cx("relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left", active ? "border-[var(--designer-accent)] bg-[var(--designer-accent-soft)]" : "border-[#242424] bg-[#171717]")}
            >
              {active ? <div className="absolute inset-0 bg-[var(--designer-accent-soft)]" style={{ width: `${pct}%` }} /> : null}
              <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#353535]" />
              <span className="relative flex-1 text-sm text-[#b4b4b4]">{option.label}</span>
              {active ? <span className="relative font-mono text-xs text-[#6f6f6f]">{Math.round((pct / totalVotes) * 100)}%</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OlderUpdatesRow({ count }: { count: number }) {
  return (
    <button type="button" className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#242424] bg-[#101010]/50 py-3 text-xs text-[#6f6f6f] transition-colors hover:bg-[#101010] hover:text-[#b4b4b4]">
      <Clock className="h-3.5 w-3.5" />
      {count} older updates in journal
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );
}

function ProfileCanvas({
  viewMode,
  selectedSection,
  setSelectedSection,
  selectedMedia,
  toggleMediaSelection,
  currentUpdate,
  onReplaceUpdate,
  theme,
  onThemeChange,
  hero,
  mediaCatalog,
  collections,
}: {
  viewMode: ViewMode;
  selectedSection: SelectedSection;
  setSelectedSection: (id: SelectedSection) => void;
  selectedMedia: SelectedMedia;
  toggleMediaSelection: (id: string, shiftKey: boolean) => void;
  currentUpdate: CurrentUpdate | null;
  onReplaceUpdate: () => void;
  theme: ProfileTheme;
  onThemeChange: (patch: Partial<ProfileTheme>) => void;
  hero: DesignerHeroData | null;
  mediaCatalog: Record<string, DesignerMedia>;
  collections: ApiCollection[];
}) {
  const visibleSections = theme.sections.filter((section) => section.visible).sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <SectionWrapper label="Hero" isSelected={selectedSection === "hero"} onSelect={() => setSelectedSection(selectedSection === "hero" ? null : "hero")}>
        <HeroSection viewMode={viewMode} isSelected={selectedSection === "hero"} theme={theme} hero={hero} />
      </SectionWrapper>

      {currentUpdate ? (
        <SectionWrapper label="Current Update" isSelected={selectedSection === "update"} onSelect={() => setSelectedSection(selectedSection === "update" ? null : "update")}>
          <UpdateCard
            update={currentUpdate}
            isEditing={viewMode === "creator"}
            size={theme.updateSize}
            hero={hero}
            onReplace={onReplaceUpdate}
          />
        </SectionWrapper>
      ) : null}

      <OlderUpdatesRow count={5} />

      {visibleSections.map((section) => (
        <SectionWrapper
          key={section.id}
          label={section.title}
          isSelected={selectedSection === section.id}
          onSelect={() => setSelectedSection(selectedSection === section.id ? null : section.id)}
          canReorder
        >
          <GallerySection
            title={section.title}
            layout={section.layout}
            viewMode={viewMode}
            selectedMedia={selectedMedia}
            toggleMediaSelection={toggleMediaSelection}
            mediaIds={section.id === "featured" ? featuredMediaIds(theme.featured, mediaCatalog, collections) : section.itemIds}
            mediaCatalog={mediaCatalog}
            enableHoverEffects={theme.enableHoverEffects}
            enableAnimations={theme.enableAnimations}
            showVariantStack={section.id === "gallery"}
            spotlightGallery={section.id === "featured"}
            onLayoutChange={(layout) => {
              onThemeChange({
                sections: theme.sections.map((current) => current.id === section.id ? { ...current, layout } : current),
              });
            }}
          />
        </SectionWrapper>
      ))}
    </div>
  );
}

function BatchActionBar({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-[#242424] bg-[#171717] px-4 py-3 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-2 border-r border-[#242424] pr-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#7c3aed] text-xs font-semibold text-white">{count}</span>
          <span className="text-sm text-[#b4b4b4]">selected</span>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-xl bg-[#2a2310] px-3 py-2 text-sm font-medium text-[#d4af37]">
          <Layers className="h-4 w-4" />
          Stack Variants
        </button>
        <button type="button" className="flex items-center gap-2 rounded-xl bg-[#242424] px-3 py-2 text-sm font-medium text-[#b4b4b4]">
          <FolderPlus className="h-4 w-4" />
          Add to Collection
        </button>
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#242424] text-[#b4b4b4]">
          <Eye className="h-4 w-4" />
        </button>
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#242424] text-[#fb7185]">
          <Trash2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClear} className="ml-2 flex h-8 w-8 items-center justify-center rounded-xl text-[#6f6f6f] hover:bg-[#242424] hover:text-[#f5f5f5]">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="group flex cursor-pointer items-center justify-between gap-3">
      <span className="text-[12px] text-[#b4b4b4] transition-colors group-hover:text-[#f5f5f5]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-[var(--designer-accent)]" : "bg-[#242424]")}
      >
        <span className={cx("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "")} />
      </button>
    </label>
  );
}

function PillSelector<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T;
  onChange: (value: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          type="button"
          key={option}
          onClick={() => onChange(option)}
          className={cx(
            "rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
            value === option ? "bg-[var(--designer-accent)] text-black" : "bg-[#171717] text-[#b4b4b4] hover:bg-[#242424]"
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

function PanelSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[#242424]">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#171717]">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-[#8a8a8a]" />
          <span className="text-[13px] font-medium text-[#f5f5f5]">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-[#6f6f6f]" /> : <ChevronDown className="h-4 w-4 text-[#6f6f6f]" />}
      </button>
      {open ? <div className="space-y-3 px-4 pb-4">{children}</div> : null}
    </div>
  );
}

function SectionList({ theme, onChange }: { theme: ProfileTheme; onChange: (patch: Partial<ProfileTheme>) => void }) {
  const sortedSections = [...theme.sections].sort((a, b) => a.order - b.order);
  const layoutIcons: Record<GalleryLayout, React.ElementType> = {
    grid: Grid2X2,
    masonry: LayoutGrid,
    showcase: Rows3,
    editorial: BookOpen,
    list: List,
  };

  function updateSections(sections: GalleryThemeSection[]) {
    onChange({ sections });
  }

  return (
    <div className="space-y-1.5">
      {sortedSections.map((section, index) => {
        const LayoutIcon = layoutIcons[section.layout];
        return (
          <div key={section.id} className={cx("flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors", section.visible ? "border-[#242424] bg-[#171717]" : "border-transparent bg-[#101010] opacity-60")}>
            <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-[#6f6f6f]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-[#f5f5f5]">{section.title}</p>
              <div className="mt-0.5 flex items-center gap-1">
                {(["grid", "masonry", "list", "showcase", "editorial"] as GalleryLayout[]).map((layout) => {
                  const Icon = layoutIcons[layout];
                  return (
                    <button
                      type="button"
                      key={layout}
                      onClick={() => updateSections(theme.sections.map((current) => current.id === section.id ? { ...current, layout } : current))}
                      className={cx("flex h-5 w-5 items-center justify-center rounded", section.layout === layout ? "bg-[var(--designer-accent-soft)] text-[var(--designer-accent)]" : "text-[#6f6f6f] hover:bg-[#242424] hover:text-[#b4b4b4]")}
                      title={LAYOUT_LABELS[layout]}
                    >
                      <Icon className="h-3 w-3" />
                    </button>
                  );
                })}
                <LayoutIcon className="hidden" />
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => {
                  const reordered = [...sortedSections];
                  const [moved] = reordered.splice(index, 1);
                  if (!moved) return;
                  reordered.splice(index - 1, 0, moved);
                  updateSections(reordered.map((current, order) => ({ ...current, order })));
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-[#6f6f6f] hover:bg-[#242424] hover:text-[#b4b4b4] disabled:opacity-30"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={index === sortedSections.length - 1}
                onClick={() => {
                  const reordered = [...sortedSections];
                  const [moved] = reordered.splice(index, 1);
                  if (!moved) return;
                  reordered.splice(index + 1, 0, moved);
                  updateSections(reordered.map((current, order) => ({ ...current, order })));
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-[#6f6f6f] hover:bg-[#242424] hover:text-[#b4b4b4] disabled:opacity-30"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => updateSections(theme.sections.map((current) => current.id === section.id ? { ...current, visible: !current.visible } : current))}
                className={cx("flex h-5 w-5 items-center justify-center rounded", section.visible ? "text-[var(--designer-accent)]" : "text-[#6f6f6f]")}
              >
                {section.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FeaturedChooser({
  featured,
  collections,
  mediaCatalog,
  onChange,
}: {
  featured: FeaturedBlock;
  collections: ApiCollection[];
  mediaCatalog: Record<string, DesignerMedia>;
  onChange: (featured: FeaturedBlock) => void;
}) {
  const mediaItems = useMemo(
    () => Object.values(mediaCatalog).slice().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [mediaCatalog]
  );
  const postOptions = useMemo(() => {
    const byPost = new Map<string, DesignerMedia>();
    for (const item of mediaItems) {
      if (!byPost.has(item.postId)) byPost.set(item.postId, item);
    }
    return Array.from(byPost.values());
  }, [mediaItems]);

  const typeLabels: Record<FeaturedBlock["type"], string> = {
    latest: "Latest",
    collection: "Collection",
    media: "Single piece",
    post: "Post",
  };
  const selectedMedia = featured.type === "media" ? mediaCatalog[featured.mediaId] : null;
  const selectedPost = featured.type === "post" ? postOptions.find((item) => item.postId === featured.postId) : null;
  const selectedCollection = featured.type === "collection"
    ? collections.find((collection) => collection.collection_id === featured.collectionId)
    : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {(["latest", "collection", "media", "post"] as FeaturedBlock["type"][]).map((type) => (
          <button
            type="button"
            key={type}
            onClick={() => {
              if (type === "latest") onChange({ type });
              if (type === "collection") onChange({ type, collectionId: collections[0]?.collection_id ?? "" });
              if (type === "media") onChange({ type, mediaId: mediaItems[0]?.id ?? "" });
              if (type === "post") onChange({ type, postId: postOptions[0]?.postId ?? "" });
            }}
            className={cx(
              "rounded-lg px-2.5 py-2 text-left text-[11px] font-medium transition-colors",
              featured.type === type
                ? "bg-[var(--designer-accent)] text-black"
                : "bg-[#171717] text-[#b4b4b4] hover:bg-[#242424]"
            )}
          >
            {typeLabels[type]}
          </button>
        ))}
      </div>

      {featured.type === "collection" ? (
        <select
          value={featured.collectionId}
          onChange={(event) => onChange({ type: "collection", collectionId: event.target.value })}
          className="w-full rounded-xl border border-[#2f2f2f] bg-[#171717] px-3 py-2 text-xs text-[#f5f5f5] outline-none"
        >
          {collections.length === 0 ? <option value="">No collections yet</option> : null}
          {collections.map((collection) => (
            <option key={collection.collection_id} value={collection.collection_id}>
              {collection.title}
            </option>
          ))}
        </select>
      ) : null}

      {featured.type === "media" ? (
        <select
          value={featured.mediaId}
          onChange={(event) => onChange({ type: "media", mediaId: event.target.value })}
          className="w-full rounded-xl border border-[#2f2f2f] bg-[#171717] px-3 py-2 text-xs text-[#f5f5f5] outline-none"
        >
          {mediaItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      ) : null}

      {featured.type === "post" ? (
        <select
          value={featured.postId}
          onChange={(event) => onChange({ type: "post", postId: event.target.value })}
          className="w-full rounded-xl border border-[#2f2f2f] bg-[#171717] px-3 py-2 text-xs text-[#f5f5f5] outline-none"
        >
          {postOptions.map((item) => (
            <option key={item.postId} value={item.postId}>
              {item.title}
            </option>
          ))}
        </select>
      ) : null}

      <div className="rounded-xl border border-[#242424] bg-[#171717] p-3">
        <p className="text-[11px] font-medium text-[#f5f5f5]">
          {featured.type === "latest"
            ? "Auto-featuring the newest visible Library work"
            : featured.type === "collection"
              ? selectedCollection?.title ?? "Choose a collection"
              : featured.type === "media"
                ? selectedMedia?.title ?? "Choose one piece"
                : selectedPost?.title ?? "Choose a post"}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-[#6f6f6f]">
          Featured inherits tier permissions from the selected content, so a premium work stays premium when it is promoted.
        </p>
      </div>
    </div>
  );
}

type PagePreset = {
  id: string;
  label: string;
  description: string;
  heroHeight: ProfileTheme["heroHeight"];
  heroStyle: HeroStyle;
  updateSize: UpdateSize;
  layouts: GalleryLayout[];
};

const PAGE_PRESETS: PagePreset[] = [
  {
    id: "index",
    label: "Index",
    description: "Feature collection first, then a fast list-style archive.",
    heroHeight: "compact",
    heroStyle: "minimal",
    updateSize: "minimal",
    layouts: ["showcase", "list", "grid"],
  },
  {
    id: "portfolio",
    label: "Portfolio",
    description: "Cinematic hero with large showcase moments up front.",
    heroHeight: "tall",
    heroStyle: "full",
    updateSize: "billboard",
    layouts: ["showcase", "masonry", "editorial"],
  },
  {
    id: "journal",
    label: "Journal",
    description: "Editorial flow for writing, process, and narrated work.",
    heroHeight: "standard",
    heroStyle: "banner",
    updateSize: "medium",
    layouts: ["editorial", "list", "masonry"],
  },
  {
    id: "studio",
    label: "Studio Grid",
    description: "Balanced grid-first view for broad browsing and discovery.",
    heroHeight: "standard",
    heroStyle: "split",
    updateSize: "minimal",
    layouts: ["grid", "masonry", "showcase"],
  },
];

function applyPagePreset(theme: ProfileTheme, preset: PagePreset): Partial<ProfileTheme> {
  const sorted = [...theme.sections].sort((a, b) => a.order - b.order);
  const sections = sorted.map((section, index) => ({
    ...section,
    visible: true,
    order: index,
    layout: preset.layouts[index] ?? preset.layouts[preset.layouts.length - 1] ?? section.layout,
  }));

  return {
    heroHeight: preset.heroHeight,
    heroStyle: preset.heroStyle,
    updateSize: preset.updateSize,
    defaultLayout: preset.layouts[0] ?? theme.defaultLayout,
    sections,
  };
}

function FeaturedPanel({
  theme,
  onChange,
  onClose,
  collections,
  mediaCatalog,
}: {
  theme: ProfileTheme;
  onChange: (patch: Partial<ProfileTheme>) => void;
  onClose: () => void;
  collections: ApiCollection[];
  mediaCatalog: Record<string, DesignerMedia>;
}) {
  const previewIds = featuredMediaIds(theme.featured, mediaCatalog, collections);
  const featuredSection = theme.sections.find((section) => section.id === "featured");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-20">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#242424] bg-[#101010] shadow-2xl lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 border-b border-[#242424] bg-[#070707] p-5 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[#f5f5f5]">Featured Preview</h2>
              <p className="mt-0.5 text-[11px] text-[#8a8a8a]">
                This is the profile spotlight visitors see above the full gallery.
              </p>
            </div>
            <span className="rounded-full border border-[#2f2f2f] bg-[#171717] px-3 py-1 text-[11px] text-[#b4b4b4]">
              {previewIds.length} item{previewIds.length === 1 ? "" : "s"}
            </span>
          </div>
          <GallerySection
            title={featuredSection?.title ?? "Featured"}
            layout={featuredSection?.layout ?? "showcase"}
            viewMode="creator"
            selectedMedia={new Set()}
            toggleMediaSelection={() => undefined}
            mediaIds={previewIds}
            mediaCatalog={mediaCatalog}
            enableHoverEffects={theme.enableHoverEffects}
            enableAnimations={theme.enableAnimations}
            spotlightGallery
            onLayoutChange={(layout) => {
              onChange({
                sections: theme.sections.map((section) =>
                  section.id === "featured" ? { ...section, layout } : section
                ),
              });
            }}
          />
        </div>

        <div className="flex min-h-[32rem] flex-col">
          <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[#f5f5f5]">Choose Featured</h2>
              <p className="mt-0.5 text-[11px] text-[#8a8a8a]">Swap the profile spotlight independently from posts.</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a8a8a] hover:bg-[#171717] hover:text-[#f5f5f5]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <FeaturedChooser
              featured={theme.featured}
              collections={collections}
              mediaCatalog={mediaCatalog}
              onChange={(featured) => onChange({ featured })}
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#242424] px-5 py-4">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#b4b4b4] hover:bg-[#171717]">
              Close
            </button>
            <button type="button" onClick={onClose} className="rounded-lg bg-[var(--designer-accent)] px-4 py-1.5 text-[12px] font-semibold text-black">
              Apply Featured
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomizerPanel({
  theme,
  onChange,
  onClose,
  currentUpdate,
  hero,
  mediaCatalog,
  collections,
}: {
  theme: ProfileTheme;
  onChange: (patch: Partial<ProfileTheme>) => void;
  onClose: () => void;
  currentUpdate: CurrentUpdate | null;
  hero: DesignerHeroData | null;
  mediaCatalog: Record<string, DesignerMedia>;
  collections: ApiCollection[];
}) {
  const [previewSection, setPreviewSection] = useState<SelectedSection>(null);
  const [previewMedia, setPreviewMedia] = useState<SelectedMedia>(new Set());

  return (
    <div className="fixed inset-0 z-50 flex bg-[#050505]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-[#242424]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#242424] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Live Gallery Preview</h2>
            <p className="mt-0.5 text-[11px] text-[#8a8a8a]">
              Changes from the curator update this preview immediately.
            </p>
          </div>
          <span className="rounded-full border border-[var(--designer-accent)] bg-[var(--designer-accent-soft)] px-3 py-1 text-[11px] font-medium text-[var(--designer-accent)]">
            Active preview
          </span>
        </div>
        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="mx-auto max-w-4xl">
            <ProfileCanvas
              viewMode="creator"
              selectedSection={previewSection}
              setSelectedSection={setPreviewSection}
              selectedMedia={previewMedia}
              toggleMediaSelection={(id, shiftKey) => {
                setPreviewMedia((previous) => {
                  const next = new Set(previous);
                  if (next.has(id)) next.delete(id);
                  else {
                    if (!shiftKey) next.clear();
                    next.add(id);
                  }
                  return next;
                });
              }}
              currentUpdate={currentUpdate}
              onReplaceUpdate={() => undefined}
              theme={theme}
              onThemeChange={onChange}
              hero={hero}
              mediaCatalog={mediaCatalog}
              collections={collections}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 flex h-full w-[420px] max-w-full flex-col border-l border-[#242424] bg-[#101010] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#242424] px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-[#f5f5f5]">Customize Profile</h2>
            <p className="mt-0.5 text-[11px] text-[#8a8a8a]">Tune your live page presentation</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6f6f6f] hover:bg-[#171717] hover:text-[#f5f5f5]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PanelSection title="Page Presets" icon={Sparkles}>
            <div className="grid grid-cols-2 gap-2">
              {PAGE_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => onChange(applyPagePreset(theme, preset))}
                  className="rounded-xl border border-[#242424] bg-[#171717] p-3 text-left transition-colors hover:border-[var(--designer-accent)]"
                >
                  <span className="block text-xs font-semibold text-[#f5f5f5]">{preset.label}</span>
                  <span className="mt-1 block text-[10px] leading-snug text-[#6f6f6f]">{preset.description}</span>
                </button>
              ))}
            </div>
          </PanelSection>
          <PanelSection title="Current Update" icon={MessageSquarePlus}>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] text-[#8a8a8a]">Post preview size</p>
                <PillSelector
                  options={["minimal", "medium", "billboard"] as UpdateSize[]}
                  value={theme.updateSize}
                  onChange={(updateSize) => onChange({ updateSize })}
                  labels={UPDATE_SIZE_LABELS}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-[#6f6f6f]">
                Minimal reads like a status row, Medium is the default card, and Billboard turns the update into a promotional hero beneath the profile hero.
              </p>
            </div>
          </PanelSection>
          <PanelSection title="Hero" icon={User}>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] text-[#8a8a8a]">Style</p>
                <PillSelector options={["full", "split", "minimal", "banner"] as HeroStyle[]} value={theme.heroStyle} onChange={(heroStyle) => onChange({ heroStyle })} labels={HERO_STYLE_LABELS} />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] text-[#8a8a8a]">Height</p>
                <PillSelector options={["compact", "standard", "tall"] as const} value={theme.heroHeight} onChange={(heroHeight) => onChange({ heroHeight })} labels={{ compact: "Compact", standard: "Standard", tall: "Tall" }} />
              </div>
              <ToggleRow label="Show bio" checked={theme.showBio} onChange={(showBio) => onChange({ showBio })} />
              <ToggleRow label="Show social links" checked={theme.showSocials} onChange={(showSocials) => onChange({ showSocials })} />
            </div>
          </PanelSection>
          <PanelSection title="Accent Color" icon={Palette}>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {(["emerald", "violet", "gold", "rose", "sky"] as AccentColor[]).map((color) => (
                  <button
                    type="button"
                    key={color}
                    onClick={() => onChange({ accentColor: color })}
                    className={cx("h-7 w-7 rounded-full border-2 transition-all", theme.accentColor === color ? "scale-110 border-[#f5f5f5]" : "border-transparent")}
                    style={{ backgroundColor: ACCENT_COLORS[color] }}
                    title={color}
                  />
                ))}
                <label
                  className={cx(
                    "relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border-2 transition-all",
                    theme.accentColor === "custom" ? "scale-110 border-[#f5f5f5]" : "border-transparent"
                  )}
                  style={{ backgroundColor: theme.customAccent }}
                  title="Custom color"
                >
                  <input
                    type="color"
                    value={theme.customAccent}
                    onChange={(event) => onChange({ accentColor: "custom", customAccent: event.target.value })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Choose custom accent color"
                  />
                </label>
              </div>
              <p className="text-[11px] text-[#6f6f6f]">
                The final dot opens the full color picker for a custom brand accent.
              </p>
            </div>
          </PanelSection>
          <PanelSection title="Sections" icon={Layers}>
            <SectionList theme={theme} onChange={onChange} />
          </PanelSection>
          <PanelSection title="Gallery Options" icon={ImageIcon} defaultOpen={false}>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] text-[#8a8a8a]">Default Layout</p>
                <PillSelector options={["grid", "masonry", "showcase", "editorial"] as GalleryLayout[]} value={theme.defaultLayout} onChange={(defaultLayout) => onChange({ defaultLayout })} labels={LAYOUT_LABELS} />
              </div>
              <ToggleRow label="Show tier badges" checked={theme.showTierBadges} onChange={(showTierBadges) => onChange({ showTierBadges })} />
              <ToggleRow label="Enable lightbox" checked={theme.enableLightbox} onChange={(enableLightbox) => onChange({ enableLightbox })} />
            </div>
          </PanelSection>
          <PanelSection title="Motion" icon={Sparkles} defaultOpen={false}>
            <ToggleRow label="Enable animations" checked={theme.enableAnimations} onChange={(enableAnimations) => onChange({ enableAnimations })} />
            <ToggleRow label="Enable hover effects" checked={theme.enableHoverEffects} onChange={(enableHoverEffects) => onChange({ enableHoverEffects })} />
            <p className="text-[11px] leading-relaxed text-[#6f6f6f]">
              Animations smooth layout/color changes. Hover effects lift artwork cards in the live preview.
            </p>
          </PanelSection>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#242424] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#b4b4b4] hover:bg-[#171717]">
            Cancel
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-[var(--designer-accent)] px-4 py-1.5 text-[12px] font-semibold text-black">
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function UpdateComposer({
  onClose,
  onPublish,
}: {
  onClose: () => void;
  onPublish: (update: UpdateData) => void;
}) {
  const [body, setBody] = useState("");
  const [selectedTiers, setSelectedTiers] = useState<string[]>(["public"]);
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [showCtaInput, setShowCtaInput] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [notify, setNotify] = useState(false);
  const [pollMode, setPollMode] = useState(false);
  const [poll, setPoll] = useState<PollData>(defaultPoll);
  const hasContent = pollMode
    ? poll.question.trim().length > 0 && poll.options.filter((option) => option.label.trim()).length >= 2
    : body.trim().length > 0;

  function publish() {
    if (!hasContent) return;
    onPublish({
      body: pollMode ? poll.question : body,
      mediaUrl: mediaUrl || undefined,
      ctaLabel: ctaLabel || undefined,
      ctaUrl: ctaUrl || undefined,
      tiers: selectedTiers,
      notify,
      poll: pollMode ? { ...poll, options: poll.options.filter((option) => option.label.trim()) } : undefined,
    });
  }

  function toggleTier(tier: string) {
    setSelectedTiers((current) => current.includes(tier) ? current.filter((value) => value !== tier) : [...current, tier]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#242424] bg-[#101010] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Post Update</h2>
            {pollMode ? <span className="flex items-center gap-1 rounded-full bg-[#7c3aed]/15 px-2 py-0.5 text-[11px] font-medium text-[#a78bfa]"><BarChart2 className="h-3 w-3" />Poll</span> : null}
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a8a8a] hover:bg-[#171717] hover:text-[#f5f5f5]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {pollMode ? (
            <div className="space-y-3">
              <textarea value={poll.question} onChange={(event) => setPoll((current) => ({ ...current, question: event.target.value }))} placeholder="Ask your community a question..." className="h-20 w-full resize-none rounded-xl bg-[#171717] px-4 py-3 text-sm text-[#f5f5f5] outline-none ring-0 placeholder:text-[#6f6f6f] focus:ring-1 focus:ring-[#7c3aed]" autoFocus />
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-[#6f6f6f]">Vote type:</span>
                <button type="button" onClick={() => setPoll((current) => ({ ...current, voteType: "single" }))} className={cx("rounded-md px-3 py-1 text-xs", poll.voteType === "single" ? "bg-[#242424] text-[#f5f5f5]" : "text-[#6f6f6f]")}>Single</button>
                <button type="button" onClick={() => setPoll((current) => ({ ...current, voteType: "multiple" }))} className={cx("rounded-md px-3 py-1 text-xs", poll.voteType === "multiple" ? "bg-[#242424] text-[#f5f5f5]" : "text-[#6f6f6f]")}>Multiple</button>
              </div>
              {poll.options.map((option, index) => (
                <input key={option.id} value={option.label} onChange={(event) => setPoll((current) => ({ ...current, options: current.options.map((currentOption) => currentOption.id === option.id ? { ...currentOption, label: event.target.value } : currentOption) }))} placeholder={`Option ${index + 1}`} className="w-full rounded-lg bg-[#171717] px-3 py-2 text-sm text-[#f5f5f5] outline-none placeholder:text-[#6f6f6f] focus:ring-1 focus:ring-[#7c3aed]" />
              ))}
              {poll.options.length < 6 ? (
                <button type="button" onClick={() => setPoll((current) => ({ ...current, options: [...current.options, { id: genId(), label: "" }] }))} className="flex items-center gap-2 px-1 py-1.5 text-xs text-[#8a8a8a] hover:text-[#b4b4b4]">
                  <span>+</span>Add option
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Share an update with your audience..." className="h-32 w-full resize-none rounded-xl bg-[#171717] px-4 py-3 text-sm text-[#f5f5f5] outline-none placeholder:text-[#6f6f6f] focus:ring-1 focus:ring-[var(--designer-accent)]" autoFocus />
              {showMediaInput ? <input value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="Paste image URL..." className="w-full rounded-lg bg-[#171717] px-3 py-2 text-sm text-[#f5f5f5] outline-none placeholder:text-[#6f6f6f]" /> : null}
              {showCtaInput ? (
                <div className="flex gap-2">
                  <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} placeholder="Button label" className="w-32 rounded-lg bg-[#171717] px-3 py-2 text-sm text-[#f5f5f5] outline-none placeholder:text-[#6f6f6f]" />
                  <input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} placeholder="Button URL" className="flex-1 rounded-lg bg-[#171717] px-3 py-2 text-sm text-[#f5f5f5] outline-none placeholder:text-[#6f6f6f]" />
                </div>
              ) : null}
            </>
          )}
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPollMode((value) => !value)} className={cx("flex h-8 w-8 items-center justify-center rounded-lg", pollMode ? "bg-[#7c3aed]/15 text-[#a78bfa]" : "text-[#b4b4b4] hover:bg-[#171717]")}>
              <BarChart2 className="h-4 w-4" />
            </button>
            <button type="button" disabled={pollMode} onClick={() => setShowMediaInput((value) => !value)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#b4b4b4] hover:bg-[#171717] disabled:opacity-30">
              <ImageIcon className="h-4 w-4" />
            </button>
            <button type="button" disabled={pollMode} onClick={() => setShowCtaInput((value) => !value)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#b4b4b4] hover:bg-[#171717] disabled:opacity-30">
              <Link2 className="h-4 w-4" />
            </button>
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#b4b4b4] hover:bg-[#171717]">
              <AtSign className="h-4 w-4" />
            </button>
            <div className="flex-1" />
            <button type="button" onClick={() => setNotify((value) => !value)} className={cx("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium", notify ? "bg-[#2a2310] text-[#d4af37]" : "text-[#6f6f6f] hover:bg-[#171717] hover:text-[#b4b4b4]")}>
              <Bell className="h-3.5 w-3.5" />
              Notify
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#6f6f6f]">Visible to:</span>
            {["public", "basic", "tier2", "inner"].map((tier) => (
              <button type="button" key={tier} onClick={() => toggleTier(tier)} className={cx("rounded-full px-3 py-1.5 text-xs font-medium", selectedTiers.includes(tier) ? "bg-[#242424] text-[#f5f5f5] ring-1 ring-[#353535]" : "bg-[#171717] text-[#6f6f6f]")}>
                {tier === "public" ? "Public" : tier === "tier2" ? "Tier 2" : tier === "inner" ? "Inner Circle" : "Basic"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-[#242424] bg-black/30 px-5 py-4">
          <p className="text-xs text-[#6f6f6f]">{pollMode ? "Poll appears as your current update." : "Replaces your current billboard update."}</p>
          <button type="button" onClick={publish} disabled={!hasContent} className={cx("flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium", hasContent ? "bg-[var(--designer-accent)] text-black" : "cursor-not-allowed bg-[#171717] text-[#6f6f6f]")}>
            <Send className="h-4 w-4" />
            {pollMode ? "Launch Poll" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DesignerView() {
  const { creatorId } = useStudioSession();
  const [viewMode, setViewMode] = useState<ViewMode>("creator");
  const [selectedSection, setSelectedSection] = useState<SelectedSection>(null);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia>(new Set());
  const [showComposer, setShowComposer] = useState(false);
  const [showFeaturedPanel, setShowFeaturedPanel] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showCollectionBuilder, setShowCollectionBuilder] = useState(false);
  const [currentUpdate, setCurrentUpdate] = useState<CurrentUpdate | null>(DEFAULT_UPDATE);
  const [theme, setTheme] = useState<ProfileTheme>(DEFAULT_THEME);
  const [hero, setHero] = useState<DesignerHeroData | null>(null);
  const [mediaCatalog, setMediaCatalog] = useState<Record<string, DesignerMedia>>(FALLBACK_MEDIA);
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [facets, setFacets] = useState<FacetsData | null>(null);
  const [libraryRefreshNonce, setLibraryRefreshNonce] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const accent = theme.accentColor === "custom" ? theme.customAccent : ACCENT_COLORS[theme.accentColor];

  useEffect(() => {
    if (!creatorId.trim()) return;
    let cancelled = false;
    setLibraryLoading(true);
    setLibraryError(null);
    void (async () => {
      let nextCollections: ApiCollection[] = [];
      let nextFacets: FacetsData | null = null;
      let nextItems: GalleryItem[] = [];
      try {
        const collections = await relayFetch<{ items: ApiCollection[] }>(
          `/api/v1/gallery/collections?creator_id=${encodeURIComponent(creatorId)}`
        );
        nextCollections = collections.items;
        if (!cancelled) setCollections(nextCollections);
      } catch {
        nextCollections = [];
        if (!cancelled) setCollections([]);
      }
      try {
        nextFacets = await relayFetch<FacetsData>(buildGalleryFacetsQuery(creatorId));
        if (!cancelled) setFacets(nextFacets);
      } catch {
        nextFacets = { tag_ids: [], tier_ids: [], tiers: [], tag_counts: {} };
        if (!cancelled) setFacets(nextFacets);
      }
      try {
        const profile = await getCreatorProfile();
        if (!cancelled) setHero(heroFromCreatorProfile(profile));
      } catch {
        try {
          const visitorFacets = await relayFetch<FacetsData>(buildGalleryFacetsQuery(creatorId, true));
          if (!cancelled) setHero(visitorFacets.visitor_hero ?? null);
        } catch {
          if (!cancelled) setHero(null);
        }
      }
      try {
        nextItems = await fetchDesignerLibraryItems(creatorId);
      } catch {
        nextItems = [];
      }

      if (cancelled) return;

      if (nextItems.length > 0 && nextFacets) {
        const tierOrderIds = paidTierOrderFromFacets(nextFacets);
        const tierTitleById = Object.fromEntries(
          nextFacets.tiers.map((tier) => [tier.tier_id, tier.title])
        );
        setMediaCatalog(
          Object.fromEntries(
            nextItems.map((item) => [
              item.media_id,
              liveMediaFromGalleryItem(item, tierOrderIds, tierTitleById),
            ])
          )
        );
        setTheme((current) => ({
          ...current,
          sections: sectionsFromLiveLibrary(nextCollections, nextItems),
        }));
        setLibraryError(null);
      } else if (nextItems.length === 0) {
        setMediaCatalog(FALLBACK_MEDIA);
        setTheme((current) => ({
          ...current,
          sections: nextCollections.length > 0 ? sectionsFromCollections(nextCollections) : DEFAULT_SECTIONS,
        }));
        setLibraryError("No library media found yet. Showing starter preview content.");
      }
      setLibraryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId, libraryRefreshNonce]);

  const toggleMediaSelection = useCallback((id: string, shiftKey: boolean) => {
    setSelectedMedia((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else {
        if (!shiftKey) next.clear();
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedMedia(new Set());
    setSelectedSection(null);
  }, []);

  const handlePublishUpdate = useCallback((data: UpdateData) => {
    setCurrentUpdate({
      ...data,
      timestamp: "Just now",
      author: creatorDisplayName(hero),
    });
    setShowComposer(false);
  }, [hero]);

  const handleThemeChange = useCallback((patch: Partial<ProfileTheme>) => {
    setTheme((previous) => ({ ...previous, ...patch }));
  }, []);

  const shellStyle = useMemo(
    () => ({
      "--designer-accent": accent,
      "--designer-accent-soft": `${accent}22`,
    }) as React.CSSProperties,
    [accent]
  );

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden bg-[#050505] text-[#f5f5f5]"
      style={{ ...shellStyle, height: "calc(100dvh - var(--relay-app-nav-height))" }}
    >
      <EditorSidebar
        onPostUpdate={() => setShowComposer(true)}
        onFeature={() => setShowFeaturedPanel(true)}
        onCurateGallery={() => setShowCustomizer(true)}
        onNewCollection={() => setShowCollectionBuilder(true)}
      />

      <main className="ml-16 flex-1 overflow-auto bg-[#050505]">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(["public", "tier", "creator"] as ViewMode[]).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    viewMode === mode ? "bg-[var(--designer-accent)] text-black" : "bg-[#171717] text-[#b4b4b4] hover:bg-[#242424]"
                  )}
                >
                  {mode === "tier" ? "Tier Member" : mode}
                </button>
              ))}
            </div>
            <div className="text-right">
              <span className="block text-xs text-[#6f6f6f]">Preview as</span>
              <span className="mt-1 block text-[10px] text-[#6f6f6f]">
                {libraryLoading
                  ? "Syncing Library..."
                  : libraryError ?? `${Object.keys(mediaCatalog).length} Library items loaded with tier gates`}
              </span>
            </div>
          </div>

          <ProfileCanvas
            viewMode={viewMode}
            selectedSection={selectedSection}
            setSelectedSection={setSelectedSection}
            selectedMedia={selectedMedia}
            toggleMediaSelection={toggleMediaSelection}
            currentUpdate={currentUpdate}
            onReplaceUpdate={() => setShowComposer(true)}
            theme={theme}
            onThemeChange={handleThemeChange}
            hero={hero}
            mediaCatalog={mediaCatalog}
            collections={collections}
          />
        </div>
      </main>

      {selectedMedia.size > 0 ? <BatchActionBar count={selectedMedia.size} onClear={clearSelection} /> : null}
      {showComposer ? <UpdateComposer onClose={() => setShowComposer(false)} onPublish={handlePublishUpdate} /> : null}
      {facets ? (
        <CollectionBuilderDrawer
          creatorId={creatorId}
          open={showCollectionBuilder}
          onClose={() => setShowCollectionBuilder(false)}
          facets={facets}
          onComplete={() => setLibraryRefreshNonce((value) => value + 1)}
        />
      ) : null}
      {showFeaturedPanel ? (
        <FeaturedPanel
          theme={theme}
          onChange={handleThemeChange}
          onClose={() => setShowFeaturedPanel(false)}
          collections={collections}
          mediaCatalog={mediaCatalog}
        />
      ) : null}
      {showCustomizer ? (
        <CustomizerPanel
          theme={theme}
          onChange={handleThemeChange}
          onClose={() => setShowCustomizer(false)}
          currentUpdate={currentUpdate}
          hero={hero}
          mediaCatalog={mediaCatalog}
          collections={collections}
        />
      ) : null}
    </div>
  );
}
