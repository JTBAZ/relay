/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextNavigationMock } from "../mocks/next-navigation";
import type { PatronSearchHit, PatronSearchResult } from "../../web/lib/patron-search-api";
import { RelayApiError } from "../../web/lib/relay-api";
import { PATRON_SEARCH_RECENT_ENABLED_KEY, PATRON_SEARCH_RECENT_STORAGE_KEY } from "../../web/lib/patron-search-recent";

const searchPatronPosts = vi.fn();

vi.mock("@/lib/patron-search-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../web/lib/patron-search-api")>();
  return {
    ...actual,
    searchPatronPosts: (...args: unknown[]) => searchPatronPosts(...args),
  };
});

import { CommandPalette } from "../../web/components/patron/relay/command-palette";

function sampleHit(overrides: Partial<PatronSearchHit> = {}): PatronSearchHit {
  return {
    creator_id: "rc1",
    post_id: "p1",
    creator: {
      id: "rc1",
      handle: "dev_milo",
      display_name: "Dev Milo",
      avatar_url: "/placeholder.svg?height=40&width=40",
    },
    title: "Fox portrait",
    excerpt: "A red fox in morning light.",
    published_at: "2026-04-11T20:18:50.000Z",
    media_type: "photo",
    cover_url_path: "/api/v1/export/media/rc1/m1/content",
    tag_ids: ["fox"],
    tier_label: "Free",
    viewer_entitlement: "visible",
    match_fields: ["title"],
    ...overrides,
  };
}

function sampleResult(overrides: Partial<PatronSearchResult> = {}): PatronSearchResult {
  return {
    query: "fox",
    creator_ids: [],
    media_filter: "all",
    sort: "newest",
    accessible: { items: [sampleHit()], next_cursor: null },
    locked: {
      items: [
        sampleHit({
          post_id: "p2",
          title: "Backstage fox lore",
          viewer_entitlement: "locked",
          cover_url_path: null,
          excerpt: "",
          tier_label: "Studio",
          match_fields: ["tag"],
        }),
      ],
      next_cursor: null,
    },
    ...overrides,
  };
}

function sampleCreators() {
  return [
    {
      id: "rc1",
      handle: "dev_milo",
      displayName: "Dev Milo",
      discipline: "Illustration",
      avatarUrl: "/placeholder.svg?height=40&width=40",
      isFollowed: true,
      followerCount: 0,
      postCount: 0,
      onRelay: true,
    },
    {
      id: "rc2",
      handle: "dev_riley",
      displayName: "Dev Riley",
      discipline: "Writing",
      avatarUrl: "/placeholder.svg?height=40&width=40",
      isFollowed: true,
      followerCount: 0,
      postCount: 0,
      onRelay: true,
    },
  ];
}

