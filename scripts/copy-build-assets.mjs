#!/usr/bin/env node
/**
 * Copy non-TypeScript runtime assets into dist after tsc.
 */
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const assets = ["src/platform-metrics/registry-seed.json"];

for (const rel of assets) {
  const src = join(root, rel);
  const dest = join(root, "dist", rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}
