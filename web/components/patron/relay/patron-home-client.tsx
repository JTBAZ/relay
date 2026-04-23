"use client";

import { useMemo, useState, useCallback } from "react";
import { RelayShell } from "./relay-shell";
import { FeedCard } from "./feed-card";
import { FeedSectionDivider } from "./feed-section-divider";
import { EmptyState } from "./empty-state";
import { ErrorBanner } from "./error-banner";
import { CommandPalette } from "./command-palette";
import { GalleryView } from "./gallery-view";
import { FEED_POSTS, type FeedPost } from "@/lib/relay-fixtures";
import { type FeedFilter } from "./filter-chips";

/**
 * Toggle these flags to preview different feed states during development.
 * Cursor will replace with live API state derived from NEXT_PUBLIC_RELAY_API_URL.
 */
const DEMO_EMPTY_FOLLOWS = false;
const DEMO_ERROR_BANNER = false;

function filterPosts(posts: FeedPost[], filter: FeedFilter): FeedPost[] {
  switch (filter) {
    case "following":
      return posts.filter((p) => p.kind === "followed");
    case "free":
      return posts.filter((p) => p.tierLabel === "Free" || p.kind === "discovery");
    case "photos":
      return posts.filter((p) => p.mediaType === "photo");
    case "audio":
      return posts.filter((p) => p.mediaType === "audio");
    case "writing":
      return posts.filter((p) => p.mediaType === "writing");
    default:
      return posts;
  }
}

export function PatronHomeClient() {
  const [activeFilter, setActiveFilter] = useState<FeedFilter>("all");
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const openCommand = () => setCommandOpen(true);

  const filteredPosts = useMemo(
    () => filterPosts(FEED_POSTS, activeFilter),
    [activeFilter]
  );

  // Pre-compute where the discovery section break should appear
  const enrichedPosts = useMemo(() => {
    let dividerInserted = false;
    return filteredPosts.map((post) => {
      const showDivider = post.kind === "discovery" && !dividerInserted;
      if (showDivider) dividerInserted = true;
      return { post, showDivider };
    });
  }, [filteredPosts]);

  // Gallery navigation
  const selectedPostIndex = selectedPost
    ? filteredPosts.findIndex((p) => p.id === selectedPost.id)
    : -1;

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (selectedPostIndex === -1) return;
      const newIndex =
        direction === "prev" ? selectedPostIndex - 1 : selectedPostIndex + 1;
      if (newIndex >= 0 && newIndex < filteredPosts.length) {
        setSelectedPost(filteredPosts[newIndex]);
      }
    },
    [selectedPostIndex, filteredPosts]
  );

  return (
    <>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      <RelayShell
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onSearchOpen={openCommand}
      >
        <div className="space-y-3">
          {/* Stale session / error state */}
          {DEMO_ERROR_BANNER && <ErrorBanner />}

          {/* Empty follows state */}
          {DEMO_EMPTY_FOLLOWS ? (
            <EmptyState onSearch={openCommand} />
          ) : filteredPosts.length === 0 ? (
            /* Filter returned nothing */
            <div className="flex flex-col items-center py-20 text-center">
              <p className="text-sm text-[#5A5A5A]">
                No posts match this filter.
              </p>
              <button
                onClick={() => setActiveFilter("all")}
                className="mt-4 text-sm text-[#2D6A4F] hover:text-[#40916C] transition-colors duration-150"
              >
                Show all posts
              </button>
            </div>
          ) : (
            /* Healthy feed */
            enrichedPosts.map(({ post, showDivider }) => (
              <div key={post.id}>
                {showDivider && (
                  <FeedSectionDivider
                    label="Free to read"
                    sublabel="Creators you don't follow yet"
                  />
                )}
                <FeedCard post={post} onClick={() => setSelectedPost(post)} />
              </div>
            ))
          )}
        </div>
      </RelayShell>

      {/* Gallery modal — after shell in DOM so it stacks above the feed; opaque backdrop hides feed “ghost” */}
      {selectedPost && (
        <GalleryView
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onNavigate={handleNavigate}
          hasPrev={selectedPostIndex > 0}
          hasNext={selectedPostIndex < filteredPosts.length - 1}
        />
      )}
    </>
  );
}
