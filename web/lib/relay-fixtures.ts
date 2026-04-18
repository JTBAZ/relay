/**
 * relay-fixtures.ts
 * Mock data for Relay — Patron Home (feed) preview.
 * No runtime env keys required. Cursor will replace with live API contracts.
 */

export type MediaType = "writing" | "photo" | "audio" | "video";
export type FeedItemKind = "followed" | "discovery";
/** Feed list presentation — `inlineMedia` shows hero + pins in the card (A/B vs `classic`). */
export type FeedCardLayout = "classic" | "inlineMedia";
export type TierLabel = "Free" | "Supporter" | "Studio";

export interface Creator {
  id: string;
  handle: string;
  displayName: string;
  discipline: string;
  avatarUrl: string;
  isFollowed: boolean;
  followerCount: number;
  postCount: number;
  /**
   * When `false`, the patron follows on Patreon but the creator has not linked Relay yet.
   * Sidebar sorts these after on-Relay creators.
   */
  onRelay?: boolean;
  /** Patreon creator page — used when `onRelay === false`. */
  patreonCreatorUrl?: string;
  /** Patron’s subscription tier with this creator (read-only badge in sidebar). */
  patronTierLabel?: TierLabel;
}

export interface FeedPost {
  id: string;
  kind: FeedItemKind;
  creator: Creator;
  title: string;
  excerpt: string;
  description?: string; // Full description for gallery view
  mediaType: MediaType;
  coverImageUrl?: string;
  highResImageUrl?: string; // High-res version for gallery
  /** Full gallery set — when multiple URLs, zoom shows a stacked deck (wheel to cycle). */
  galleryImageUrls?: string[];
  publishedAt: string;
  readTimeLabel?: string;
  likeCount: number;
  commentCount: number;
  tierLabel: TierLabel;
  mediaCount?: number;
  comments?: PositionalComment[];
  communityTags?: string[];
  /** Defaults to `classic` (text + small thumb). */
  feedCardLayout?: FeedCardLayout;
}

export interface CurrentViewer {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  followingCount: number;
  notificationCount: number;
}

export interface SearchSuggestion {
  id: string;
  kind: "creator" | "post" | "query";
  label: string;
  sublabel?: string;
  avatarUrl?: string;
}

export interface PositionalComment {
  id: string;
  author: {
    id: string;
    displayName: string;
    handle: string;
    avatarUrl: string;
  };
  text: string;
  position: { x: number; y: number }; // 0-100 percentage
  createdAt: string;
  tags?: string[];
}

// ── Creators ──────────────────────────────────────────────────────────────

const CREATORS = {
  elena: {
    id: "c1",
    handle: "evasquez",
    displayName: "Elena Vasquez",
    discipline: "Essayist & Critic",
    avatarUrl: "/placeholder.svg?height=40&width=40",
    isFollowed: true,
    followerCount: 4820,
    postCount: 142,
    onRelay: true,
    patronTierLabel: "Studio",
  },
  mara: {
    id: "c2",
    handle: "maravisuals",
    displayName: "Mara Osei",
    discipline: "Photographer",
    avatarUrl: "/placeholder.svg?height=40&width=40",
    isFollowed: true,
    followerCount: 11340,
    postCount: 318,
    onRelay: true,
    patronTierLabel: "Supporter",
  },
  james: {
    id: "c3",
    handle: "jthorne",
    displayName: "James Thorne",
    discipline: "Music Producer",
    avatarUrl: "/placeholder.svg?height=40&width=40",
    isFollowed: true,
    followerCount: 6210,
    postCount: 89,
    onRelay: true,
    patronTierLabel: "Supporter",
  },
  nadia: {
    id: "c4",
    handle: "nadiabloom",
    displayName: "Nadia Bloom",
    discipline: "Illustrator",
    avatarUrl: "/placeholder.svg?height=40&width=40",
    isFollowed: true,
    followerCount: 8940,
    postCount: 203,
    onRelay: true,
    patronTierLabel: "Studio",
  },
  liu: {
    id: "c5",
    handle: "liuzhang",
    displayName: "Liu Zhang",
    discipline: "Cinematographer",
    avatarUrl: "/placeholder.svg?height=40&width=40",
    isFollowed: true,
    followerCount: 3670,
    postCount: 67,
    onRelay: true,
    patronTierLabel: "Free",
  },
  /** Followed on Patreon only — not on Relay yet (mock). */
  samPatreonOnly: {
    id: "c8",
    handle: "samrivera",
    displayName: "Sam Rivera",
    discipline: "Composer",
    avatarUrl: "/placeholder.svg?height=40&width=40",
    isFollowed: true,
    followerCount: 2100,
    postCount: 0,
    onRelay: false,
    patreonCreatorUrl: "https://www.patreon.com/collection/example_sam_rivera",
    patronTierLabel: "Supporter",
  },
  rileyPatreonOnly: {
    id: "c9",
    handle: "rileycho",
    displayName: "Riley Cho",
    discipline: "3D Artist",
    avatarUrl: "/placeholder.svg?height=40&width=40",
    isFollowed: true,
    followerCount: 15400,
    postCount: 0,
    onRelay: false,
    patreonCreatorUrl: "https://www.patreon.com/collection/example_riley_cho",
    patronTierLabel: "Supporter",
  },
  kai: {
    id: "c6",
    handle: "kaimoretti",
    displayName: "Kai Moretti",
    discipline: "Writer & Architect",
    avatarUrl: "/placeholder.svg?height=40&width=40",
    isFollowed: false,
    followerCount: 2110,
    postCount: 44,
  },
  priya: {
    id: "c7",
    handle: "priyavisions",
    displayName: "Priya Nair",
    discipline: "Documentary Photographer",
    avatarUrl: "/placeholder.svg?height=40&width=40",
    isFollowed: false,
    followerCount: 5830,
    postCount: 127,
  },
} satisfies Record<string, Creator>;

