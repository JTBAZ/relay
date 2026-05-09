import type { GalleryPostDetail } from "@/lib/relay-api";
import { RELAY_API_BASE } from "@/lib/relay-api";
import type { Creator, FeedPost } from "@/lib/relay-fixtures";

function absolutizeApiPath(p: string | null | undefined): string | undefined {
  const t = p?.trim();
  if (!t) return undefined;
  if (t.startsWith("/api/")) return `${RELAY_API_BASE}${t}`;
  return t;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tierLabelFromDetail(detail: GalleryPostDetail): FeedPost["tierLabel"] {
  if (detail.tiers.length === 0) return "Free";
  const paid = detail.tiers.some((t) => (t.amount_cents ?? 0) > 0);
  return paid ? "Supporter" : "Free";
}

/**
 * Builds a {@link FeedPost} for {@link GalleryView} from `GET /api/v1/gallery/post-detail`.
 * Paths are absolute so media loads from the Relay API origin in Next dev.
 */
export function galleryPostDetailToPatronFeedPost(
  relayCreatorId: string,
  detail: GalleryPostDetail,
  creator: Creator
): FeedPost {
  const media = detail.media;
  const first = media[0];
  const mime = (first?.mime_type ?? "").toLowerCase();
  let mediaType: FeedPost["mediaType"] = "photo";
  if (mime.startsWith("video/")) mediaType = "video";
  else if (mime.startsWith("audio/")) mediaType = "audio";
  else if (media.length === 0) mediaType = "writing";

  const content = absolutizeApiPath(first?.content_url_path);
  const preview = absolutizeApiPath(first?.preview_url_path);

  const galleryUrls = media
    .map(
      (m) =>
        absolutizeApiPath(m.content_url_path) ?? absolutizeApiPath(m.preview_url_path)
    )
    .filter((u): u is string => Boolean(u));

  const placeholder = "/placeholder.svg?height=800&width=1200";
  const tierLabel = tierLabelFromDetail(detail);
  const discoverish = tierLabel === "Free" && detail.tiers.length === 0;

  return {
    id: detail.post_id,
    kind: discoverish ? "discovery" : "followed",
    feed_item_source: discoverish ? "discover" : "subscribed",
    creator,
    title: detail.title,
    excerpt:
      stripHtml(detail.description ?? "").slice(0, 220) || detail.title.substring(0, 120),
    description: detail.description,
    mediaType,
    primaryMimeType: first?.mime_type ?? null,
    coverImageUrl:
      mediaType === "video"
        ? undefined
        : content ?? preview ?? "/placeholder.svg?height=600&width=1200",
    highResImageUrl: content ?? preview ?? placeholder,
    galleryImageUrls: galleryUrls.length > 1 ? galleryUrls : undefined,
    publishedAt: detail.published_at,
    likeCount: 0,
    commentCount: 0,
    tierLabel,
    feedCardLayout: "classic",
    communityTags: detail.tag_ids?.length ? detail.tag_ids : undefined
  };
}

/** Minimal creator when only `relayCreatorId` is known (API detail has no profile block). */
export function stubCreatorFromRelayId(relayCreatorId: string): Creator {
  const short = relayCreatorId.length > 10 ? `${relayCreatorId.slice(0, 6)}…` : relayCreatorId;
  return {
    id: relayCreatorId,
    handle: short,
    displayName: "Creator",
    discipline: "",
    avatarUrl: "/placeholder.svg?height=80&width=80",
    isFollowed: true,
    followerCount: 0,
    postCount: 0,
    onRelay: true,
    patronTierLabel: "Free"
  };
}
