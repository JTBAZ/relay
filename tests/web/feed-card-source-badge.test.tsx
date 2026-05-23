/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FeedCard } from "../../web/components/patron/relay/feed-card";
import { getPatronFeedFixtureBundle } from "../../web/lib/relay-fixtures";

describe("FeedCard P6-patron-003 — patron tier vs Discover", () => {
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

  it("shows patron tier chip instead of Subscribed for subscribed feed items", () => {
    const post = getPatronFeedFixtureBundle().feedPosts.find(
      (p) =>
        p.feed_item_source === "subscribed" &&
        p.creator.patronTierLabel === "Studio"
    );
    expect(post).toBeTruthy();
    render(<FeedCard post={post!} />);
    expect(screen.queryByText("Subscribed")).toBeNull();
    expect(screen.getByText("Studio")).toBeTruthy();
    expect(screen.queryByText("Discover")).toBeNull();
  });

  it("consolidates duplicate patron tier and post tier badges", () => {
    const post = getPatronFeedFixtureBundle().feedPosts.find(
      (p) =>
        p.feed_item_source === "subscribed" &&
        p.creator.patronTierLabel === "Supporter" &&
        p.tierLabel === "Supporter"
    );
    expect(post).toBeTruthy();
    render(<FeedCard post={post!} />);
    expect(screen.getAllByText("Supporter")).toHaveLength(1);
  });

  it("keeps post Free badge when patron tier differs", () => {
    const post = getPatronFeedFixtureBundle().feedPosts.find(
      (p) =>
        p.feed_item_source === "subscribed" &&
        p.creator.patronTierLabel === "Studio" &&
        p.tierLabel === "Supporter"
    );
    expect(post).toBeTruthy();
    render(<FeedCard post={post!} />);
    expect(screen.getByText("Studio")).toBeTruthy();
    expect(screen.getByText("Supporter")).toBeTruthy();
  });
});
