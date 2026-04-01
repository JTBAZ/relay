import { describe, expect, it, vi } from "vitest";
import {
  buildPostDetailUrl,
  scrapeByCookie
} from "../src/patreon/cookie-scraper.js";

describe("cookie scrape enriches post body from detail when list returns content null", () => {
  it("GET /api/posts/:id merges HTML into ingest description", async () => {
    const listDoc = {
      data: [
        {
          type: "post",
          id: "154428469",
          attributes: {
            title: "Test post 7",
            content: null,
            published_at: "2026-03-31T17:02:44.000+00:00",
            edited_at: "2026-03-31T17:02:44.000+00:00",
            is_public: false,
            is_paid: true
          },
          relationships: {}
        }
      ],
      included: [],
      links: {}
    };

    const detailDoc = {
      data: {
        type: "post",
        id: "154428469",
        attributes: {
          title: "Test post 7 ",
          content: "<p>Can you read this?</p>",
          published_at: "2026-03-31T17:02:44.000+00:00",
          edited_at: "2026-03-31T17:02:44.000+00:00"
        },
        relationships: {}
      },
      included: []
    };

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/posts/154428469?")) {
        return new Response(JSON.stringify(detailDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/posts?")) {
        return new Response(JSON.stringify(listDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    }) as unknown as typeof fetch;

    const result = await scrapeByCookie({
      sessionId: "sess",
      campaignId: "15782831",
      maxPages: 1,
      fetchImpl
    });

    expect(vi.mocked(fetchImpl).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]!.description).toContain("Can you read this?");
  });

  it("buildPostDetailUrl omits fields[post] sparse set", () => {
    const u = buildPostDetailUrl("154428469");
    expect(u).toContain("/api/posts/154428469");
    expect(u).not.toContain("fields%5Bpost%5D=");
  });
});
