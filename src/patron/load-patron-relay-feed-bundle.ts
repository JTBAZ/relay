/**
 * @fileoverview Patron experience module load-patron-relay-feed-bundle.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads the patron home bundle JSON (same shape as web `PatronFeedBundle`).
 * Generated from fixtures: `web/lib/patron-relay-feed-bundle.json`
 * (see repo script / `getPatronFeedFixtureBundle()` in `web/lib/relay-fixtures.ts`).
 *
 * **When used:** `GET /api/v1/patron/feed` (and `relay_feed`) call this only when the API is
 * **not** using database-backed identity (`RELAY_DB_STORE_IDENTITY` off or no Prisma). There is
 * no separate `RELAY_PATRON_FEED_FIXTURE` env flag — non-DB mode implies fixture JSON.
 */
export function loadPatronRelayFeedBundleFromRepo(cwd = process.cwd()): unknown {
  const p = join(cwd, "web", "lib", "patron-relay-feed-bundle.json");
  if (!existsSync(p)) {
    throw new Error(
      `Missing ${p}. Generate with: npx tsx -e "import { getPatronFeedFixtureBundle } from './web/lib/relay-fixtures.ts'; import { writeFileSync } from 'fs'; writeFileSync('web/lib/patron-relay-feed-bundle.json', JSON.stringify(getPatronFeedFixtureBundle()));"`
    );
  }
  return JSON.parse(readFileSync(p, "utf8")) as unknown;
}
