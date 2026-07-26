#!/usr/bin/env node
/**
 * P8-sec-005 — Emit a CSV of JSDoc @security-audit-required markers under src/ for Airtable import.
 *
 * Usage:
 *   node scripts/security-audit-required-csv.mjs
 *   node scripts/security-audit-required-csv.mjs --out=docs/security-audit-required-backlog.csv
 *
 * Equivalent ripgrep (line locations only):
 *   rg "@security-audit-required" src
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const TAG = "@security-audit-required";

/** @param {string} line */
function parseSymbolFromCodeLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("//")) return null;
  const patterns = [
    /^\s*export\s+default\s+function\s+(\w+)/,
    /^\s*export\s+async\s+function\s+(\w+)/,
    /^\s*export\s+function\s+(\w+)/,
    /^\s*async\s+function\s+(\w+)/,
    /^\s*function\s+(\w+)/,
    /^\s*export\s+class\s+(\w+)/,
    /^\s*class\s+(\w+)/,
    /^\s*export\s+const\s+(\w+)\s*=/,
    /^\s*export\s+type\s+(\w+)/,
    /^\s*export\s+interface\s+(\w+)/,
    /^\s*interface\s+(\w+)/,
    /^\s*type\s+(\w+)\s*=/
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return m[1] ?? null;
  }
  return null;
}

/**
 * After the tag, walk forward to the end of the block comment, then find first declarator.
 * @param {string[]} lines
 * @param {number} tagIdx
 */
function symbolAfterTag(lines, tagIdx) {
  let i = tagIdx;
  while (i < lines.length && !lines[i].includes("*/")) {
    i += 1;
  }
  if (i >= lines.length) {
    return "";
  }
  i += 1;
  const limit = Math.min(lines.length, tagIdx + 40);
  for (; i < limit; i += 1) {
    const sym = parseSymbolFromCodeLine(lines[i] ?? "");
    if (sym) {
      return sym;
    }
  }
  return "";
}

/**
 * Walk upward for a nearby export/function (file-top or nested helpers).
 * @param {string[]} lines
 * @param {number} tagIdx
 */
function symbolBeforeTag(lines, tagIdx) {
  for (let i = tagIdx - 1; i >= 0 && i >= tagIdx - 80; i -= 1) {
    const sym = parseSymbolFromCodeLine(lines[i] ?? "");
    if (sym) {
      return sym;
    }
  }
  return "";
}

/**
 * @param {string[]} lines
 * @param {number} tagIdx
 */
function extractNote(lines, tagIdx) {
  const raw = (lines[tagIdx] ?? "").replace(/\*\//g, "").trim();
  const idx = raw.indexOf(TAG);
  if (idx === -1) {
    return "";
  }
  return raw.slice(idx + TAG.length).replace(/^\s*[-–—]\s*/, "").trim();
}

/** RFC 4180-ish */
function csvCell(s) {
  const x = String(s).replace(/"/g, '""');
  return `"${x}"`;
}

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

function main() {
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const outPath = outArg ? outArg.slice("--out=".length).trim() : null;

  /** @type {{ file: string; line: number; symbol: string; note: string }[]} */
  const rows = [];

  for (const abs of walk(SRC)) {
    const text = readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);
    for (let li = 0; li < lines.length; li += 1) {
      if (!lines[li].includes(TAG)) {
        continue;
      }
      const rel = relative(ROOT, abs).replace(/\\/g, "/");
      let symbol = symbolAfterTag(lines, li);
      if (!symbol) {
        symbol = symbolBeforeTag(lines, li);
      }
      if (!symbol) {
        symbol = "(unspecified)";
      }
      rows.push({
        file: rel,
        line: li + 1,
        symbol,
        note: extractNote(lines, li)
      });
    }
  }

  rows.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));

  const header = ["file", "line", "symbol", "note"].map(csvCell).join(",");
  const body = rows.map((r) => [r.file, r.line, r.symbol, r.note].map(csvCell).join(",")).join("\n");
  const csv = `${header}\n${body}\n`;

  if (outPath) {
    mkdirSync(dirname(join(ROOT, outPath)), { recursive: true });
    writeFileSync(join(ROOT, outPath), csv, "utf8");
    console.error(`[security-audit-required-csv] wrote ${rows.length} row(s) → ${outPath}`);
  } else {
    process.stdout.write(csv);
  }
}

main();
