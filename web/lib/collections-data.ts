/** Collections + “Collect from subscriptions” mock data — v0 “Relay visual system (2)” schema */

export type CollectionVisibility = "private" | "link" | "public";

export type ItemType = "article" | "image" | "link" | "video" | "note" | "pdf";

export interface CollectionItem {
  id: string;
  title: string;
  type: ItemType;
  source?: string;
  addedAt: string;
  myTags: string[];
  communityTags?: string[];
  collectorCount?: number;
  thumbnail?: string;
}

export interface Collection {
  id: string;
  title: string;
  description: string;
  coverColor: string;
  coverAccent: string;
  itemCount: number;
  visibility: CollectionVisibility;
  updatedAt: string;
  createdAt: string;
  tags: string[];
  items: CollectionItem[];
  pinned?: boolean;
}

export const VISIBILITY_CONFIG: Record<
  CollectionVisibility,
  { label: string; description: string }
> = {
  private: { label: "Private", description: "Only you can see this shelf." },
  link: { label: "Anyone with link", description: "Not listed; share the URL." },
  public: { label: "Public", description: "Visible on your profile." },
};

export const ITEM_TYPE_CONFIG: Record<ItemType, { label: string; color: string }> = {
  article: { label: "Article", color: "#40916C" },
  image: { label: "Image", color: "#C5B358" },
  link: { label: "Link", color: "#9CA3AF" },
  video: { label: "Video", color: "#60A5FA" },
  note: { label: "Note", color: "#A78BFA" },
  pdf: { label: "PDF", color: "#F87171" },
};

export type CatalogItemType = "article" | "image" | "link" | "video" | "audio" | "pdf";

export interface CatalogItem {
  id: string;
  creatorId: string;
  type: CatalogItemType;
  title: string;
  description: string;
  tags: string[];
  communityTags?: string[];
  savedAt: string;
  collectorCount?: number;
}

export interface Creator {
  id: string;
  name: string;
  handle: string;
  avatarColor: string;
  itemCount: number;
}

export const CATALOG_ITEM_TYPE_CONFIG: Record<CatalogItemType, { label: string; color: string }> = {
  article: { label: "Article", color: "#40916C" },
  image: { label: "Image", color: "#C5B358" },
  link: { label: "Link", color: "#9CA3AF" },
  video: { label: "Video", color: "#60A5FA" },
  audio: { label: "Audio", color: "#34D399" },
  pdf: { label: "PDF", color: "#F87171" },
};

export const MOCK_SHELF_NAMES = [
  "Deep Focus Sessions",
  "Meridian B-Sides",
  "Patron Q&A Archive",
  "Process & Notes",
  "New shelf",
];

export const MOCK_CREATORS: Creator[] = [
  { id: "cr-1", name: "Nora Vale", handle: "@noravale", avatarColor: "#2D6A4F", itemCount: 24 },
  { id: "cr-2", name: "Meridian Sounds", handle: "@meridian", avatarColor: "#1B4332", itemCount: 41 },
  { id: "cr-3", name: "Studio Still", handle: "@studiostill", avatarColor: "#40916C", itemCount: 18 },
  { id: "cr-4", name: "Arlo Keane", handle: "@arlo", avatarColor: "#C5B358", itemCount: 12 },
];

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: "cat-1",
    creatorId: "cr-1",
    type: "article",
    title: "Building a dark-first design system",
    description: "Tokens, contrast, and why we default to charcoal.",
    tags: ["design", "tokens"],
    communityTags: ["ds", "a11y", "tailwind"],
    savedAt: "2d ago",
    collectorCount: 128,
  },
  {
    id: "cat-2",
    creatorId: "cr-1",
    type: "image",
    title: "Reference — brutalist posters",
    description: "Mood board for the spring drop.",
    tags: ["mood"],
    communityTags: ["posters", "ref"],
    savedAt: "5d ago",
    collectorCount: 56,
  },
  {
    id: "cat-3",
    creatorId: "cr-2",
    type: "video",
    title: "Live set — spring tour teaser",
    description: "Unlisted cut from soundcheck.",
    tags: ["live", "tour"],
    communityTags: ["video", "teaser"],
    savedAt: "1w ago",
    collectorCount: 890,
  },
  {
    id: "cat-4",
    creatorId: "cr-2",
    type: "audio",
    title: "B-side sketch — Glass Room",
    description: "Rough mix, not for release.",
    tags: ["wip"],
    communityTags: ["b-side", "ambient"],
    savedAt: "3d ago",
    collectorCount: 210,
  },
  {
    id: "cat-5",
    creatorId: "cr-3",
    type: "link",
    title: "Essay: patron-only archives",
    description: "How creators gate long-tail content.",
    tags: ["patreon"],
    communityTags: ["essay", "membership"],
    savedAt: "1d ago",
    collectorCount: 44,
  },
  {
    id: "cat-6",
    creatorId: "cr-3",
    type: "pdf",
    title: "Rider — 2026 venues",
    description: "Technical + hospitality.",
    tags: ["tour", "ops"],
    savedAt: "4d ago",
    collectorCount: 12,
  },
  {
    id: "cat-7",
    creatorId: "cr-4",
    type: "article",
    title: "Notes on Collect vs Library",
    description: "Product split for Relay.",
    tags: ["product"],
    communityTags: ["relay", "ia"],
    savedAt: "6h ago",
    collectorCount: 33,
  },
  {
    id: "cat-8",
    creatorId: "cr-2",
    type: "image",
    title: "Cover art — Meridian alt",
    description: "Gold foil test on green.",
    tags: ["cover"],
    communityTags: ["meridian", "art"],
    savedAt: "2w ago",
    collectorCount: 402,
  },
];

