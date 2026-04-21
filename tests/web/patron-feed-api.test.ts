/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";
import { absolutizeMediaUrls } from "../../web/lib/patron-feed-api";
import { RELAY_API_BASE } from "../../web/lib/relay-api";
import type { FeedPost, PatronFeedBundle } from "../../web/lib/relay-fixtures";

function bundleWithPost(post: Partial<FeedPost>): PatronFeedBundle {
  return {
    feedPosts: [
      {
        id: "p1",
        kind: "followed",
        creator: {
          id: "rc1",
          handle: "creator",
          displayName: "Creator",
          discipline: "",
          avatarUrl: "/placeholder.svg",
          isFollowed: true,
          followerCount: 0,
          postCount: 0
        },
        title: "Orbitals",
        excerpt: "Orbitals",
        mediaType: "photo",
        publishedAt: "2026-04-11T20:18:50.000Z",
        likeCount: 0,
        commentCount: 0,
        tierLabel: "Free",
        ...post
      } as FeedPost
    ],
    discoverItems: [],
    currentViewer: {
      id: "v1",
      displayName: "viewer",
      handle: "viewer",
      avatarUrl: "/placeholder.svg",
      followingCount: 1,
      notificationCount: 0
    },
    followedCreators: [],
    notifications: []
  };
}

describe("absolutizeMediaUrls", () => {
  it("rewrites Relay export paths to absolute URLs against RELAY_API_BASE", () => {
    const out = absolutizeMediaUrls(
      bundleWithPost({
        coverImageUrl: "/api/v1/export/media/rc1/m1/preview",
        highResImageUrl: "/api/v1/export/media/rc1/m1/content"
      })
    );
    const post = out.feedPosts[0]!;
    expect(post.coverImageUrl).toBe(`${RELAY_API_BASE}/api/v1/export/media/rc1/m1/preview`);
    expect(post.highResImageUrl).toBe(`${RELAY_API_BASE}/api/v1/export/media/rc1/m1/content`);
  });

  it("leaves placeholders and already-absolute URLs untouched", () => {
    const out = absolutizeMediaUrls(
      bundleWithPost({
        coverImageUrl: "/placeholder.svg?height=600&width=1200",
        highResImageUrl: "https://cdn.example.com/x.jpg"
      })
    );
    const post = out.feedPosts[0]!;
    expect(post.coverImageUrl).toBe("/placeholder.svg?height=600&width=1200");
    expect(post.highResImageUrl).toBe("https://cdn.example.com/x.jpg");
  });

  it("rewrites every gallery URL that starts with /api/", () => {
    const out = absolutizeMediaUrls(
      bundleWithPost({
        galleryImageUrls: [
          "/api/v1/export/media/rc1/m1/content",
          "/placeholder.svg",
          "https://example.com/keep.jpg"
        ]
      })
    );
    expect(out.feedPosts[0]!.galleryImageUrls).toEqual([
      `${RELAY_API_BASE}/api/v1/export/media/rc1/m1/content`,
      "/placeholder.svg",
      "https://example.com/keep.jpg"
    ]);
  });
});
