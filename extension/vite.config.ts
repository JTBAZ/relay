import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

function manifestPath(): string {
  const target = process.env.EXT_TARGET ?? "chrome";
  const env = process.env.EXT_ENV ?? "dev";
  if (target === "firefox") {
    return resolve(__dirname, "manifests/manifest.firefox.prod.json");
  }
  if (env === "prod") {
    return resolve(__dirname, "manifests/manifest.chrome.prod.json");
  }
  return resolve(__dirname, "manifests/manifest.chrome.dev.json");
}

function loadManifest(): Record<string, unknown> {
  const raw = readFileSync(manifestPath(), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

const target = process.env.EXT_TARGET ?? "chrome";
const env = process.env.EXT_ENV ?? "dev";
const outDir =
  target === "firefox" ? "dist/firefox-prod" : `dist/chrome-${env}`;

export default defineConfig({
  // Firefox prod uses `background.scripts` (MV3) — not in Chrome's ManifestV3 typedef.
  plugins: [crx({ manifest: loadManifest() as unknown as chrome.runtime.ManifestV3 })],
  build: {
    outDir,
    emptyOutDir: true
  }
});
