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

process.exit(r.status === null ? 1 : r.status);
