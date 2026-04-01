#!/usr/bin/env node
/**
 * Inspect Patreon www /api/posts for how post.attributes.content is shaped.
 *
 * When the list returns content: null (common with fields[post]), we also GET
 * /api/posts/:id without sparse fields — Relay uses that for cookie scrape body text.
 *
 * Usage:
 *   PATREON_SESSION_ID=... PATREON_CAMPAIGN_ID=15782831 node scripts/inspect-patreon-post-content.mjs
 *   node scripts/inspect-patreon-post-content.mjs <session_id> <campaign_id> [post_numeric_id]
 *
 * Optional: PATREON_ACCESS_TOKEN=creator_oauth_token — when list/detail content is null,
 * probes GET /api/oauth2/v2/posts/{id} (same backfill Relay uses after cookie scrape).
 *
 * Requires network; does not touch Relay canonical store.
 */

const SITE = "https://www.patreon.com";
const POSTS_API = `${SITE}/api/posts`;
const INCLUDE = [
  "attachments_media",
  "audio",
  "images",
  "media",
  "campaign",
  "user_defined_tags",
  "tiers"
].join(",");
const FIELDS_POST = [
  "title",
  "content",
  "content_json_string",
  "published_at",
  "edited_at",
  "image",
  "embed_url",
  "tiers",
  "url",
  "is_paid",
  "is_public"
].join(",");

function buildUrl(campaignId) {
  const u = new URL(POSTS_API);
  u.searchParams.set("include", INCLUDE);
  u.searchParams.set("fields[post]", FIELDS_POST);
  u.searchParams.set("fields[user_defined_tag]", "value,tag_type");
  u.searchParams.set("filter[campaign_id]", campaignId);
  u.searchParams.set("filter[contains_exclusive_posts]", "true");
  u.searchParams.set("filter[is_draft]", "false");
  u.searchParams.set("sort", "-published_at");
  u.searchParams.set("json-api-version", "1.0");
  return u.toString();
}

function buildDetailUrl(postId) {
  const u = new URL(`${POSTS_API}/${encodeURIComponent(postId)}`);
  u.searchParams.set("include", INCLUDE);
  u.searchParams.set("fields[user_defined_tag]", "value,tag_type");
  u.searchParams.set("json-api-version", "1.0");
  return u.toString();
}

function summarizeContent(raw) {
  if (raw === undefined) {
    return { kind: "undefined" };
  }
  if (raw === null) {
    return { kind: "null" };
  }
  const t = typeof raw;
  if (t === "string") {
    return { kind: "string", length: raw.length, preview: raw.slice(0, 280) };
  }
  if (t === "object") {
    const keys = Object.keys(raw);
    const json = JSON.stringify(raw);
    return {
      kind: "object",
      keys,
      preview: json.length > 400 ? `${json.slice(0, 400)}…` : json
    };
  }
  return { kind: t, preview: String(raw).slice(0, 200) };
}

const sessionId =
  process.argv[2] || process.env.PATREON_SESSION_ID || "";
const campaignId =
  process.argv[3] || process.env.PATREON_CAMPAIGN_ID || "";
const onlyPostId = process.argv[4] || process.env.PATREON_POST_ID || "";

if (!sessionId || !campaignId) {
  console.error(
    "Usage: PATREON_SESSION_ID=... PATREON_CAMPAIGN_ID=... node scripts/inspect-patreon-post-content.mjs\n" +
      "   or: node scripts/inspect-patreon-post-content.mjs <session_id> <campaign_id> [post_id]"
  );
  process.exit(1);
}

const headers = {
  cookie: `session_id=${sessionId}`,
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

const url = buildUrl(campaignId);
const res = await fetch(url, { headers });
const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}`, text.slice(0, 800));
  process.exit(2);
}

/** @type {{ data?: unknown }} */
let doc;
try {
  doc = JSON.parse(text);
} catch (e) {
  console.error("Invalid JSON", e);
  process.exit(3);
}

const data = doc.data;
const list = Array.isArray(data) ? data : data ? [data] : [];

const posts = list.filter((r) => r && r.type === "post");
console.log(`List URL: ${url}\nPosts in page: ${posts.length}\n`);

for (const r of posts) {
  if (onlyPostId && String(r.id) !== String(onlyPostId)) {
    continue;
  }
  const a = r.attributes ?? {};
  const title = typeof a.title === "string" ? a.title : "(no title)";
  const contentSum = summarizeContent(a.content);
  console.log(`--- post id=${r.id} title=${JSON.stringify(title)}`);
  console.log(`    list content: ${JSON.stringify(contentSum)}`);

  if (contentSum.kind === "null" || contentSum.kind === "undefined") {
    const durl = buildDetailUrl(r.id);
    const dres = await fetch(durl, { headers });
    const dtext = await dres.text();
    if (!dres.ok) {
      console.log(`    detail GET: HTTP ${dres.status} ${dtext.slice(0, 200)}`);
    } else {
      try {
        const ddoc = JSON.parse(dtext);
        const dr = ddoc.data;
        const single = Array.isArray(dr) ? dr[0] : dr;
        const da = single?.attributes ?? {};
        console.log(
          `    detail content: ${JSON.stringify(summarizeContent(da.content))}`
        );
        console.log(
          `    detail attribute keys: ${JSON.stringify(Object.keys(da).sort())}`
        );
        console.log(`    detail URL: ${durl}`);
      } catch {
        console.log(`    detail: invalid JSON`);
      }
    }
  }

  const other = ["post_type", "content_teaser_text", "patron_count"]
    .filter((k) => a[k] !== undefined)
    .map((k) => [k, typeof a[k], String(a[k]).slice(0, 120)]);
  if (other.length) {
    console.log(`    other (list): ${JSON.stringify(other)}`);
  }

  const oauthTok = process.env.PATREON_ACCESS_TOKEN?.trim();
  if (
    oauthTok &&
    (contentSum.kind === "null" || contentSum.kind === "undefined")
  ) {
    const ou = new URL(
      `https://www.patreon.com/api/oauth2/v2/posts/${encodeURIComponent(r.id)}`
    );
    ou.searchParams.set(
      "fields[post]",
      "title,content,published_at,edited_at,is_public,is_paid,embed_url"
    );
    const ores = await fetch(ou.toString(), {
      headers: { authorization: `Bearer ${oauthTok}` }
    });
    const otxt = await ores.text();
    if (!ores.ok) {
      console.log(`    oauth v2 post: HTTP ${ores.status} ${otxt.slice(0, 160)}`);
    } else {
      try {
        const oj = JSON.parse(otxt);
        const od = oj.data;
        const one = Array.isArray(od) ? od[0] : od;
        const oa = one?.attributes ?? {};
        console.log(
          `    oauth v2 content: ${JSON.stringify(summarizeContent(oa.content))}`
        );
        console.log(`    oauth v2 URL: ${ou.toString()}`);
      } catch {
        console.log(`    oauth v2: invalid JSON`);
      }
    }
  }

  console.log("");
}

if (onlyPostId && posts.every((r) => String(r.id) !== String(onlyPostId))) {
  console.warn(
    `No post with id ${onlyPostId} on first page; paginate or check id.`
  );
}
