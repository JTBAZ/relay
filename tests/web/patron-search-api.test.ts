/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";
import {
  absolutizePatronSearchResult,
  isPatronSearchQueryReady,
  isPatronSearchRequestReady,
  patronSearchUserMessage,
  searchPatronPosts
} from "../../web/lib/patron-search-api";
import { RelayApiError } from "../../web/lib/relay-api";
import { RELAY_API_BASE } from "../../web/lib/relay-api";
import type { PatronSearchHit, PatronSearchResult } from "../../web/lib/patron-search-api";

function sampleHit(overrides: Partial<PatronSearchHit> = {}): PatronSearchHit {
  return {
    creator_id: "rc1",
    post_id: "p1",
    creator: {
      id: "rc1",
      handle: "dev_milo",
      display_name: "Dev Milo",
      avatar_url: "/placeholder.svg?height=40&width=40"
    },
    title: "Fox portrait",
    excerpt: "Fox portrait",
    published_at: "2026-04-11T20:18:50.000Z",
    media_type: "photo",
    cover_url_path: "/api/v1/export/media/rc1/m1/content",
    tag_ids: ["fox"],
    tier_label: "Free",
    viewer_entitlement: "visible",
    match_fields: ["title"],
    ...overrides
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
          viewer_entitlement: "locked",
          cover_url_path: null,
          title: "Backstage fox lore"
        })
      ],
      next_cursor: null
    },
    ...overrides
  };
}

describe("isPatronSearchQueryReady", () => {
  it("requires at least two trimmed characters", () => {
    expect(isPatronSearchQueryReady("a")).toBe(false);
    expect(isPatronSearchQueryReady("  fox ")).toBe(true);
  });
});

describe("patronSearchUserMessage", () => {
  it("maps validation and auth errors to modal copy", () => {
    expect(
      patronSearchUserMessage(new RelayApiError("bad", 400, "QUERY_TOO_SHORT"))
    ).toContain("2 characters");
    expect(patronSearchUserMessage(new RelayApiError("bad", 401, "AUTH_ERROR"))).toContain(
      "Sign in"
    );
    expect(patronSearchUserMessage(new RelayApiError("bad", 503, "NOT_AVAILABLE"))).toContain(
      "unavailable"
    );
  });
});

describe("absolutizePatronSearchResult", () => {
  it("rewrites accessible cover paths and leaves locked cover null", () => {
    const out = absolutizePatronSearchResult(sampleResult());
    expect(out.accessible.items[0]!.cover_url_path).toBe(
      `${RELAY_API_BASE}/api/v1/export/media/rc1/m1/content`
    );
    expect(out.locked.items[0]!.cover_url_path).toBeNull();
  });

  it("leaves placeholder avatar URLs untouched", () => {
    const out = absolutizePatronSearchResult(sampleResult());
    expect(out.accessible.items[0]!.creator.avatar_url).toBe(
      "/placeholder.svg?height=40&width=40"
    );
  });
});

describe("isPatronSearchRequestReady", () => {
  it("allows creator browse without keywords", () => {
    expect(isPatronSearchRequestReady({ q: "", creator_ids: ["rc1"] })).toBe(true);
    expect(isPatronSearchRequestReady({ q: "", creator_ids: [] })).toBe(false);
    expect(isPatronSearchRequestReady({ q: "fox", creator_ids: ["rc1"] })).toBe(true);
  });
});

describe("searchPatronPosts", () => {
  it("rejects requests with no query and no creator scope before calling the API", async () => {
    await expect(searchPatronPosts({ q: "a" })).rejects.toMatchObject({
      code: "QUERY_TOO_SHORT",
      status: 400,
    });
    await expect(searchPatronPosts({ q: "", creator_ids: [] })).rejects.toMatchObject({
      code: "QUERY_TOO_SHORT",
      status: 400,
    });
  });
});
