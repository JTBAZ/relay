/**
 * @fileoverview Patron experience module patron-feed-types.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 */
/**
 * PE-B — JSON shape for `GET /api/v1/patron/relay_feed` / `GET /api/v1/patron/feed`
 * (aligned with `web/lib/relay-fixtures.ts` `PatronFeedBundle`).
 */
/** `Tier.title` from the normalized catalog (e.g. Supporter, Studio, Backstage). */
export type PatronFeedTierLabel = string;

/** P6-patron-003 — honest feed labeling (membership-gated vs public). */
export type PatronFeedItemSource = "subscribed" | "discover";

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
  /** P6-patron-003 — drives patron tier vs “Discover” badges in the patron feed UI. */
  feed_item_source: PatronFeedItemSource;
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
  primaryMediaId?: string;
  mediaItems?: Array<{
    mediaId: string;
    url?: string;
    previewUrl?: string;
    mimeType?: string | null;
  }>;
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

/** Safe teaser metadata for followed-creator posts the patron cannot access. */
export type PatronFeedLockedPostJson = {
  id: string;
  creator: PatronFeedCreatorJson;
  title: string;
  mediaType: "writing" | "photo" | "audio" | "video";
  publishedAt: string;
  tierLabel: PatronFeedTierLabel;
  /** Slice 9 — discount-backed locked promo when resolved. */
  effective_promo?: {
    headline: string;
    cta_text: string;
    code: string | null;
    percent_off: number | null;
    tracked_url: string | null;
    source: "explicit" | "tier_default";
  } | null;
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
  lockedPosts: PatronFeedLockedPostJson[];
  discoverItems: unknown[];
  currentViewer: PatronFeedCurrentViewerJson;
  followedCreators: PatronFeedCreatorJson[];
  notifications: unknown[];
  /** Opaque cursor for the next page (PE-B pagination). */
  next_cursor?: string | null;
  /**
   * P6-patron-004 — true when any followed creator has a missing or stale `PatronEntitlementSnapshot`
   * (Postgres identity path only).
   */
  entitlement_degraded: boolean;
  /**
   * Earliest `stale_after` among snapshots that are past due (ISO-8601), or null when degraded only
   * because a snapshot is missing.
   */
  entitlement_stale_since: string | null;
};