// ── Mock positional comments ──────────────────────────────────────────────

/** Pins on the patron feed preview image (portrait) — for gallery hover UX testing */
const MOCK_COMMENTS_PORTRAIT_PREVIEW: PositionalComment[] = [
  {
    id: "cm-p1a",
    author: {
      id: "v9",
      displayName: "Alex R.",
      handle: "alexr",
      avatarUrl: "/placeholder.svg?height=32&width=32",
    },
    text: "The palette against the background reads like ink wash — beautiful restraint.",
    position: { x: 52, y: 38 },
    createdAt: "20 min ago",
  },
  {
    id: "cm-p1b",
    author: {
      id: "v8",
      displayName: "Sam K.",
      handle: "samk",
      avatarUrl: "/placeholder.svg?height=32&width=32",
    },
    text: "The earpiece detail is doing so much work here.",
    position: { x: 28, y: 62 },
    createdAt: "12 min ago",
  },
];

const MOCK_COMMENTS: PositionalComment[] = [
  {
    id: "cm1",
    author: {
      id: "v1",
      displayName: "Jordan M.",
      handle: "jordanm",
      avatarUrl: "/placeholder.svg?height=32&width=32",
    },
    text: "The way the light catches the ridge here is stunning. Reminds me of Caspar David Friedrich.",
    position: { x: 72, y: 34 },
    createdAt: "2 hours ago",
    tags: ["golden hour", "landscape"],
  },
  {
    id: "cm2",
    author: {
      id: "c3",
      displayName: "James Thorne",
      handle: "jthorne",
      avatarUrl: "/placeholder.svg?height=32&width=32",
    },
    text: "This texture is incredible. What lens did you use?",
    position: { x: 28, y: 65 },
    createdAt: "1 hour ago",
    tags: ["texture", "technique"],
  },
  {
    id: "cm3",
    author: {
      id: "c4",
      displayName: "Nadia Bloom",
      handle: "nadiabloom",
      avatarUrl: "/placeholder.svg?height=32&width=32",
    },
    text: "Perfect composition. The negative space here really lets the subject breathe.",
    position: { x: 15, y: 22 },
    createdAt: "45 min ago",
  },
];

// ── Shared demo media (p1 classic vs p2 inline — same URLs for side-by-side compare) ──

const DEMO_RELAY_GALLERY_IMAGES = [
  "/patron-feed-preview.png",
  "https://images.unsplash.com/photo-1604871000636-074fa5117945?w=900&q=80",
] as const;

// ── Feed posts (~75 % followed, ~25 % discovery) ──────────────────────────

