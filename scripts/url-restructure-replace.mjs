#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "web");
const testRoot = path.join(process.cwd(), "tests", "web");
const exts = new Set([".ts", ".tsx", ".md", ".mjs"]);

const replacements = [
  ["/patron/notifications/preferences", "/notifications/preferences"],
  ["/patron/notifications", "/notifications"],
  ["/patron/former-subscriptions", "/former-subscriptions"],
  ["/patron/commission-hub", "/commission-hub"],
  ["/patron/discover", "/discover"],
  ["/patron/library", "/library"],
  ["/patron/settings", "/settings"],
  ["/patron/profile", "/profile"],
  ["/patron/feed/post/", "/feed/post/"],
  ["/patron/feed", "/feed"],
  ["/patron/c/", "/"],
  ["/patron/onboarding", "/onboarding/patron"],
  ["/patron/collections/", "/collections/"],
  ["/designer/profile", "/studio/designer/profile"],
  ["/designer", "/studio/designer"],
  ["/action-center", "/studio/actions"],
  ["/manual-import", "/studio/import"],
  ["/new-post", "/studio/new-post"],
  ["/analytics", "/studio/analytics"],
  ["/visitor/favorites", "/studio/preview/favorites"],
  ["/visitor", "/studio/preview"],
  ["/subscribestar/creator/", "/connect/subscribestar/creator/"],
  ["/patreon/patron/", "/connect/patreon/patron/"],
  ["/patreon/", "/connect/patreon/"],
  ["/creator/connect", "/connect/creator"],
  ['"/p/', '"/u/'],
  ["'/p/", "'/u/"],
  ["canonical = `/p/", "canonical = `/u/"],
  ["/patron/c/{", "/{"]
];

function transform(text) {
  let t = text;
  t = t.replace(/from "\.\.\/components\//g, 'from "@/app/components/');
  t = t.replace(/from "\.\.\/\.\.\/components\//g, 'from "@/app/components/');
  t = t.replace(/from "\.\/components\//g, 'from "@/app/components/');
  for (const [from, to] of replacements) {
    t = t.split(from).join(to);
  }
  return t;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "b_i0ofEW9bMcy", "onboarding_enhancement"].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (exts.has(path.extname(ent.name))) {
      const original = fs.readFileSync(p, "utf8");
      const next = transform(original);
      if (next !== original) fs.writeFileSync(p, next);
    }
  }
}

walk(root);
walk(testRoot);

// middleware at web root
const mw = path.join(root, "middleware.ts");
if (fs.existsSync(mw)) {
  const original = fs.readFileSync(mw, "utf8");
  const next = transform(original);
  if (next !== original) fs.writeFileSync(mw, next);
}

console.log("URL restructure replacements applied.");
