/**
 * Split non–Phase-P0 pilot items into JSON batches for Airtable MCP import.
 * Run from repo root: node scripts/split-pilot-airtable-batches.mjs
 * Outputs .airtable-pilot-batches/batch-NN.json (arrays of `fields` objects).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const items = JSON.parse(
  fs.readFileSync(path.join(root, ".tmp-pilot-items.json"), "utf8"),
).filter((i) => !i.id.startsWith("P0-"));

function toFields(it) {
  return {
    Name: `${it.id} — ${it.title}`,
    "Work Item ID": it.id,
    Phase: it.phase,
    "Depends On": it.dep,
    "Owner Skill": it.owner,
    "Exit Criteria": it.exit,
    Notes: `Canonical: docs/pilot-build-plan.md · Phase ${it.phase}\n\n${it.notes || "(See doc for Code / Wiring / Retrofit / Tests.)"}`,
    Status: "Todo",
  };
}

const BATCH = 10;
const dir = path.join(root, ".airtable-pilot-batches");
fs.mkdirSync(dir, { recursive: true });
const fieldsList = items.map(toFields);
for (let i = 0, b = 0; i < fieldsList.length; i += BATCH, b++) {
  const slice = fieldsList.slice(i, i + BATCH);
  fs.writeFileSync(
    path.join(dir, `batch-${String(b).padStart(2, "0")}.json`),
    JSON.stringify(slice, null, 2),
    "utf8",
  );
}
process.stderr.write(
  `Wrote ${Math.ceil(fieldsList.length / BATCH)} batch files (${fieldsList.length} records) to ${dir}\n`,
);
