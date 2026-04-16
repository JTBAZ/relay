#!/usr/bin/env node
/**
 * M10.1.5 — Fail if `console.*` calls in `src/` appear to log token-bearing values.
 * Conservative patterns only; extend if new leak shapes appear.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

/** Max chars between `console.*(` and the suspicious token — avoids matching across unrelated code in huge files. */
const MAX_CONSOLE_ARG_WINDOW = 4096;

const PATTERNS = [
  {
    name: "console + refresh_token",
    re: new RegExp(
      `console\\.(log|info|debug|warn|error)\\s*\\([\\s\\S]{0,${MAX_CONSOLE_ARG_WINDOW}}?\\brefresh_token\\b`
    )
  },
  {
    name: "console + .access_token (value)",
    re: new RegExp(
      `console\\.(log|info|debug|warn|error)\\s*\\([\\s\\S]{0,${MAX_CONSOLE_ARG_WINDOW}}?\\.access_token\\b`
    )
  },
  {
    name: "console + Bearer template",
    re: new RegExp(
      `console\\.(log|info|debug|warn|error)\\s*\\([\\s\\S]{0,${MAX_CONSOLE_ARG_WINDOW}}?\`[^\`]*Bearer\\s*\\\${`
    )
  }
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") {
      continue;
    }
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

let failed = false;
for (const file of walk(SRC)) {
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

console.log("[m10-token-log-scan] OK — no suspicious console + token patterns in src/.");