export const FEED_POSTS: FeedPost[] = [
  {
    id: "p1",
    kind: "followed",
    creator: CREATORS.elena,
    title: "On Silence and the Digital Commons",
    excerpt:
      "What does it mean to claim quiet in an attention economy? This essay explores the tension between creative withdrawal and the infrastructure we depend on to share work at all.",
    description:
      "In this essay, I explore the paradox of creative silence in an age that demands constant visibility. How do we reconcile the need for quiet contemplation with the infrastructure of attention that sustains our work? Drawing on conversations with artists who have stepped back from public platforms, I trace the contours of a different kind of practice—one that treats withdrawal not as failure but as method.",
    mediaType: "writing",
    feedCardLayout: "classic",
    coverImageUrl: "/patron-feed-preview.png",
    highResImageUrl: "/patron-feed-preview.png",
    galleryImageUrls: [...DEMO_RELAY_GALLERY_IMAGES],
    publishedAt: "1 hour ago",
    readTimeLabel: "6 min read",
    likeCount: 214,
    commentCount: 31,
    tierLabel: "Supporter",
    communityTags: ["essay", "digital culture", "attention economy", "creative practice"],
    comments: MOCK_COMMENTS_PORTRAIT_PREVIEW,
  },
  {
    id: "p2",
    kind: "followed",
    creator: CREATORS.mara,
    title: "Winter Light Series, Vol. 3",
    excerpt:
      "Fourteen frames from December and January, shot on medium format in the Scottish Highlands. This volume focuses on the quality of light at the threshold of dusk.",
    description:
      "This series was shot over six weeks in the Scottish Highlands during the darkest months of winter. I was drawn to the way light behaves at the threshold of dusk—that liminal moment when color drains from the landscape and everything becomes shape and silhouette. These fourteen frames are my attempt to hold onto that fleeting quality, to preserve the feeling of standing alone in a vast, quiet place as day surrenders to night.",
    mediaType: "photo",
    feedCardLayout: "inlineMedia",
    coverImageUrl: "/patron-feed-preview.png",
    highResImageUrl: "/patron-feed-preview.png",
    galleryImageUrls: [...DEMO_RELAY_GALLERY_IMAGES],
    publishedAt: "3 hours ago",
    readTimeLabel: "14 photos",
    likeCount: 589,
    commentCount: 47,
    tierLabel: "Supporter",
    mediaCount: 14,
    comments: MOCK_COMMENTS_PORTRAIT_PREVIEW,
    communityTags: ["landscape", "Scotland", "medium format", "winter", "golden hour"],
  },
  {
    id: "p3",
    kind: "followed",
    creator: CREATORS.james,
    title: "Process Notes: Track 14",
    excerpt:
      "A behind-the-scenes look at how I layered the drone stems for the closing track. Includes exported stems and a voice memo recorded during the session.",
    mediaType: "audio",
    coverImageUrl: "/placeholder.svg?height=200&width=360",
    publishedAt: "5 hours ago",
    readTimeLabel: "12 min listen",
    likeCount: 178,
    commentCount: 24,
    tierLabel: "Supporter",
  },
  {
    id: "p4",
    kind: "followed",
    creator: CREATORS.nadia,
    title: "Sketchbook Archive: February",
    excerpt:
      "Forty pages of in-progress sketches, thumbnails, and colour studies from last month. Some are for upcoming projects; most are experiments I kept coming back to.",
    mediaType: "photo",
    coverImageUrl: "/placeholder.svg?height=200&width=360",
    publishedAt: "7 hours ago",
    readTimeLabel: "40 images",
    likeCount: 421,
    commentCount: 38,
    tierLabel: "Supporter",
    mediaCount: 40,
    comments: MOCK_COMMENTS,
  },
  // ── Discovery buffer (~25 %) ────────────────────────────────────────────
  {
    id: "p5",
    kind: "discovery",
    creator: CREATORS.kai,
    title: "The Architecture of Trust",
    excerpt:
      "Buildings are not just structures — they encode relationships. An essay on how spatial design shapes the unspoken contracts between the people who inhabit shared space.",
    mediaType: "writing",
    coverImageUrl: "/placeholder.svg?height=200&width=360",
    publishedAt: "2 days ago",
    readTimeLabel: "8 min read",
    likeCount: 892,
    commentCount: 64,
    tierLabel: "Free",
  },
  {
    id: "p6",
    kind: "discovery",
    creator: CREATORS.priya,
    title: "Coastal Series: Monsoon",
    excerpt:
      "Shot over three weeks along the Kerala coast during peak monsoon. These twelve photographs document the rhythm of rain, fishing communities, and the changing shoreline.",
    mediaType: "photo",
    coverImageUrl: "/placeholder.svg?height=200&width=360",
    publishedAt: "3 days ago",
    readTimeLabel: "12 photos",
    likeCount: 1340,
    commentCount: 89,
    tierLabel: "Free",
    mediaCount: 12,
  },
  // ── Back to followed ────────────────────────────────────────────────────
  {
    id: "p7",
    kind: "followed",
    creator: CREATORS.liu,
    title: "Shooting in Fog: Technical Notes",
    excerpt:
      "How I handle exposure, autofocus, and post-processing when the atmosphere refuses to cooperate. Includes my current LUT pack and a short demo reel.",
    mediaType: "video",
    coverImageUrl: "/placeholder.svg?height=200&width=360",
    publishedAt: "1 day ago",
    readTimeLabel: "18 min watch",
    likeCount: 304,
    commentCount: 42,
    tierLabel: "Supporter",
  },
  {
    id: "p8",
    kind: "followed",
    creator: CREATORS.elena,
    title: "Reading List: March 2026",
    excerpt:
      "Seven books that shaped how I am thinking about labour, landscape, and language this month. Brief notes on each, with page references to passages I keep returning to.",
    mediaType: "writing",
    publishedAt: "2 days ago",
    readTimeLabel: "4 min read",
    likeCount: 156,
    commentCount: 19,
    tierLabel: "Supporter",
  },
];

