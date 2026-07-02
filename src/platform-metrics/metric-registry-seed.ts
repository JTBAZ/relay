import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlatformMetricSeedEntry } from "./metric-registry-types.js";

const seedPath = join(dirname(fileURLToPath(import.meta.url)), "registry-seed.json");

let cachedSeed: PlatformMetricSeedEntry[] | null = null;

export function getMetricRegistrySeed(): PlatformMetricSeedEntry[] {
  if (!cachedSeed) {
    cachedSeed = JSON.parse(readFileSync(seedPath, "utf8")) as PlatformMetricSeedEntry[];
  }
  return cachedSeed;
}