const col = (
  c: Omit<Collection, "itemCount"> & { items: CollectionItem[] },
): Collection => ({
  ...c,
  itemCount: c.items.length,
});

export const MOCK_COLLECTIONS: Collection[] = [
  col({
    id: "col-001",
    title: "Deep Focus Sessions",
    description: "Ambient and instrumental — no lyrics, no interruptions.",
    coverColor: "#0D1F17",
    coverAccent: "#2D6A4F",
    visibility: "link",
    updatedAt: "2 hours ago",
    createdAt: "Jan 12, 2025",
    tags: ["ambient", "focus", "instrumental"],
    pinned: true,
    items: [
      {
        id: "i-001",
        title: "Morning Ritual",
        type: "article",
        source: "noravale.com",
        addedAt: "Jan 14",
        myTags: ["read"],
        communityTags: ["focus"],
        collectorCount: 1200,
      },
      {
        id: "i-002",
        title: "Coastal Drift still",
        type: "image",
        addedAt: "Jan 14",
        myTags: ["ref"],
        communityTags: ["photo"],
      },
      {
        id: "i-003",
        title: "Session log PDF",
        type: "pdf",
        source: "Dropbox",
        addedAt: "Jan 13",
        myTags: ["notes"],
        communityTags: ["pdf"],
      },
    ],
  }),
  col({
    id: "col-002",
    title: "Live Recordings 2024",
    description: "Raw multi-track recordings from the tour.",
    coverColor: "#111111",
    coverAccent: "#1B4332",
    visibility: "private",
    updatedAt: "Yesterday",
    createdAt: "Mar 4, 2025",
    tags: ["live", "tour"],
    items: [
      {
        id: "i-010",
        title: "NYC — Full Set",
        type: "video",
        source: "YouTube (unlisted)",
        addedAt: "Mar 5",
        myTags: ["video"],
        communityTags: ["nyc"],
        collectorCount: 88,
      },
      {
        id: "i-011",
        title: "Chicago soundcheck note",
        type: "note",
        addedAt: "Mar 4",
        myTags: [],
        communityTags: ["soundcheck"],
      },
    ],
  }),
  col({
    id: "col-003",
    title: "Visual Companion Series",
    description: "Film and photography for the Meridian album.",
    coverColor: "#141414",
    coverAccent: "#40916C",
    visibility: "public",
    updatedAt: "3 days ago",
    createdAt: "Feb 20, 2025",
    tags: ["film", "meridian"],
    items: [
      {
        id: "i-020",
        title: "Act I — Arrival",
        type: "video",
        addedAt: "Feb 22",
        myTags: ["film"],
        communityTags: ["meridian"],
        collectorCount: 2400,
      },
      {
        id: "i-021",
        title: "Behind the lens",
        type: "link",
        source: "vimeo.com",
        addedAt: "Feb 21",
        myTags: ["link"],
      },
    ],
  }),
  col({
    id: "col-004",
    title: "Patron Q&A Archive",
    description: "Every monthly Q&A, indexed.",
    coverColor: "#0D1F17",
    coverAccent: "#2D6A4F",
    visibility: "link",
    updatedAt: "1 week ago",
    createdAt: "Jun 1, 2024",
    tags: ["q&a", "members"],
    items: [
      {
        id: "i-030",
        title: "Feb 2025 Q&A",
        type: "video",
        addedAt: "Mar 1",
        myTags: ["patrons"],
        communityTags: ["qna"],
        collectorCount: 500,
      },
    ],
  }),
  col({
    id: "col-005",
    title: "Process & Notes",
    description: "Sketches and session logs.",
    coverColor: "#111111",
    coverAccent: "#1B4332",
    visibility: "private",
    updatedAt: "4 days ago",
    createdAt: "Aug 15, 2024",
    tags: ["process", "wip"],
    items: [
      {
        id: "i-040",
        title: "Chord sketches vol 3",
        type: "pdf",
        addedAt: "Apr 1",
        myTags: ["music"],
        communityTags: ["chords"],
      },
      {
        id: "i-041",
        title: "Inspiration tab dump",
        type: "link",
        addedAt: "Mar 28",
        myTags: ["refs"],
      },
    ],
  }),
];
