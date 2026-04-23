import type { FeedPost } from "@/lib/relay-fixtures";

/** Lowercased primary MIME when present. */
export function patronFeedPrimaryMime(post: FeedPost): string {
  return (post.primaryMimeType ?? "").toLowerCase().trim();
}

/** True when the primary asset should use `<video>` (not animated GIF — those stay `<img>`). */
export function isPatronFeedVideoPost(post: FeedPost): boolean {
  const m = patronFeedPrimaryMime(post);
  if (m.startsWith("video/")) return true;
  return post.mediaType === "video";
}

/** Full blob URL for playback (`/content`), absolutized after fetch. */
export function patronFeedPlaybackSrc(post: FeedPost): string {
  return (
    post.highResImageUrl ||
    post.coverImageUrl ||
    "/placeholder.svg?height=800&width=1200"
  );
}

export function patronFeedPosterSrc(post: FeedPost): string | undefined {
  const p = post.posterImageUrl?.trim();
  return p || undefined;
}
