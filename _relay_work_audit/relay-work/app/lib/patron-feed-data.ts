/** Mock fixture data for Patron Home (feed) — no NEXT_PUBLIC_* env vars required. */

export type FeedCreator = {
  id: string;
  name: string;
  avatarInitial: string;
  tier?: string;
};

export type FeedItem = {
  id: string;
  type: "followed" | "discovery";
  creator: FeedCreator;
  title: string;
  description: string;
  mediaType: "image" | "video" | "audio" | "text";
  thumbnailGradient: string;
  publishedAt: string;
  tier?: string;
  tags: string[];
  assetCount: number;
};

const FOLLOWED_CREATORS: FeedCreator[] = [
  { id: "c1", name: "Maren Voss", avatarInitial: "MV", tier: "Patron" },
  { id: "c2", name: "Studio Inkwell", avatarInitial: "SI", tier: "Collector" },
  { id: "c3", name: "Juno Park", avatarInitial: "JP", tier: "Supporter" },
  { id: "c4", name: "Ashwin Dey", avatarInitial: "AD", tier: "VIP" },
];

const DISCOVERY_CREATORS: FeedCreator[] = [
  { id: "d1", name: "Lior Castillo", avatarInitial: "LC" },
  { id: "d2", name: "Nyx Collective", avatarInitial: "NC" },
  { id: "d3", name: "Freya Blue", avatarInitial: "FB" },
];

export const MOCK_FEED_ITEMS: FeedItem[] = [
  {
    id: "f1",
    type: "followed",
    creator: FOLLOWED_CREATORS[0],
    title: "Autumn Tide — Process Reel",
    description: "Full process breakdown of the Autumn Tide series, from rough sketches to final render.",
    mediaType: "image",
    thumbnailGradient: "linear-gradient(135deg, #1b4332 0%, #2d6a4f 60%, #40916c 100%)",
    publishedAt: "2026-04-08T14:30:00Z",
    tier: "Patron",
    tags: ["process", "landscape", "digital"],
    assetCount: 12,
  },
  {
    id: "f2",
    type: "followed",
    creator: FOLLOWED_CREATORS[1],
    title: "Ink Study #47 — Motion Tests",
    description: "Animation experiments with traditional ink textures mapped to digital brushes.",
    mediaType: "video",
    thumbnailGradient: "linear-gradient(135deg, #0d1f17 0%, #1b4332 60%, #2d6a4f 100%)",
    publishedAt: "2026-04-08T10:15:00Z",
    tags: ["animation", "ink", "experimental"],
    assetCount: 3,
  },
  {
    id: "f3",
    type: "discovery",
    creator: DISCOVERY_CREATORS[0],
    title: "Cathedral Light — Free Series",
    description: "Public portfolio piece exploring stained glass and architecture.",
    mediaType: "image",
    thumbnailGradient: "linear-gradient(135deg, #1a1a2e 0%, #2d2d44 60%, #4a4a6a 100%)",
    publishedAt: "2026-04-07T22:00:00Z",
    tags: ["architecture", "light", "photography"],
    assetCount: 8,
  },
  {
    id: "f4",
    type: "followed",
    creator: FOLLOWED_CREATORS[2],
    title: "Character Design — Solaris",
    description: "Concept sketches and turnaround sheets for the Solaris project.",
    mediaType: "image",
    thumbnailGradient: "linear-gradient(135deg, #1b3a4b 0%, #2a6f97 60%, #468faf 100%)",
    publishedAt: "2026-04-07T18:45:00Z",
    tier: "Supporter",
    tags: ["character design", "concept art", "sci-fi"],
    assetCount: 6,
  },
  {
    id: "f5",
    type: "followed",
    creator: FOLLOWED_CREATORS[3],
    title: "Weekly Sketchbook Drop",
    description: "This week's sketches — cafés, commuters, and cats.",
    mediaType: "image",
    thumbnailGradient: "linear-gradient(135deg, #2d1b00 0%, #5c3a1e 60%, #8b6914 100%)",
    publishedAt: "2026-04-07T12:00:00Z",
    tier: "VIP",
    tags: ["sketchbook", "daily", "observational"],
    assetCount: 22,
  },
  {
    id: "f6",
    type: "discovery",
    creator: DISCOVERY_CREATORS[1],
    title: "Neon Botanical — Open Gallery",
    description: "Public collection of neon-lit botanical illustrations, free to browse.",
    mediaType: "image",
    thumbnailGradient: "linear-gradient(135deg, #0a1628 0%, #1a3a5c 60%, #2d6a8f 100%)",
    publishedAt: "2026-04-07T09:30:00Z",
    tags: ["botanical", "neon", "illustration"],
    assetCount: 15,
  },
  {
    id: "f7",
    type: "followed",
    creator: FOLLOWED_CREATORS[0],
    title: "Palette Breakdown — Earth Tones",
    description: "Color theory deep dive into the earthy palettes from last month's commissions.",
    mediaType: "text",
    thumbnailGradient: "linear-gradient(135deg, #2d1f0e 0%, #4a3728 60%, #6b5b4a 100%)",
    publishedAt: "2026-04-06T20:00:00Z",
    tags: ["color theory", "tutorial", "commissions"],
    assetCount: 1,
  },
  {
    id: "f8",
    type: "followed",
    creator: FOLLOWED_CREATORS[1],
    title: "Studio Tour — April Setup",
    description: "Quick tour of the workspace and new pen collection.",
    mediaType: "video",
    thumbnailGradient: "linear-gradient(135deg, #1a0f2e 0%, #2d1b4e 60%, #4a2d7a 100%)",
    publishedAt: "2026-04-06T15:30:00Z",
    tags: ["studio", "behind the scenes"],
    assetCount: 1,
  },
  {
    id: "f9",
    type: "discovery",
    creator: DISCOVERY_CREATORS[2],
    title: "Wave Study — Public Sketchbook",
    description: "Open sketchbook pages focusing on ocean wave forms and motion studies.",
    mediaType: "image",
    thumbnailGradient: "linear-gradient(135deg, #0d2818 0%, #1b4332 60%, #2d6a4f 100%)",
    publishedAt: "2026-04-06T08:00:00Z",
    tags: ["sketchbook", "ocean", "study"],
    assetCount: 4,
  },
  {
    id: "f10",
    type: "followed",
    creator: FOLLOWED_CREATORS[2],
    title: "Environment Art — Bioluminescent Caves",
    description: "Full environment paintings with lighting breakdowns and .PSD files.",
    mediaType: "image",
    thumbnailGradient: "linear-gradient(135deg, #0a1a2e 0%, #1b3a5c 60%, #2d5a8f 100%)",
    publishedAt: "2026-04-05T19:00:00Z",
    tier: "Supporter",
    tags: ["environment", "painting", "fantasy"],
    assetCount: 9,
  },
];

export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