// ── Current viewer ─────────────────────────────────────────────────────────

export const CURRENT_VIEWER: CurrentViewer = {
  id: "v1",
  displayName: "Jordan M.",
  handle: "jordanm",
  avatarUrl: "/placeholder.svg?height=36&width=36",
  followingCount: 5,
  notificationCount: 3,
};

// ── Search suggestions (command palette mock) ─────────────────────────────

export const SEARCH_SUGGESTIONS: SearchSuggestion[] = [
  {
    id: "s1",
    kind: "query",
    label: "music production process",
    sublabel: "Recent search",
  },
  {
    id: "s2",
    kind: "query",
    label: "photography essays",
    sublabel: "Recent search",
  },
  {
    id: "s3",
    kind: "query",
    label: "illustration sketchbook",
    sublabel: "Recent search",
  },
  {
    id: "s4",
    kind: "creator",
    label: "Marcus Webb",
    sublabel: "Sound artist · 3.2k followers",
    avatarUrl: "/placeholder.svg?height=32&width=32",
  },
  {
    id: "s5",
    kind: "creator",
    label: "Kai Moretti",
    sublabel: "Writer & Architect · 2.1k followers",
    avatarUrl: "/placeholder.svg?height=32&width=32",
  },
  {
    id: "s6",
    kind: "post",
    label: "Process Notes: Track 14",
    sublabel: "James Thorne · 5 hours ago",
  },
  {
    id: "s7",
    kind: "post",
    label: "Winter Light Series, Vol. 3",
    sublabel: "Mara Osei · 3 hours ago",
  },
];

// ── Sidebar: followed creators list ───────────────────────────────────────

export const FOLLOWED_CREATORS: Creator[] = [
  CREATORS.elena,
  CREATORS.mara,
  CREATORS.james,
  CREATORS.nadia,
  CREATORS.liu,
  CREATORS.samPatreonOnly,
  CREATORS.rileyPatreonOnly,
];

/** On-Relay creators first; Patreon-only follows last (stable within each group). */
export function sortFollowedForSidebar(creators: Creator[]): Creator[] {
  return [...creators].sort((a, b) => {
    const ar = a.onRelay !== false ? 1 : 0;
    const br = b.onRelay !== false ? 1 : 0;
    if (ar !== br) return br - ar;
    return a.displayName.localeCompare(b.displayName);
  });
}

export interface FormerSubscriptionRow {
  id: string;
  creator: Creator;
  endedAtLabel: string;
  tierLabel: TierLabel;
  patreonCreatorUrl: string;
}

