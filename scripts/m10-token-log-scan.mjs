#!/usr/bin/env node
/**
 * M10.1.5 — Fail if `console.*` calls appear to log token-bearing values.
 * Conservative patterns only; extend if new leak shapes appear.
 *
 * [R-SEC-25 — security-review 2026-06] Coverage extended from `src/` to the Next.js app
 * (`web/app`, `web/lib`, `web/components`) so client-side token logging is caught in CI.
 * Test files are skipped to avoid false positives. See docs/security-review-2026-06.md.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SCAN_DIRS = [
  join(ROOT, "src"),
  join(ROOT, "web", "app"),
  join(ROOT, "web", "lib"),
  join(ROOT, "web", "components")
].filter((dir) => existsSync(dir));

/**
 * Max chars between `console.*(` and the suspicious token — avoids matching across unrelated code in huge files.
 * The window excludes `;` so a match cannot span past the end of the console statement into unrelated code
 * (prevents false positives like an innocuous `console.error(...)` followed later by `obj.access_token`).
 */
const MAX_CONSOLE_ARG_WINDOW = 4096;

const PATTERNS = [
  {
    name: "console + refresh_token",
    re: new RegExp(
      `console\\.(log|info|debug|warn|error)\\s*\\([^;]{0,${MAX_CONSOLE_ARG_WINDOW}}?\\brefresh_token\\b`
    )
  },
  {
    name: "console + .access_token (value)",
    re: new RegExp(
      `console\\.(log|info|debug|warn|error)\\s*\\([^;]{0,${MAX_CONSOLE_ARG_WINDOW}}?\\.access_token\\b`
    )
  },
  {
    name: "console + Bearer template",
    re: new RegExp(
      `console\\.(log|info|debug|warn|error)\\s*\\([^;]{0,${MAX_CONSOLE_ARG_WINDOW}}?\`[^\`]*Bearer\\s*\\\${`
    )
  }
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "__tests__") {
      continue;
    }
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, out);
    } else if (
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !name.endsWith(".d.ts") &&
      !name.includes(".test.")
    ) {
      out.push(p);
    }
  }
  return out;
}

const allFiles = SCAN_DIRS.flatMap((dir) => walk(dir));

let failed = false;
for (const file of allFiles) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      failed = true;
      console.error(`[m10-token-log-scan] ${name}: ${rel}`);
    }
  }
}

if (failed) {
  console.error(
    "[m10-token-log-scan] Fix logging paths or adjust patterns in scripts/m10-token-log-scan.mjs (with review)."
  );
  process.exit(1);
}

console.log(
  `[m10-token-log-scan] OK — no suspicious console + token patterns in ${SCAN_DIRS.length} scanned root(s) (src/ + web/).`
);
