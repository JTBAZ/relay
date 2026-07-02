#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const dirs = [
  path.join(process.cwd(), "web"),
  path.join(process.cwd(), "tests", "web")
];
const exts = new Set([".ts", ".tsx", ".md", ".mjs"]);

const fixes = [
  ["/api/v1/auth/connect/connect/patreon/", "/api/v1/auth/patreon/"],
  ["/api/v1/auth/connect/patreon/", "/api/v1/auth/patreon/"],
  ["/connect/connect/patreon/", "/connect/patreon/"],
  ["/studio/studio/", "/studio/"],
  ["/auth/connect/patreon/", "/auth/patreon/"]
];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "b_i0ofEW9bMcy", "onboarding_enhancement"].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (exts.has(path.extname(ent.name))) {
      let t = fs.readFileSync(p, "utf8");
      let o = t;
      for (const [from, to] of fixes) t = t.split(from).join(to);
      if (t !== o) fs.writeFileSync(p, t);
    }
  }
}

for (const d of dirs) walk(d);
console.log("Fix double-replacement paths applied.");
