import { describe, expect, it } from "vitest";
import {
  PATREON_SCRAPE_FULL_MAX_PAGES,
  PATREON_SCRAPE_LIVE_MAX_PAGES,
  PATREON_SYNC_POST_ACCESS_MAX_PAGES,
  patreonScrapePreset
} from "@/lib/patreon-scrape-presets";

describe("patreonScrapePreset (PILOT-007)", () => {
  it("live scrape respects watermark with a modest page cap", () => {
    expect(patreonScrapePreset("live")).toEqual({
      force_refresh_post_access: false,
      max_post_pages: PATREON_SCRAPE_LIVE_MAX_PAGES
    });
    expect(PATREON_SCRAPE_LIVE_MAX_PAGES).toBe(20);
  });

  it("full re-scrape bypasses watermark with the API page cap", () => {
    expect(patreonScrapePreset("full_rescrape")).toEqual({
      force_refresh_post_access: true,
      max_post_pages: PATREON_SCRAPE_FULL_MAX_PAGES
    });
    expect(PATREON_SCRAPE_FULL_MAX_PAGES).toBe(100);
  });

  it("post-access OAuth diff uses the catalog page cap constant", () => {
    expect(PATREON_SYNC_POST_ACCESS_MAX_PAGES).toBe(100);
  });
});
