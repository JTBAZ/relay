#!/usr/bin/env node
/**
 * Minimal live check: does the Patreon OAuth2 v2 API return post body text for a post?
 *
 * Uses the same URLs Relay uses — no cookies, no Express, no canonical store.
 *
 * From repo root (loads PATREON_ACCESS_TOKEN from `.env` if present):
 *   npm run probe:patreon-description -- 12345678
 *
 * Or:
 *   PATREON_ACCESS_TOKEN=... node scripts/probe-patreon-post-description.mjs 12345678
 *
 * Optional: PATREON_CAMPAIGN_ID in env — also samples the first page of
 * GET /campaigns/{id}/posts (list route) for comparison.
 */

import "dotenv/config";

const API = "https://www.patreon.com/api/oauth2/v2";

function normalizeContent(raw) {
  if (typeof raw === "string") return raw;
  if (raw == null) return "";
  if (typeof raw === "object") {
    const o = raw;
    for (const key of ["html", "body", "text", "value", "content"]) {
      const v = o[key];
      if (typeof v === "string" && v.length > 0) return v;
      if (v && typeof v === "object") {
        const nested = normalizeContent(v);
        if (nested) return nested;
      }
    }
  }
  return "";
}

function summarize(raw) {
  const normalized = normalizeContent(raw);
  if (!normalized) {
    if (raw === null) return { ok: false, reason: "null" };
    if (raw === undefined) return { ok: false, reason: "undefined" };
    return { ok: false, reason: "empty_after_normalize", rawType: typeof raw };
  }
  return {
    ok: true,
    length: normalized.length,
    preview: normalized.slice(0, 200).replace(/\s+/g, " ").trim()
  };
}

function pickData(doc) {
  const d = doc?.data;
  if (!d) return null;
  return Array.isArray(d) ? d[0] : d;
}

async function getJson(url, token) {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` }
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _parseError: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, body, rawText: text };
}

const token =
  process.env.PATREON_ACCESS_TOKEN?.trim() ||
  process.env.PATREON_CREATOR_ACCESS_TOKEN?.trim() ||
  "";
const postId = (process.argv[2] || process.env.PATREON_POST_ID || "").trim();
const campaignId = (process.env.PATREON_CAMPAIGN_ID || "").trim();

if (!token) {
  console.error(
    "Set PATREON_ACCESS_TOKEN (creator token from OAuth / portal) in env or root .env"
  );
  process.exit(2);
}

if (!postId) {
  console.error("Usage: npm run probe:patreon-description -- <post_numeric_id>");
  process.exit(2);
}

console.log(`Post id: ${postId}\n`);

// 1) Bare single-post URL (matches Relay fetchPostById / singlePostUrl)
const bareUrl = `${API}/posts/${encodeURIComponent(postId)}`;
console.log("--- Probe 1: GET (bare, no query) ---");
console.log(bareUrl);
const bare = await getJson(bareUrl, token);
if (!bare.ok) {
  console.log(`HTTP ${bare.status}`);
  console.log(
    typeof bare.body === "object" && bare.body?.errors
      ? JSON.stringify(bare.body, null, 0).slice(0, 600)
      : bare.rawText.slice(0, 600)
  );
} else {
  const resource = pickData(bare.body);
  const attrs = resource?.attributes ?? {};
  const sum = summarize(attrs.content);
  console.log(`title: ${JSON.stringify(attrs.title ?? "")}`);
  console.log(`attributes.content: ${JSON.stringify(sum)}`);
  console.log(`attribute keys: ${JSON.stringify(Object.keys(attrs).sort())}`);
}

// 2) Optional: first page of campaign posts (matches Relay postsPageUrl)
if (campaignId) {
  const params = new URLSearchParams();
  params.set("page[count]", "5");
  params.set(
    "fields[post]",
    "title,content,published_at,edited_at,url,is_public,is_paid,embed_url,embed_data"
  );
  params.set("include", "tiers");
  params.set("fields[tier]", "title,created_at,edited_at,published");
  const listUrl = `${API}/campaigns/${encodeURIComponent(campaignId)}/posts?${params}`;
  console.log("\n--- Probe 2: GET campaigns/{id}/posts (first 5) ---");
  console.log(listUrl);
  const list = await getJson(listUrl, token);
  if (!list.ok) {
    console.log(`HTTP ${list.status} ${list.rawText.slice(0, 400)}`);
  } else {
    const rows = Array.isArray(list.body?.data) ? list.body.data : [];
    console.log(`posts in page: ${rows.length}`);
    for (const r of rows.slice(0, 5)) {
      const a = r?.attributes ?? {};
      const sum = summarize(a.content);
      const mark = sum.ok ? "HAS_CONTENT" : "NO_CONTENT";
      console.log(`  id=${r.id} ${mark} title=${JSON.stringify(a.title ?? "").slice(0, 60)}`);
    }
  }
} else {
  console.log(
    "\n(Set PATREON_CAMPAIGN_ID to also run the campaign posts list probe.)"
  );
}

const bareOk =
  bare.ok && summarize(pickData(bare.body)?.attributes?.content ?? null).ok;
console.log(
  `\nRESULT: ${bareOk ? "OK — OAuth returned usable content for this post (probe 1)." : "NO — probe 1 did not return usable content (check HTTP error or null content above)."}`
);
process.exit(bareOk ? 0 : 1);