describe("<CommandPalette /> patron search modal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    searchPatronPosts.mockReset();
    nextNavigationMock.push.mockReset();
    nextNavigationMock.replace.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <CommandPalette open={false} onClose={() => {}} followedCreators={sampleCreators()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows idle guidance and stored recent searches when open with an empty query", () => {
    window.localStorage.setItem(
      PATRON_SEARCH_RECENT_STORAGE_KEY,
      JSON.stringify(["fox tags", "studio drop"])
    );

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);

    expect(screen.getByText(/Search posts from creators you follow/i)).toBeTruthy();
    expect(screen.getByText("fox tags")).toBeTruthy();
    expect(screen.getByText("studio drop")).toBeTruthy();
    expect(searchPatronPosts).not.toHaveBeenCalled();
  });

  it("shows a minimum-length hint for one-character queries", () => {
    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "f" } });
    expect(screen.getByText(/Enter at least 2 characters/i)).toBeTruthy();
    expect(searchPatronPosts).not.toHaveBeenCalled();
  });

  it("debounces live search and groups accessible and locked results", async () => {
    searchPatronPosts.mockResolvedValue(sampleResult());

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "fox" } });

    await vi.advanceTimersByTimeAsync(320);

    await waitFor(() => {
      expect(searchPatronPosts).toHaveBeenCalledWith({
        q: "fox",
        creator_ids: undefined,
        media_filter: "all",
        sort: "newest",
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /Posts you can read/i })).toBeTruthy();
      expect(screen.getByRole("region", { name: /What you missed/i })).toBeTruthy();
      expect(screen.getByText("Fox portrait")).toBeTruthy();
      expect(screen.getByText("Backstage fox lore")).toBeTruthy();
    });
  });

  it("shows an empty-state message when the API returns no hits", async () => {
    searchPatronPosts.mockResolvedValue({
      query: "nothing",
      creator_ids: [],
      media_filter: "all",
      sort: "newest",
      accessible: { items: [], next_cursor: null },
      locked: { items: [], next_cursor: null },
    });

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "nothing" } });
    await vi.advanceTimersByTimeAsync(320);

    await waitFor(() => {
      expect(screen.getByText(/No posts match/i)).toBeTruthy();
    });
  });

  it("surfaces API errors in the modal", async () => {
    searchPatronPosts.mockRejectedValue(
      new RelayApiError("Sign in required", 401, "AUTH_ERROR")
    );

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "fox" } });
    await vi.advanceTimersByTimeAsync(320);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("navigates to post detail for accessible hits and creator page for locked hits", async () => {
    const onClose = vi.fn();
    searchPatronPosts.mockResolvedValue(sampleResult());

    render(<CommandPalette open onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "fox" } });
    await vi.advanceTimersByTimeAsync(320);

    await waitFor(() => {
      expect(screen.getByText("Fox portrait")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Open Fox portrait by Dev Milo/i }));
    expect(onClose).toHaveBeenCalled();
    expect(nextNavigationMock.push).toHaveBeenCalledWith("/dev_milo/post/p1");

    fireEvent.click(
      screen.getByRole("button", { name: /Unlock at Studio Tier: Backstage fox lore/i })
    );
    expect(nextNavigationMock.push).toHaveBeenCalledWith("/dev_milo");
  });

  it("re-runs search when a recent query is selected and clears recents on demand", async () => {
    window.localStorage.setItem(
      PATRON_SEARCH_RECENT_STORAGE_KEY,
      JSON.stringify(["fox tags"])
    );
    searchPatronPosts.mockResolvedValue(sampleResult({ query: "fox tags" }));

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    fireEvent.click(screen.getByRole("button", { name: "fox tags" }));

    await vi.advanceTimersByTimeAsync(320);

    await waitFor(() => {
      expect(searchPatronPosts).toHaveBeenCalledWith({
        q: "fox tags",
        creator_ids: undefined,
        media_filter: "all",
        sort: "newest",
      });
    });

    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "" } });
    expect(screen.getByText("fox tags")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
    expect(screen.queryByText("fox tags")).toBeNull();
    expect(window.localStorage.getItem(PATRON_SEARCH_RECENT_STORAGE_KEY)).toBeNull();
  });

  it("passes media filter and sort selections to the search API", async () => {
    searchPatronPosts.mockResolvedValue(sampleResult());

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "fox" } });
    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    fireEvent.change(screen.getByLabelText("Sort search results"), { target: { value: "oldest" } });

    await vi.advanceTimersByTimeAsync(320);

    await waitFor(() => {
      expect(searchPatronPosts).toHaveBeenCalledWith({
        q: "fox",
        creator_ids: undefined,
        media_filter: "video",
        sort: "oldest",
      });
    });
  });

  it("browses selected creators without a keyword query", async () => {
    searchPatronPosts.mockResolvedValue(
      sampleResult({ query: "", creator_ids: ["rc1"], accessible: { items: [sampleHit()], next_cursor: null }, locked: { items: [], next_cursor: null } })
    );

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    fireEvent.click(screen.getByRole("button", { name: /Creators:/i }));
    fireEvent.click(screen.getByRole("option", { name: /Dev Milo/i }));

    await waitFor(() => {
      expect(searchPatronPosts).toHaveBeenCalledWith({
        q: "",
        creator_ids: ["rc1"],
        media_filter: "all",
        sort: "newest",
      });
    });
  });

  it("persists successful searches to recent history", async () => {
    searchPatronPosts.mockResolvedValue(sampleResult());

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "fox" } });
    await vi.advanceTimersByTimeAsync(320);

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(PATRON_SEARCH_RECENT_STORAGE_KEY)!)).toEqual([
        "fox",
      ]);
    });
  });

  it("hides recent searches when toggled off without clearing stored history", async () => {
    window.localStorage.setItem(
      PATRON_SEARCH_RECENT_STORAGE_KEY,
      JSON.stringify(["fox tags"])
    );

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    expect(screen.getByText("fox tags")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "Show recent searches" }));

    expect(screen.queryByText("fox tags")).toBeNull();
    expect(screen.getByText("Recent searches are turned off.")).toBeTruthy();
    expect(window.localStorage.getItem(PATRON_SEARCH_RECENT_STORAGE_KEY)).toBe(
      JSON.stringify(["fox tags"])
    );
    expect(window.localStorage.getItem(PATRON_SEARCH_RECENT_ENABLED_KEY)).toBe("0");

    fireEvent.click(screen.getByRole("switch", { name: "Show recent searches" }));

    expect(screen.getByText("fox tags")).toBeTruthy();
    expect(window.localStorage.getItem(PATRON_SEARCH_RECENT_ENABLED_KEY)).toBe("1");
  });

  it("does not record new searches while recent history is turned off", async () => {
    window.localStorage.setItem(PATRON_SEARCH_RECENT_ENABLED_KEY, "0");
    searchPatronPosts.mockResolvedValue(sampleResult());

    render(<CommandPalette open onClose={() => {}} followedCreators={sampleCreators()} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "fox" } });
    await vi.advanceTimersByTimeAsync(320);

    await waitFor(() => {
      expect(searchPatronPosts).toHaveBeenCalled();
    });

    expect(window.localStorage.getItem(PATRON_SEARCH_RECENT_STORAGE_KEY)).toBeNull();
  });
});
