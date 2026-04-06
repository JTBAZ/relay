/**
 * designer-mock.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * STUB DATA — v0 prototype only.
 *
 * Cursor integration replaces this with:
 *   import { getPageLayout, putPageLayout } from "@/lib/relay-api"
 *   GET  /api/layout       → PageLayout
 *   PUT  /api/layout       → PageLayout
 *   GET  /api/collections  → Collection[]
 *
 * Shape is intentionally close to the real PageLayout API contract so that
 * the swap is a one-line import change per component.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeAccent = "green" | "neutral" | "warm" | "custom";
export type ThemeRadius = "none" | "sm" | "md" | "lg";
export type SectionLayout = "grid" | "list" | "masonry" | "featured";
export type BreakpointKey = "mobile" | "tablet" | "desktop";
export type TierKey = "public" | "supporter" | "member" | "inner";

/** How locked/gated content is displayed to a patron without access */
export type LockedArtStyle = "blurred" | "locked" | "paywall";

/** Typography aesthetic applied to the patron-facing page */
export type TypographyStyle = "editorial" | "minimal" | "warm" | "mono";

/** Matches persisted `PageLayout.theme.gallery_arrangement` */
export type GalleryArrangement = "chronological" | "tier";

/** Matches persisted `PageLayout.theme.patreon_link_position` */
export type PatreonLinkPosition = "below_avatar" | "below_bio";

export interface HeroConfig {
  /** Patron-visible headline */
  headline: string;
  /** Optional subtext beneath headline */
  subline: string;
  /** Whether to show the creator avatar */
  showAvatar: boolean;
  /** Whether to show a cover image behind the hero */
  showCover: boolean;
  /** Stub cover image URL — replace with real blob URL */
  coverUrl: string;
}

// ─── Section types ─────────────────────────────────────────────────────────────

/** A section sourced from the creator's Library */
export interface LibrarySection {
  kind: "library";
  id: string;
  label: string;
  collectionSlug: string;
  /**
   * When set, the saved layout uses a filter-backed section (e.g. `{}` = full catalog / all visible work)
   * instead of a single collection. `collectionSlug` is ignored for API save in that case.
   */
  filterQuery?: Record<string, unknown>;
  layout: SectionLayout;
  itemLimit: number;
  /** Grid column count for grid / masonry / featured sub-grid (persisted as API `columns`) */
  gridColumns?: 2 | 3 | 4;
  visible: boolean;
}

/** Select value: full-library section (maps to API `source.type === "filter"`) */
export const LIBRARY_ALL_VISIBLE_SLUG = "__relay_all_visible__";

/** Shop storefront row (Gumroad-style) */
export interface ShopSection {
  kind: "shop";
  id: string;
  label: string;
  visible: boolean;
  gridCols: 2 | 3 | 4;
  items: ShopItem[];
}

export interface ShopItem {
  id: string;
  title: string;
  price: string;
  imageUrl: string;
}

/** Engagement block — pre-built templates */
export type EngagementBlockType =
  | "newsletter"
  | "commission"
  | "contest"
  | "links";

export interface EngagementSection {
  kind: "engagement";
  id: string;
  label: string;
  visible: boolean;
  blockType: EngagementBlockType;
  /** Free-form heading text for the block */
  heading: string;
  /** Optional body copy */
  body: string;
  /** For "links" block: platform link pairs */
  links?: { platform: string; url: string }[];
}

/** Announcement banner that can be placed anywhere on the page */
export interface AnnouncementBanner {
  kind: "announcement";
  id: string;
  label: string;
  visible: boolean;
  message: string;
  /** Optional ISO date after which the banner auto-hides */
  expiresAt: string | null;
  style: "info" | "promo" | "alert";
}

export type AnySection =
  | LibrarySection
  | ShopSection
  | EngagementSection
  | AnnouncementBanner;

/** Backwards-compat alias so old code still compiles */
export type PageSection = LibrarySection;

export interface ThemeConfig {
  accent: ThemeAccent;
  /** Hex string, only used when accent === "custom" */
  accentCustom: string;
  radius: ThemeRadius;
  /** Show creator bio beneath hero */
  showBio: boolean;
  /** Display tier badges on items */
  showTierBadges: boolean;
  /** Show patreon.com/{slug} under hero when slug exists (from Library / campaign sync) */
  showPatreonLink: boolean;
  /** Profile hero: Patreon URL under avatar vs under bio block */
  patreonLinkPosition: PatreonLinkPosition;
  /** Order of items within each Library section (saved to layout API) */
  galleryArrangement: GalleryArrangement;
  /** How locked/gated content appears to patrons without access */
  lockedArtStyle: LockedArtStyle;
  /** Typography aesthetic for the patron-facing page */
  typography: TypographyStyle;
}

export interface PageLayout {
  creatorSlug: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  theme: ThemeConfig;
  hero: HeroConfig;
  sections: AnySection[];
  lastPublishedAt: string | null;
  published: boolean;
}

