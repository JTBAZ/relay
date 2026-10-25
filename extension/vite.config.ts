import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import { extensionDevApiPort } from "./dev-api-port.mjs";
import { extensionBuildProfile, manifestForProfile } from "./build-profile.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const profile = extensionBuildProfile(process.env.EXT_TARGET ?? "chrome", process.env.EXT_ENV ?? "dev");

function loadManifest(): Record<string, unknown> {
  const raw = readFileSync(resolve(__dirname, "manifests", profile.manifestFile), "utf8");
  return manifestForProfile(JSON.parse(raw), profile);
}

export default defineConfig({
  // Firefox prod uses `background.scripts` (MV3) — not in Chrome's ManifestV3 typedef.
  plugins: [crx({ manifest: loadManifest() as unknown as chrome.runtime.ManifestV3 })],
  define: {
    __EXT_ENV__: JSON.stringify(profile.env),
    __EXT_DEV_API_PORT__: String(profile.env === "dev" ? extensionDevApiPort() : 8787)
  },
  build: {
    outDir: profile.outDir,
    emptyOutDir: true
  }
});
