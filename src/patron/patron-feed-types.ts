/**
 * PE-B — JSON shape for `GET /api/v1/patron/relay_feed` / `GET /api/v1/patron/feed`
 * (aligned with `web/lib/relay-fixtures.ts` `PatronFeedBundle`).
 */
export type PatronFeedTierLabel = "Free" | "Supporter" | "Studio";

export type PatronFeedCreatorJson = {
  id: string;
  handle: string;
  displayName: string;
  discipline: string;
  avatarUrl: string;
  isFollowed: boolean;
  followerCount: number;
  postCount: number;
  onRelay?: boolean;
  patreonCreatorUrl?: string;
  patronTierLabel?: PatronFeedTierLabel;
};

export type PatronFeedPostJson = {
  id: string;
  kind: "followed" | "discovery";
  creator: PatronFeedCreatorJson;
  title: string;
  excerpt: string;
  description?: string;
  mediaType: "writing" | "photo" | "audio" | "video";
  /** Primary asset MIME from export row (`MediaAsset.current_mime_type`). Drives GIF/video vs still UI. */
  primaryMimeType?: string | null;
  /** Optional still for video card/modal `poster` when ingest provides one (future). */
  posterImageUrl?: string | null;
  coverImageUrl?: string;
  highResImageUrl?: string;
  galleryImageUrls?: string[];
  publishedAt: string;
  readTimeLabel?: string;
  likeCount: number;
  commentCount: number;
  tierLabel: PatronFeedTierLabel;
  mediaCount?: number;
  comments?: unknown[];
  communityTags?: string[];
  feedCardLayout?: "classic" | "inlineMedia";
};

export type PatronFeedCurrentViewerJson = {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  followingCount: number;
  notificationCount: number;
};

export type PatronFeedBundleJson = {
  feedPosts: PatronFeedPostJson[];
  discoverItems: unknown[];
  currentViewer: PatronFeedCurrentViewerJson;
  followedCreators: PatronFeedCreatorJson[];
  notifications: unknown[];
  /** Opaque cursor for the next page (PE-B pagination). */
  next_cursor?: string | null;
};
