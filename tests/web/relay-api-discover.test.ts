/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listDiscoverFeed,
  setPostDiscoveryEligibility,
  type DiscoverItem
} from "../../web/lib/relay-api";

const performRelayLogout = vi.fn().mockResolvedValue(undefined);
vi.mock("../../web/lib/relay-session-logout.ts", () => ({
  performRelayLogout: (...args: unknown[]) => performRelayLogout(...args)
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function envelope<T>(data: T) {
  return { data, meta: { trace_id: "trace-test" } };
}

const SAMPLE_ITEM: DiscoverItem = {
  creator_id: "c1",
  post_id: "p1",
  title: "Sunset",
  description: "warm tones",
  published_at: "2026-04-22T00:00:00.000Z",
  tag_ids: ["landscape"],
  cover_media_id: "m1"
};

describe("PE-F discover API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listDiscoverFeed", () => {
    it("issues GET /patron/discover with no query string when no params provided", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [], next_cursor: null }))
      );
      const out = await listDiscoverFeed();
      expect(out.items).toEqual([]);
      expect(out.next_cursor).toBeNull();
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toMatch(/\/api\/v1\/patron\/discover$/);
    });

    it("URL-encodes the q parameter and sets it on the query string", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [SAMPLE_ITEM], next_cursor: null }))
      );
      await listDiscoverFeed({ q: "sun set" });
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toContain("q=sun+set");
    });

    it("forwards cursor + limit + creator_cap to the wire format", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [], next_cursor: null }))
      );
      await listDiscoverFeed({ cursor: "abc", limit: 12, creatorCap: 5 });
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toContain("cursor=abc");
      expect(url).toContain("limit=12");
      expect(url).toContain("creator_cap=5");
    });

    it("returns the full DiscoverItem shape from the envelope", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [SAMPLE_ITEM], next_cursor: "next-cursor" }))
      );
      const out = await listDiscoverFeed({ q: "sunset" });
      expect(out.items).toHaveLength(1);
      expect(out.items[0]).toEqual(SAMPLE_ITEM);
      expect(out.next_cursor).toBe("next-cursor");
    });
  });

  describe("setPostDiscoveryEligibility", () => {
    it("issues PATCH on the encoded post id with snake_case body", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          envelope({ creator_id: "c1", post_id: "p 1", eligible: true, warning: null })
        )
      );
      const out = await setPostDiscoveryEligibility({
        postId: "p 1",
        creatorId: "c1",
        eligible: true
      });
      expect(out).toEqual({
        creator_id: "c1",
        post_id: "p 1",
        eligible: true,
        warning: null
      });
      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
      expect(url).toContain("/api/v1/gallery/posts/p%201/discovery");
      expect((init as RequestInit).method).toBe("PATCH");
      const sent = JSON.parse((init as RequestInit).body as string);
      expect(sent).toEqual({ creator_id: "c1", eligible: true });
    });

    it("returns the server warning when toggling on a tier-gated post", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          envelope({
            creator_id: "c1",
            post_id: "p1",
            eligible: true,
            warning: "Tier-gated posts are not surfaced in Discover v1; opt-in is recorded but has no effect until tier-gated discovery ships."
          })
        )
      );
      const out = await setPostDiscoveryEligibility({
        postId: "p1",
        creatorId: "c1",
        eligible: true
      });
      expect(out.warning).toContain("Tier-gated");
    });
  });
});