export const FORMER_SUBSCRIPTIONS: FormerSubscriptionRow[] = [
  {
    id: "fs1",
    creator: CREATORS.kai,
    endedAtLabel: "Ended 3 weeks ago",
    tierLabel: "Supporter",
    patreonCreatorUrl: "https://www.patreon.com/collection/example_kai_moretti",
  },
  {
    id: "fs2",
    creator: CREATORS.priya,
    endedAtLabel: "Ended 2 months ago",
    tierLabel: "Studio",
    patreonCreatorUrl: "https://www.patreon.com/collection/example_priya",
  },
];

// ── Discover grid items ───────────────────────────────────────────────────

export interface DiscoverItem {
  id: string;
  creator: Creator;
  title: string;
  imageUrl: string;
  aspectRatio: "square" | "portrait" | "landscape" | "wide";
  mediaType: MediaType;
  likeCount: number;
  commentCount: number;
}

export const DISCOVER_ITEMS: DiscoverItem[] = [
  {
    id: "d1",
    creator: CREATORS.mara,
    title: "Golden Hour at the Cliffs",
    imageUrl: "/placeholder.svg?height=400&width=300",
    aspectRatio: "portrait",
    mediaType: "photo",
    likeCount: 1240,
    commentCount: 89,
  },
  {
    id: "d2",
    creator: CREATORS.nadia,
    title: "Character Study #42",
    imageUrl: "/placeholder.svg?height=300&width=300",
    aspectRatio: "square",
    mediaType: "photo",
    likeCount: 892,
    commentCount: 56,
  },
  {
    id: "d3",
    creator: CREATORS.priya,
    title: "Monsoon Fishermen",
    imageUrl: "/placeholder.svg?height=250&width=400",
    aspectRatio: "landscape",
    mediaType: "photo",
    likeCount: 2100,
    commentCount: 134,
  },
  {
    id: "d4",
    creator: CREATORS.liu,
    title: "Fog Composition Study",
    imageUrl: "/placeholder.svg?height=500&width=300",
    aspectRatio: "portrait",
    mediaType: "video",
    likeCount: 756,
    commentCount: 42,
  },
  {
    id: "d5",
    creator: CREATORS.kai,
    title: "Urban Negative Space",
    imageUrl: "/placeholder.svg?height=300&width=500",
    aspectRatio: "wide",
    mediaType: "photo",
    likeCount: 1890,
    commentCount: 98,
  },
  {
    id: "d6",
    creator: CREATORS.elena,
    title: "Visual Essay: Silence",
    imageUrl: "/placeholder.svg?height=350&width=350",
    aspectRatio: "square",
    mediaType: "photo",
    likeCount: 634,
    commentCount: 71,
  },
  {
    id: "d7",
    creator: CREATORS.james,
    title: "Sound Waves Visualized",
    imageUrl: "/placeholder.svg?height=280&width=400",
    aspectRatio: "landscape",
    mediaType: "video",
    likeCount: 1120,
    commentCount: 63,
  },
  {
    id: "d8",
    creator: CREATORS.mara,
    title: "Dusk in the Highlands",
    imageUrl: "/placeholder.svg?height=450&width=300",
    aspectRatio: "portrait",
    mediaType: "photo",
    likeCount: 2340,
    commentCount: 156,
  },
  {
    id: "d9",
    creator: CREATORS.nadia,
    title: "Ink & Motion",
    imageUrl: "/placeholder.svg?height=300&width=300",
    aspectRatio: "square",
    mediaType: "photo",
    likeCount: 987,
    commentCount: 48,
  },
  {
    id: "d10",
    creator: CREATORS.priya,
    title: "Shore at Dawn",
    imageUrl: "/placeholder.svg?height=300&width=450",
    aspectRatio: "landscape",
    mediaType: "photo",
    likeCount: 1560,
    commentCount: 82,
  },
  {
    id: "d11",
    creator: CREATORS.liu,
    title: "Cinematic Frames",
    imageUrl: "/placeholder.svg?height=400&width=280",
    aspectRatio: "portrait",
    mediaType: "video",
    likeCount: 890,
    commentCount: 37,
  },
  {
    id: "d12",
    creator: CREATORS.kai,
    title: "Structural Poetry",
    imageUrl: "/placeholder.svg?height=320&width=320",
    aspectRatio: "square",
    mediaType: "photo",
    likeCount: 1230,
    commentCount: 94,
  },
];

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = "like" | "comment" | "follow" | "mention";

