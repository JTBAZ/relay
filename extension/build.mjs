#!/usr/bin/env node
/**
 * Sets EXT_TARGET / EXT_ENV then runs `vite build`.
 * Usage: node build.mjs <chrome|firefox> <dev|prod|staging>
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extensionBuildProfile } from "./build-profile.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const target = process.argv[2];
const env = process.argv[3];

try {
  extensionBuildProfile(target, env);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const envVars = {
  ...process.env,
  EXT_TARGET: target,
  EXT_ENV: env
};

const viteBin = join(__dirname, "node_modules", "vite", "bin", "vite.js");
const r = spawnSync(process.execPath, [viteBin, "build"], {
  cwd: __dirname,
  env: envVars,
  stdio: "inherit"
});

if (r.status !== 0) {
  process.exit(r.status === null ? 1 : r.status);
}


const contentEntries = [
  "fill-patreon-editor",
  "fill-x-compose",
  "fill-deviantart-submit",
  "post-link-toast",
  "post-link-x-observer",
  "schedule-reminder-toast",
  "scrape-patreon-metrics"
];

for (const contentEntry of contentEntries) {
  const contentR = spawnSync(
    process.execPath,
    [viteBin, "build", "--config", "vite.content.config.ts"],
    {
      cwd: __dirname,
      env: { ...envVars, EXT_CONTENT_ENTRY: contentEntry },
      stdio: "inherit"
    }
  );

  if (contentR.status !== 0) {
    process.exit(contentR.status === null ? 1 : contentR.status);
  }
}

process.exit(0);
