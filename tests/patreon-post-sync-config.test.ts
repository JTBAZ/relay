import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { fetchCookiePostsPage } from "../src/patreon/cookie-scraper.js";

describe("PS-11 storage and source prerequisites", () => {
  it("rejects shared progress with file canonical or creator OAuth storage before wiring any network work", () => {
    const config = { prisma: {} as never, relay_token_encryption_key: randomBytes(32).toString("base64"), relay_db_store_watermark: true, relay_db_store_canonical: false, relay_db_store_creator_oauth: false };
    expect(() => createApp(config)).toThrow("Shared Patreon post progress requires");
    expect(() => createApp({ ...config, relay_db_store_canonical: true })).toThrow("RELAY_DB_STORE_CREATOR_OAUTH=1");
  });
  it("returns a validated cookie continuation and rejects OAuth/foreign/cross-campaign cursors before sending the cookie", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ data: [], links: { next: "https://www.patreon.com/api/posts?page%5Bcursor%5D=tail" } }));
    const page = await fetchCookiePostsPage({ sessionId: "fixture", campaignId: "9000", fetchImpl });
    expect(page.terminal).toBe(false); expect(new URL(page.next!).searchParams.get("filter[campaign_id]")).toBe("9000");
    for (const next of ["https://www.patreon.com/api/oauth2/v2/campaigns/9000/posts", "https://foreign.fixture/api/posts", "https://www.patreon.com/api/posts?filter%5Bcampaign_id%5D=other"]) {
      await expect(fetchCookiePostsPage({ sessionId: "fixture", campaignId: "9000", next, fetchImpl })).rejects.toThrow("Invalid Patreon cookie page continuation");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const terminal = await fetchCookiePostsPage({ sessionId: "fixture", campaignId: "9000", next: page.next, fetchImpl: async () => Response.json({ data: [] }) });
    expect(terminal.terminal).toBe(true); expect(terminal.next).toBeNull();
  });
});
