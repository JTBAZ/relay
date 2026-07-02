/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FeedCard } from "../../web/components/patron/relay/feed-card";
import { getPatronFeedFixtureBundle } from "../../web/lib/relay-fixtures";

describe("FeedCard P6-patron-003 — post tier vs Discover", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows Discover when feed_item_source is discover", () => {
    const post = getPatronFeedFixtureBundle().feedPosts.find(
      (p) => p.feed_item_source === "discover"
    );
    expect(post).toBeTruthy();
    render(<FeedCard post={post!} />);
    expect(screen.getAllByText("Discover").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Subscribed")).toBeNull();
  });

  it("shows post tier chip in header for subscribed feed items", () => {
    const post = getPatronFeedFixtureBundle().feedPosts.find(
      (p) =>
        p.feed_item_source === "subscribed" &&
        p.tierLabel === "Supporter"
    );
    expect(post).toBeTruthy();
    render(<FeedCard post={post!} />);
    expect(screen.queryByText("Subscribed")).toBeNull();
    expect(screen.getByLabelText("Tier: Supporter")).toBeTruthy();
    expect(screen.queryByText("Discover")).toBeNull();
  });

  it("shows post tier once in header (not duplicated in footer)", () => {
    const post = getPatronFeedFixtureBundle().feedPosts.find(
      (p) =>
        p.feed_item_source === "subscribed" &&
        p.tierLabel === "Supporter"
    );
    expect(post).toBeTruthy();
    render(<FeedCard post={post!} />);
    expect(screen.getAllByText("Supporter")).toHaveLength(1);
  });

  it("shows post Free chip even when patron subscription tier differs", () => {
    const base = getPatronFeedFixtureBundle().feedPosts.find(
      (p) => p.feed_item_source === "subscribed"
    );
    expect(base).toBeTruthy();
    const post = {
      ...base!,
      tierLabel: "Free" as const,
      creator: {
        ...base!.creator,
        patronTierLabel: "Studio" as const,
      },
    };
    render(<FeedCard post={post} />);
    expect(screen.getByLabelText("Tier: Free")).toBeTruthy();
    expect(screen.queryByText("Studio")).toBeNull();
  });

  it("uses the inline media layout for classic single-media posts", () => {
    const post = getPatronFeedFixtureBundle().feedPosts.find(
      (p) =>
        p.feed_item_source === "subscribed" &&
        p.feedCardLayout === "classic" &&
        Boolean(p.coverImageUrl || p.highResImageUrl)
    );
    expect(post).toBeTruthy();

    render(<FeedCard post={post!} />);

    expect(screen.getByAltText(post!.title)).toBeTruthy();
    expect(screen.getAllByText("Comment").length).toBeGreaterThanOrEqual(1);
  });

  it("uses the edge rail for multi-media posts regardless of fixture layout", () => {
    const base = getPatronFeedFixtureBundle().feedPosts.find(
      (p) => p.feed_item_source === "subscribed"
    );
    expect(base).toBeTruthy();
    const post = {
      ...base!,
      id: "canonical_multi_media",
      feedCardLayout: "classic" as const,
      mediaItems: [
        { mediaId: "m1", url: "/one.png", mimeType: "image/png" },
        { mediaId: "m2", url: "/two.png", mimeType: "image/png" },
      ],
      galleryImageUrls: ["/one.png", "/two.png"],
    };

    render(<FeedCard post={post} />);

    expect(screen.getByLabelText("Open media rail (2 assets)")).toBeTruthy();
  });

  it("uses the hybrid media bar for the Dev Ava Idea 1 experiment only", () => {
    const base = getPatronFeedFixtureBundle().feedPosts.find(
      (p) => p.feed_item_source === "subscribed"
    );
    expect(base).toBeTruthy();
    const post = {
      ...base!,
      id: "pilot_post_ava_multi_gallery",
      mediaItems: [
        { mediaId: "m1", url: "/one.png", mimeType: "image/png" },
        { mediaId: "m2", url: "/two.png", mimeType: "image/png" },
        { mediaId: "m3", url: "/three.png", mimeType: "image/png" },
      ],
      galleryImageUrls: ["/one.png", "/two.png", "/three.png"],
    };

    render(<FeedCard post={post} />);

    expect(screen.getByLabelText("Open media actions (3 assets)")).toBeTruthy();
    expect(screen.getAllByLabelText("Snip").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByLabelText("Open media rail (3 assets)")).toBeNull();
  });
});
