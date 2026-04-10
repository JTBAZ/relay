import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads the patron home bundle JSON (same shape as web `PatronFeedBundle`).
 * Generated from fixtures: `web/lib/patron-relay-feed-bundle.json`
 * (see repo script / `getPatronFeedFixtureBundle()` in `web/lib/relay-fixtures.ts`).
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
