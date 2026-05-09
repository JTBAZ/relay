/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FeedCard } from "../../web/components/patron/relay/feed-card";
import { getPatronFeedFixtureBundle } from "../../web/lib/relay-fixtures";

describe("FeedCard P6-patron-003 — Subscribed vs Discover", () => {
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

  it("shows Subscribed when feed_item_source is subscribed", () => {
    const post = getPatronFeedFixtureBundle().feedPosts.find(
      (p) => p.feed_item_source === "subscribed"
    );
    expect(post).toBeTruthy();
    render(<FeedCard post={post!} />);
    expect(screen.getByText("Subscribed")).toBeTruthy();
    expect(screen.queryByText("Discover")).toBeNull();
  });
});