// ─── Collections available from Library ───────────────────────────────────────

export interface Collection {
  slug: string;
  label: string;
  itemCount: number;
  tier: TierKey;
}

export const MOCK_COLLECTIONS: Collection[] = [
  { slug: "recent-work",    label: "Recent Work",       itemCount: 24, tier: "public"    },
  { slug: "process-shots",  label: "Process Shots",     itemCount: 38, tier: "supporter" },
  { slug: "archive-2023",   label: "Archive — 2023",    itemCount: 91, tier: "supporter" },
  { slug: "inner-circle",   label: "Inner Circle",      itemCount: 12, tier: "inner"     },
  { slug: "member-extras",  label: "Member Extras",     itemCount: 19, tier: "member"    },
  { slug: "public-preview", label: "Public Preview",    itemCount: 6,  tier: "public"    },
];

// ─── Tier definitions ─────────────────────────────────────────────────────────

export const TIERS: { key: TierKey; label: string }[] = [
  { key: "public",    label: "Public"       },
  { key: "supporter", label: "Supporter"    },
  { key: "member",    label: "Member"       },
  { key: "inner",     label: "Inner Circle" },
];

// ─── Mock PageLayout ───────────────────────────────────────────────────────────

export const MOCK_PAGE_LAYOUT: PageLayout = {
  creatorSlug:    "ada-cross",
  displayName:    "Ada Cross",
  bio:            "Documentary photographer. Long-form storytelling on access, land, and light.",
  avatarUrl:      "https://i.pravatar.cc/128?img=47",
  lastPublishedAt: "2025-01-14T11:22:00Z",
  published:      true,

  theme: {
    accent:          "green",
    accentCustom:    "#7c3aed",
    radius:          "md",
    showBio:         true,
    showTierBadges:  true,
    showPatreonLink: true,
    patreonLinkPosition: "below_bio",
    galleryArrangement: "chronological",
    lockedArtStyle:  "blurred",
    typography:      "editorial",
  },

  hero: {
    headline:   "Ada Cross",
    subline:    "Documentary photography. Land, access, light.",
    showAvatar: true,
    showCover:  true,
    coverUrl:   "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1400&q=80",
  },

  sections: [
    {
      kind:           "library",
      id:             "sec-recent",
      label:          "Recent Work",
      collectionSlug: "recent-work",
      layout:         "grid",
      itemLimit:      12,
      gridColumns:    3,
      visible:        true,
    },
    {
      kind:           "library",
      id:             "sec-process",
      label:          "Behind the Shot",
      collectionSlug: "process-shots",
      layout:         "masonry",
      itemLimit:      8,
      gridColumns:    3,
      visible:        true,
    },
    {
      kind:           "announcement",
      id:             "ann-spring",
      label:          "Spring Sale Banner",
      visible:        true,
      message:        "Spring print sale — 20% off all editions through April 30.",
      expiresAt:      "2025-04-30T23:59:00Z",
      style:          "promo",
    },
    {
      kind:           "library",
      id:             "sec-archive",
      label:          "2023 Archive",
      collectionSlug: "archive-2023",
      layout:         "list",
      itemLimit:      20,
      gridColumns:    3,
      visible:        false,
    },
    {
      kind:           "engagement",
      id:             "eng-newsletter",
      label:          "Newsletter",
      visible:        true,
      blockType:      "newsletter",
      heading:        "Stay in the loop",
      body:           "Field notes, process updates, and early access — straight to your inbox.",
    },
    {
      kind:     "shop",
      id:       "sec-shop",
      label:    "Shop",
      visible:  true,
      gridCols: 3,
      items: [
        {
          id:       "item-1",
          title:    "High Plains — Limited Print",
          price:    "$120",
          imageUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&q=70",
        },
        {
          id:       "item-2",
          title:    "Access Series Zine",
          price:    "$28",
          imageUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=70",
        },
        {
          id:       "item-3",
          title:    "Lightroom Preset Pack",
          price:    "$18",
          imageUrl: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=400&q=70",
        },
      ],
    },
    {
      kind:           "library",
      id:             "sec-inner",
      label:          "Inner Circle",
      collectionSlug: "inner-circle",
      layout:         "featured",
      itemLimit:      6,
      visible:        true,
    },
    {
      kind:      "engagement",
      id:        "eng-links",
      label:     "Find Me",
      visible:   true,
      blockType: "links",
      heading:   "Find me elsewhere",
      body:      "",
      links: [
        { platform: "Discord",   url: "https://discord.gg/ada-cross" },
        { platform: "Twitter/X", url: "https://twitter.com/ada_cross" },
        { platform: "Instagram", url: "https://instagram.com/ada_cross" },
      ],
    },
  ],
};

// ─── Stub image grid for section previews ────────────────────────────────────

export const STUB_IMAGES = [
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&q=70",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=70",
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=70",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=400&q=70",
  "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&q=70",
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=400&q=70",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=70",
  "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?w=400&q=70",
];

