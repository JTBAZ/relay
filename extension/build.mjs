#!/usr/bin/env node
/**
 * Sets EXT_TARGET / EXT_ENV then runs `vite build`.
 * Usage: node build.mjs <chrome|firefox> <dev|prod>
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const target = process.argv[2];
const env = process.argv[3];

if (
  (target !== "chrome" && target !== "firefox") ||
  (env !== "dev" && env !== "prod")
) {
  console.error("Usage: node build.mjs <chrome|firefox> <dev|prod>");
  process.exit(1);
}

if (target === "firefox" && env !== "prod") {
  console.error("Firefox builds use prod manifest only (EXT_ENV=prod).");
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

const outDir = target === "firefox" ? "dist/firefox-prod" : `dist/chrome-${env}`;
const contentEnv = {
  ...envVars,
  EXT_OUT_DIR: outDir
};

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
      env: { ...contentEnv, EXT_CONTENT_ENTRY: contentEntry },
      stdio: "inherit"
    }
  );

  if (contentR.status !== 0) {
    process.exit(contentR.status === null ? 1 : contentR.status);
  }
}

process.exit(0);