export interface Notification {
  id: string;
  type: NotificationType;
  actor: Creator;
  target?: {
    id: string;
    title: string;
  };
  message: string;
  timestamp: string;
  read: boolean;
}

export const NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    type: "like",
    actor: CREATORS.mara,
    target: { id: "p1", title: "On Silence and the Digital Commons" },
    message: "liked your essay",
    timestamp: "2 minutes ago",
    read: false,
  },
  {
    id: "n2",
    type: "comment",
    actor: CREATORS.nadia,
    target: { id: "p2", title: "Winter Light Series, Vol. 3" },
    message: "commented on your photo",
    timestamp: "15 minutes ago",
    read: false,
  },
  {
    id: "n3",
    type: "follow",
    actor: CREATORS.priya,
    message: "started following you",
    timestamp: "1 hour ago",
    read: true,
  },
  {
    id: "n4",
    type: "like",
    actor: CREATORS.james,
    target: { id: "p3", title: "Sound Waves Visualized" },
    message: "liked your video",
    timestamp: "3 hours ago",
    read: true,
  },
  {
    id: "n5",
    type: "mention",
    actor: CREATORS.liu,
    message: "mentioned you in a comment",
    timestamp: "1 day ago",
    read: true,
  },
];

export type PatronFeedDataSource = "fixtures" | "live";

/** Shape returned by `GET /api/v1/patron/relay_feed` (see `patron-feed-api.ts`). */
export interface PatronFeedBundle {
  feedPosts: FeedPost[];
  discoverItems: DiscoverItem[];
  currentViewer: CurrentViewer;
  followedCreators: Creator[];
  notifications: Notification[];
}

export function getPatronFeedFixtureBundle(): PatronFeedBundle {
  return {
    feedPosts: FEED_POSTS,
    discoverItems: DISCOVER_ITEMS,
    currentViewer: CURRENT_VIEWER,
    followedCreators: sortFollowedForSidebar(FOLLOWED_CREATORS),
    notifications: NOTIFICATIONS,
  };
}

// ── Library: Collections & Favorites ──────────────────────────────────────

export interface LibraryImage {
  id: string;
  title: string;
  imageUrl: string;
  creator: Creator;
  collectionId: string;
  vibe: "moody" | "vibrant" | "minimal" | "chaotic" | "serene" | "energetic";
  tags: string[];
  savedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  imageCount: number;
  images: LibraryImage[];
}

export const LIBRARY_IMAGES: LibraryImage[] = [
  {
    id: "lib1",
    title: "Fog Over Water",
    imageUrl: "/placeholder.svg?height=300&width=300",
    creator: CREATORS.mara,
    collectionId: "col1",
    vibe: "moody",
    tags: ["landscape", "fog", "minimalist"],
    savedAt: "2 weeks ago",
  },
  {
    id: "lib2",
    title: "Urban Energy",
    imageUrl: "/placeholder.svg?height=300&width=300",
    creator: CREATORS.kai,
    collectionId: "col1",
    vibe: "vibrant",
    tags: ["city", "color", "contemporary"],
    savedAt: "1 week ago",
  },
  {
    id: "lib3",
    title: "Quiet Moments",
    imageUrl: "/placeholder.svg?height=300&width=300",
    creator: CREATORS.elena,
    collectionId: "col2",
    vibe: "serene",
    tags: ["peaceful", "introspective", "subtle"],
    savedAt: "3 days ago",
  },
  {
    id: "lib4",
    title: "Abstract Motion",
    imageUrl: "/placeholder.svg?height=300&width=300",
    creator: CREATORS.james,
    collectionId: "col2",
    vibe: "energetic",
    tags: ["dynamic", "experimental", "vibrant"],
    savedAt: "1 day ago",
  },
];

export const LIBRARY_COLLECTIONS: Collection[] = [
  {
    id: "col1",
    name: "Favorites",
    description: "My favorite discoveries",
    imageCount: 12,
    images: LIBRARY_IMAGES.filter((img) => img.collectionId === "col1"),
  },
  {
    id: "col2",
    name: "Inspiration Board",
    description: "Mood and aesthetic references",
    imageCount: 8,
    images: LIBRARY_IMAGES.filter((img) => img.collectionId === "col2"),
  },
];
