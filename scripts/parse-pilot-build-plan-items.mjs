/**
 * One-off: extract work items from docs/pilot-build-plan.md for Airtable import.
 * Usage: node scripts/parse-pilot-build-plan-items.mjs > .tmp-pilot-items.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const text = fs.readFileSync(
  path.join(root, "docs/pilot-build-plan.md"),
  "utf8",
);

// Em dash (U+2014) between id and title
const headerRe = /^### ((?:P5a|P\d+)(?:-[\w]+)+) \u2014 (.+)$/gm;

const items = [];
let m;
while ((m = headerRe.exec(text)) !== null) {
  const id = m[1];
  const title = m[2].trim();
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const nextMatch = /^### (?:P5a|P\d+)/m.exec(rest.slice(1));
  const end = nextMatch ? start + 1 + nextMatch.index : text.length;
  const body = text.slice(start, end);

  const dep = (body.match(/\*\*Depends on:\*\*\s*(.+)/) || [])[1]?.trim() ?? "";
  const owner = (body.match(/\*\*Owner:\*\*\s*(.+)/) || [])[1]?.trim() ?? "";
  const exit = (body.match(/\*\*Exit:\*\*\s*(.+)/) || [])[1]?.trim() ?? "";

  const notes = [];
  for (const line of body.split(/\r?\n/)) {
    if (/^\*\*(Code|Wiring|Retrofit|Tests):\*\*/.test(line)) {
      notes.push(line.trim());
    }
  }

  const phase = id.startsWith("P5a") ? "P5a" : `P${id.match(/^P(\d+)/)[1]}`;
  items.push({ id, title, dep, owner, exit, notes: notes.join("\n"), phase });
}

const outPath = process.argv[2];
const json = JSON.stringify(items, null, 2);
if (outPath) {
  fs.writeFileSync(path.join(root, outPath), json, "utf8");
  process.stderr.write(`Wrote ${items.length} items to ${outPath}\n`);
} else {
  process.stdout.write(json);
}
