/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it, vi } from "vitest";

const relayFetch = vi.fn();

vi.mock("@/lib/relay-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-api")>();
  return {
    ...actual,
    relayFetch: (...args: Parameters<typeof actual.relayFetch>) => relayFetch(...args)
  };
});

import { fetchPatronRelayFeed, fetchPatronRelayFeedWithOptions } from "../../web/lib/patron-feed-api";

const emptyBundle = {
  feedPosts: [],
  discoverItems: [],
  currentViewer: {
    id: "v1",
    displayName: "viewer",
    handle: "viewer",
    avatarUrl: "/placeholder.svg",
    followingCount: 0,
    notificationCount: 0
  },
  followedCreators: [],
  notifications: []
};

describe("fetchPatronRelayFeed → Relay API paths", () => {
  beforeEach(() => {
    relayFetch.mockReset();
    relayFetch.mockResolvedValue(emptyBundle);
  });

  it("calls GET /api/v1/patron/relay_feed (local API contract)", async () => {
    await fetchPatronRelayFeed();
    expect(relayFetch).toHaveBeenCalledTimes(1);
    expect(relayFetch).toHaveBeenCalledWith("/api/v1/patron/relay_feed");
  });

  it("calls GET /api/v1/patron/feed with query when options set", async () => {
    await fetchPatronRelayFeedWithOptions({ cursor: "abc", limit: 10, filter: "following" });
    expect(relayFetch).toHaveBeenCalledWith("/api/v1/patron/feed?cursor=abc&limit=10&filter=following");
  });
});
