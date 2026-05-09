/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PatronEmptyFeedState } from "../../web/components/patron/relay/patron-empty-feed-state";

describe("PatronEmptyFeedState P6-patron-005", () => {
  afterEach(() => {
    cleanup();
  });

  it("live_oauth: explains connect + link to Patreon", () => {
    render(<PatronEmptyFeedState variant="live_oauth" />);
    const block = screen.getByTestId("patron-empty-feed-oauth");
    expect(block.textContent).toMatch(/home feed/i);
    const link = screen.getByRole("link", { name: /continue to patreon/i });
    expect(link.getAttribute("href")).toBe("/patreon/patron/connect");
  });

  it("live_no_follows: discover link", () => {
    render(<PatronEmptyFeedState variant="live_no_follows" />);
    expect(screen.getByTestId("patron-empty-feed-no-follows")).toBeTruthy();
    expect(screen.getByRole("link", { name: /go to discover/i }).getAttribute("href")).toBe(
      "/patron/discover"
    );
    expect(screen.getByText(/not following anyone/i)).toBeTruthy();
  });

  it("live_no_posts: reconnect hint + link", () => {
    render(<PatronEmptyFeedState variant="live_no_posts" />);
    expect(screen.getByTestId("patron-empty-feed-no-posts")).toBeTruthy();
    expect(screen.getByText(/no posts yet/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /reconnect patreon/i }).getAttribute("href")).toBe(
      "/patreon/patron/connect"
    );
  });

  it("filter_mismatch: reset button", () => {
    const onShowAll = vi.fn();
    render(<PatronEmptyFeedState variant="filter_mismatch" onShowAll={onShowAll} />);
    screen.getByRole("button", { name: /show all posts/i }).click();
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});
