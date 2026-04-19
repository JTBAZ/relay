#!/usr/bin/env node
/**
 * P-12 / EXT-2B: fail if any file under dist/chrome-prod contains "localhost".
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "dist", "chrome-prod");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p);
    } else {
      const text = await readFile(p, "utf8");
      if (text.includes("localhost")) {
        console.error(`P-12 violation: "localhost" found in ${p}`);
        process.exit(1);
      }
    }
  }
}

try {
  await walk(root);
} catch (e) {
  console.error("Run npm run build:chrome:prod first.", e);
  process.exit(1);
}

console.log("OK: chrome-prod output has no localhost (P-12).");
