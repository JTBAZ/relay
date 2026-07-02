#!/usr/bin/env node
/**
 * Probe Patreon creator-session endpoints for post-level impressions/seen.
 *
 * Usage:
 *   PATREON_SESSION_ID=... node scripts/probe-patreon-post-insights.mjs 162544992
 *   node scripts/probe-patreon-post-insights.mjs <session_id> <post_id> [campaign_id]
 */

const SITE = "https://www.patreon.com";

const sessionId = process.argv[2] || process.env.PATREON_SESSION_ID || "";
const postId = process.argv[3] || process.env.PATREON_POST_ID || "162544992";
const campaignIdArg = process.argv[4] || process.env.PATREON_CAMPAIGN_ID || "";

if (!sessionId) {
  console.error(
    "Usage: PATREON_SESSION_ID=... node scripts/probe-patreon-post-insights.mjs [post_id]\n" +
      "   or: node scripts/probe-patreon-post-insights.mjs <session_id> <post_id> [campaign_id]"
  );
  process.exit(1);
}

const headers = {
  cookie: `session_id=${sessionId}`,
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  accept: "application/json"
};

function buildPrimaryUrl(id) {
  const include = ["campaign", "native_video_insights", "post_insights", "post_insight"].join(",");
  const fields = [
    "title",
    "published_at",
    "like_count",
    "comment_count",
    "view_count",
    "insights_last_updated_at",
    "impressions",
    "seen"
  ].join(",");
  const u = new URL(`${SITE}/api/posts/${encodeURIComponent(id)}`);
  u.searchParams.set("include", include);
  u.searchParams.set("fields[post]", fields);
  u.searchParams.set("fields[native_video_insights]", "num_views,preview_views,last_updated_at");
  u.searchParams.set("fields[post_insights]", "impressions,seen,likes,comments,last_updated_at");
  u.searchParams.set("fields[post_insight]", "impressions,seen,likes,comments,last_updated_at");
  u.searchParams.set("json-api-version", "1.0");
  return u.toString();
}

function candidateUrls(id, campaignId) {
  const urls = [
    buildPrimaryUrl(id),
    `${SITE}/api/post_insights/${encodeURIComponent(id)}?json-api-version=1.0`,
    `${SITE}/api/posts/${encodeURIComponent(id)}/post_insights?json-api-version=1.0`
  ];
  if (campaignId) {
    const filtered = new URL(`${SITE}/api/post_insights`);
    filtered.searchParams.set("filter[campaign_id]", campaignId);
    filtered.searchParams.set("filter[post_id]", id);
    filtered.searchParams.set("json-api-version", "1.0");
    urls.push(filtered.toString());
  }
  return urls;
}

function summarizePayload(json) {
  const data = json?.data;
  const post = Array.isArray(data)
    ? data.find((entry) => entry?.type === "post")
    : data?.type === "post"
      ? data
      : null;
  const attrs = post?.attributes ?? {};
  const included = Array.isArray(json?.included) ? json.included : [];
  const insightResources = included.filter((entry) => /insight/i.test(String(entry?.type ?? "")));

  return {
    post_id: post?.id ?? null,
    attribute_keys: Object.keys(attrs).sort(),
    like_count: attrs.like_count ?? null,
    comment_count: attrs.comment_count ?? null,
    view_count: attrs.view_count ?? null,
    impressions: attrs.impressions ?? null,
    seen: attrs.seen ?? null,
    insights_last_updated_at: attrs.insights_last_updated_at ?? null,
    included_insight_types: insightResources.map((entry) => ({
      type: entry.type,
      id: entry.id,
      attributes: entry.attributes ?? {}
    }))
  };
}

async function probe(url) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { url, status: res.status, json, text: text.slice(0, 400) };
}

console.log(`Probing Patreon post metrics for post_id=${postId}\n`);

let campaignId = campaignIdArg;
for (const url of candidateUrls(postId, campaignId)) {
  const result = await probe(url);
  console.log(`--- ${result.status} ${url}`);
  if (!result.json) {
    console.log(result.text);
    console.log("");
    continue;
  }

  const summary = summarizePayload(result.json);
  console.log(JSON.stringify(summary, null, 2));

  if (!campaignId && result.json?.included) {
    const campaign = result.json.included.find((entry) => entry?.type === "campaign");
    if (campaign?.id) campaignId = String(campaign.id);
  }
  console.log("");
}

if (campaignId && !campaignIdArg) {
  console.log(`Discovered campaign_id=${campaignId}; re-run with campaign id to probe filtered endpoints.\n`);
}
