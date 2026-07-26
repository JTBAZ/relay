/**
 * Patreon scrape body presets for Library PatreonSyncMenu (PILOT-007).
 * Tier access refresh uses POST /api/v1/connect/patreon/sync-post-access (OAuth diff), not scrape presets.
 */

export const PATREON_SCRAPE_LIVE_MAX_PAGES = 20;
export const PATREON_SCRAPE_FULL_MAX_PAGES = 100;
/** OAuth metadata pages walked when diffing Patreon tier gates against Relay (cap 100). */
export const PATREON_SYNC_POST_ACCESS_MAX_PAGES = 100;

export type PatreonScrapePresetKind = "live" | "full_rescrape";

export type PatreonScrapePresetBody = {
  force_refresh_post_access: boolean;
  max_post_pages: number;
};

export function patreonScrapePreset(kind: PatreonScrapePresetKind): PatreonScrapePresetBody {
  switch (kind) {
    case "live":
      return {
        force_refresh_post_access: false,
        max_post_pages: PATREON_SCRAPE_LIVE_MAX_PAGES
      };
    case "full_rescrape":
      return {
        force_refresh_post_access: true,
        max_post_pages: PATREON_SCRAPE_FULL_MAX_PAGES
      };
  }
}
