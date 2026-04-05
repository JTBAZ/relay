/**
 * Upload docs/ui-planning-*.csv into Airtable (batch 10 per request).
 * Requires: AIRTABLE_PAT or AIRTABLE_TOKEN (personal access token with data.records:write)
 * Usage:
 *   AIRTABLE_PAT=pat... node scripts/upload-ui-planning-airtable.mjs [baseId]
 * Default base: Project tracker (applW4dOjVNHoWBM9) — change TABLE_IDS if you recreated tables.
 */
import fs from "fs";
import path from "path";

const ROOT = path.join(import.meta.dirname, "..");
const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || "";
const baseId = process.argv[2] || "applW4dOjVNHoWBM9";

const TABLES = {
  inventory: "tbluISu3XCKl3Berv",
  slices: "tbleD4y1ZbiaCDQ2V",
  global: "tblapjC9tNanrUCqG"
};

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let cur = [];
  let field = "";
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      cur.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      cur.push(field);
      if (cur.some((x) => x.length)) rows.push(cur);
      cur = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || cur.length) {
    cur.push(field);
    if (cur.some((x) => x.length)) rows.push(cur);
  }
  return rows;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function batchCreate(tableId, records) {
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;
  const batches = chunk(records, 10);
  for (const b of batches) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ records: b.map((fields) => ({ fields })) })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} ${err}`);
    }
  }
}

async function main() {
  if (!token) {
    console.error("Set AIRTABLE_PAT or AIRTABLE_TOKEN to a Personal Access Token with data.records:write on the base.");
    process.exit(1);
  }

  const invPath = path.join(ROOT, "docs", "ui-planning-inventory.csv");
  const invRows = parseCsv(fs.readFileSync(invPath, "utf8"));
  const invHeader = invRows[0];
  const invObjects = invRows.slice(1).map((r) => {
    const o = {};
    invHeader.forEach((h, j) => {
      o[h] = r[j] ?? "";
    });
    let prio = o.Priority ?? "";
    let notes = o.Notes ?? "";
    if (prio === "P3 (Part 3)") {
      prio = "P3";
      notes = notes ? `[Part 3] ${notes}` : "[Part 3]";
    }
    return {
      "Element / Page": o["Element/Page"] ?? "",
      "User job / need": o["User job / need"] ?? "",
      Priority: prio,
      Dependencies: o.Dependencies ?? "",
      "Data sources": o["Data sources (Airtable/Azure/API)"] ?? "",
      "States / Empty / Error": o["States / Empty / Error"] ?? "",
      Notes: notes
    };
  });
  console.log("Inventory rows:", invObjects.length);
  await batchCreate(TABLES.inventory, invObjects);

  const slPath = path.join(ROOT, "docs", "ui-planning-vertical-slices.csv");
  const slRows = parseCsv(fs.readFileSync(slPath, "utf8"));
  const slH = slRows[0];
  const sliceObjects = slRows.slice(1).map((r) => {
    const o = {};
    slH.forEach((h, j) => {
      o[h] = r[j] ?? "";
    });
    return {
      "Slice Title": o["Slice Title"] ?? "",
      Slug: o.Slug ?? "",
      Includes: o["Includes (element IDs or page names)"] ?? "",
      Complexity: Number(o["Complexity (1–10)"] || o["Complexity (1-10)"] || 0),
      "Why boundary": o["Why it’s a slice boundary"] || o["Why it's a slice boundary"] || ""
    };
  });
  console.log("Slice rows:", sliceObjects.length);
  await batchCreate(TABLES.slices, sliceObjects);

  const glPath = path.join(ROOT, "docs", "ui-planning-global-parameters.csv");
  const glRows = parseCsv(fs.readFileSync(glPath, "utf8"));
  const glH = glRows[0];
  const globalObjects = glRows.slice(1).map((r) => {
    const o = {};
    glH.forEach((h, j) => {
      o[h] = r[j] ?? "";
    });
    return {
      "Parameter Key": o["Parameter Key"] ?? "",
      Value: o.Value ?? "",
      Scope: o.Scope ?? ""
    };
  });
  console.log("Global rows:", globalObjects.length);
  await batchCreate(TABLES.global, globalObjects);

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
