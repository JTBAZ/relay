#!/usr/bin/env node
/**
 * Build store-upload zips (Phase 6.C / EXT-6H): zip **contents** of dist/*-prod/
 * so the archive root contains manifest.json (not a nested folder).
 *
 * Usage:
 *   node scripts/package-store-zips.mjs chrome
 *   node scripts/package-store-zips.mjs firefox
 *   node scripts/package-store-zips.mjs all
 *
 * Preconditions: run `npm run build:chrome:prod` / `build:firefox:prod` first.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const extRoot = resolve(__dirname, "..");

const targets = {
  chrome: {
    distRel: join("dist", "chrome-prod"),
    outName: "chrome.zip"
  },
  firefox: {
    distRel: join("dist", "firefox-prod"),
    outName: "firefox.zip"
  }
};

function packOne(key) {
  const t = targets[key];
  if (!t) {
    console.error(`Unknown target "${key}". Use: chrome | firefox | all`);
    process.exit(1);
  }
  const distDir = join(extRoot, t.distRel);
  const outFile = join(extRoot, t.outName);

  if (!existsSync(distDir)) {
    console.error(`Missing ${t.distRel} — run npm run build:${key === "chrome" ? "chrome:prod" : "firefox:prod"} first.`);
    process.exit(1);
  }

  if (process.platform === "win32") {
    const distEsc = distDir.replace(/'/g, "''");
    const outEsc = outFile.replace(/'/g, "''");
    const ps = [
      "$ErrorActionPreference = 'Stop'",
      `Set-Location -LiteralPath '${distEsc}'`,
      `if (Test-Path -LiteralPath '${outEsc}') { Remove-Item -LiteralPath '${outEsc}' -Force }`,
      `Compress-Archive -Path * -DestinationPath '${outEsc}' -Force`
    ].join("; ");
    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
      stdio: "inherit",
      cwd: extRoot
    });
    const code = r.status ?? 1;
    if (code !== 0) process.exit(code);
  } else {
    const r = spawnSync("zip", ["-r", outFile, "."], {
      cwd: distDir,
      stdio: "inherit"
    });
    const code = r.status ?? 1;
    if (code !== 0) {
      console.error("zip failed. Install zip(1) or pack on Windows with PowerShell.");
      process.exit(code);
    }
  }

  console.log(`Wrote ${outFile}`);
}

const arg = (process.argv[2] ?? "").toLowerCase();
if (!arg || arg === "-h" || arg === "--help") {
  console.log(`Usage: node scripts/package-store-zips.mjs <chrome|firefox|all>`);
  process.exit(arg ? 0 : 1);
}

if (arg === "all") {
  packOne("chrome");
  packOne("firefox");
} else {
  packOne(arg);
}
