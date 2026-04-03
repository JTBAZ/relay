import type { IngestPost } from "../ingest/types.js";
import type { JsonApiDocument, JsonApiResource } from "./jsonapi-types.js";
import {
  applyPatreonAccessToTierIdsForCookie,
  diagnosePostResource,
  tierIdsFromPatreonPost
} from "./map-patreon-to-ingest.js";
import { finalizePatreonPostMedia } from "./merge-ingest-media.js";
import { flattenProseMirrorDoc, normalizePatreonPostContent } from "./post-content.js";

const SITE_URL = "https://www.patreon.com";
const POSTS_API_URL = `${SITE_URL}/api/posts`;

const POSTS_INCLUDE = [
  "attachments_media",
  "audio",
  "images",
  "media",
  "campaign",
  "user_defined_tags",
  "tiers"
].join(",");

const POST_FIELDS = [
  "title", "content", "content_json_string", "published_at", "edited_at",
  "image", "embed_url", "tiers", "url", "is_paid", "is_public"
].join(",");

function strAttr(a: Record<string, unknown> | undefined, key: string): string {
  const v = a?.[key];
  return typeof v === "string" ? v : "";
}

function guessMime(url: string): string | undefined {
  const lower = (url.split("?")[0] ?? "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return undefined;
}

function indexIncluded(doc: JsonApiDocument): Map<string, JsonApiResource> {
  const map = new Map<string, JsonApiResource>();
  for (const r of doc.included ?? []) {
    map.set(`${r.type}:${r.id}`, r);
  }
  return map;
}

function mediaUrlFromIncludedResource(attrs: Record<string, unknown>): string | undefined {
  const dl = strAttr(attrs, "download_url");
  if (dl) return dl;
  const imgUrls = attrs.image_urls;
  if (imgUrls && typeof imgUrls === "object") {
    const iu = imgUrls as Record<string, unknown>;
    if (typeof iu.original === "string" && iu.original) return iu.original;
    if (typeof iu.default === "string" && iu.default) return iu.default;
    for (const v of Object.values(iu)) {
      if (typeof v === "string" && v) return v;
    }
  }
  return undefined;
}

function coverImageUrl(attrs: Record<string, unknown>): string | undefined {
  const img = attrs.image;
  if (!img || typeof img !== "object") return undefined;
  const iu = img as Record<string, unknown>;
  return (
    (typeof iu.large_url === "string" ? iu.large_url : undefined) ??
    (typeof iu.url === "string" ? iu.url : undefined) ??
    (typeof iu.thumb_url === "string" ? iu.thumb_url : undefined)
  );
}

/** Exported for unit tests and leak diagnosis (post `content` → ingest `description`). */
export function mapCookiePostToIngest(
  resource: JsonApiResource,
  included: Map<string, JsonApiResource>
): IngestPost {
  const id = resource.id;
  const a = resource.attributes ?? {};
  const titleRaw = strAttr(a, "title");
  const title = titleRaw.trim() || "(untitled)";
  const description =
    normalizePatreonPostContent(a.content).trim() ||
    flattenProseMirrorDoc(a.content_json_string).trim() ||
    undefined;
  let publishedAt = strAttr(a, "published_at").trim();
  if (!publishedAt) publishedAt = new Date().toISOString();
  const editedAt = strAttr(a, "edited_at").trim();
  const revTime = editedAt || publishedAt;

  const upstream_revision = `patreon_cookie:${id}:${publishedAt}:${revTime}`;

  const baseTiers = tierIdsFromPatreonPost(resource);
  const tier_ids = applyPatreonAccessToTierIdsForCookie(baseTiers, a);

  const tagRel = resource.relationships?.user_defined_tags?.data;
  const tag_ids: string[] = [];
  if (Array.isArray(tagRel)) {
    for (const link of tagRel) {
      const inc = included.get(`${link.type}:${link.id}`);
      const val = strAttr(inc?.attributes ?? {}, "value");
      if (val) tag_ids.push(val);
    }
  }

  const media: IngestPost["media"] = [];
  let seq = 0;

  const pushUrl = (url: string, mediaId: string, mime?: string, role?: string) => {
    if (!url) return;
    seq += 1;
    media.push({
      media_id: mediaId,
      mime_type: mime ?? guessMime(url) ?? "application/octet-stream",
      upstream_url: url,
      upstream_revision: `patreon_cookie_media:${id}:${seq}:${publishedAt}`,
      role
    });
  };

  const relKeys = ["images", "attachments_media", "media", "audio"];
  for (const key of relKeys) {
    const relData = resource.relationships?.[key]?.data;
    if (!relData) continue;
    const links = Array.isArray(relData) ? relData : [relData];
    for (const link of links) {
      const inc = included.get(`${link.type}:${link.id}`);
      if (!inc) continue;
      const attrs = inc.attributes ?? {};
      const url = mediaUrlFromIncludedResource(attrs);
      if (!url) continue;
      const mimeRaw = strAttr(attrs, "mimetype") || strAttr(attrs, "mime_type");
      pushUrl(url, `patreon_media_${link.id}`, mimeRaw || undefined);
    }
  }

  const cover = coverImageUrl(a);
  if (cover) {
    pushUrl(cover, `patreon_${id}_cover`, undefined, "cover");
  }

  const embedUrl = strAttr(a, "embed_url").trim();
  if (embedUrl) {
    pushUrl(embedUrl, `patreon_${id}_embed`, "application/octet-stream", "embed");
  }

  return {
    post_id: `patreon_post_${id}`,
    title,
    description,
    published_at: publishedAt,
    tag_ids,
    tier_ids,
    upstream_revision,
    media: finalizePatreonPostMedia(media)
  };
}

async function cookieFetch(
  url: string,
  sessionId: string,
  fetchImpl: typeof fetch
): Promise<JsonApiDocument> {
  const res = await fetchImpl(url, {
    headers: {
      cookie: `session_id=${sessionId}`,
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Patreon cookie API ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as JsonApiDocument;
}

export type CookieScrapeResult = {
  posts: IngestPost[];
  pages_fetched: number;
  posts_fetched: number;
  warnings: string[];
};

export async function scrapeByCookie(opts: {
  sessionId: string;
  campaignId: string;
  maxPages?: number;
  stopBeforePublishedAt?: string;
  fetchImpl?: typeof fetch;
}): Promise<CookieScrapeResult> {
  const { sessionId, campaignId, fetchImpl = fetch } = opts;
  const maxPages = Math.min(Math.max(opts.maxPages ?? 20, 1), 100);
  const stopBefore = opts.stopBeforePublishedAt?.trim() || "";
  const warnings: string[] = [];
  const posts: IngestPost[] = [];
  let pages = 0;
  let nextUrl: string | null = null;
  let reachedStopBefore = false;

  do {
    const url = nextUrl ?? buildPostsUrl(campaignId);
    const doc = await cookieFetch(url, sessionId, fetchImpl);
    pages += 1;
    const included = indexIncluded(doc);

    const dataArr = doc.data === null || doc.data === undefined
      ? []
      : Array.isArray(doc.data) ? doc.data : [doc.data];

    for (const r of dataArr.filter((d) => d.type === "post")) {
      const { resource: enriched, included: incForPost } =
        await enrichPostFromDetailIfNeeded(r, included, sessionId, fetchImpl, warnings);
      const p = mapCookiePostToIngest(enriched, incForPost);
      if (stopBefore && p.published_at <= stopBefore) {
        reachedStopBefore = true;
        break;
      }
      posts.push(p);
      if (!p.description || p.tier_ids.length === 0) {
        warnings.push(diagnosePostResource(enriched));
      }
      if (p.media.length === 0) {
        warnings.push(
          `Post "${p.title}" (${p.post_id}): 0 media via cookie scrape.`
        );
      }
    }

    if (reachedStopBefore) {
      nextUrl = null;
      break;
    }
    nextUrl = doc.links?.next ?? null;
  } while (nextUrl && pages < maxPages);

  return { posts, pages_fetched: pages, posts_fetched: posts.length, warnings };
}

function buildPostsUrl(campaignId: string): string {
  const urlObj = new URL(POSTS_API_URL);
  urlObj.searchParams.set("include", POSTS_INCLUDE);
  urlObj.searchParams.set("fields[post]", POST_FIELDS);
  urlObj.searchParams.set("fields[user_defined_tag]", "value,tag_type");
  urlObj.searchParams.set("filter[campaign_id]", campaignId);
  urlObj.searchParams.set("filter[contains_exclusive_posts]", "true");
  urlObj.searchParams.set("filter[is_draft]", "false");
  urlObj.searchParams.set("sort", "-published_at");
  urlObj.searchParams.set("json-api-version", "1.0");
  return urlObj.toString();
}

/**
 * Single-post URL without `fields[post]`. Patreon's campaign post list often returns
 * `attributes.content: null` even when `content` is in the sparse fieldset; the
 * individual post resource frequently includes the real HTML body.
 */
export function buildPostDetailUrl(postId: string): string {
  const urlObj = new URL(`${POSTS_API_URL}/${encodeURIComponent(postId)}`);
  urlObj.searchParams.set("include", POSTS_INCLUDE);
  urlObj.searchParams.set("fields[user_defined_tag]", "value,tag_type");
  urlObj.searchParams.set("json-api-version", "1.0");
  return urlObj.toString();
}

function postContentIsMissing(resource: JsonApiResource): boolean {
  const a = resource.attributes ?? {};
  return (
    !normalizePatreonPostContent(a.content).trim() &&
    !flattenProseMirrorDoc(a.content_json_string).trim()
  );
}

async function enrichPostFromDetailIfNeeded(
  resource: JsonApiResource,
  listIncluded: Map<string, JsonApiResource>,
  sessionId: string,
  fetchImpl: typeof fetch,
  warnings: string[]
): Promise<{ resource: JsonApiResource; included: Map<string, JsonApiResource> }> {
  if (!postContentIsMissing(resource)) {
    return { resource, included: listIncluded };
  }
  try {
    const detailDoc = await cookieFetch(
      buildPostDetailUrl(resource.id),
      sessionId,
      fetchImpl
    );
    const detailIncluded = indexIncluded(detailDoc);
    const merged = new Map<string, JsonApiResource>([...listIncluded, ...detailIncluded]);
    const raw = detailDoc.data;
    const detail =
      raw === null || raw === undefined
        ? null
        : Array.isArray(raw)
          ? raw.find((x) => x.type === "post" && x.id === resource.id) ?? null
          : raw.type === "post" && raw.id === resource.id
            ? raw
            : null;
    if (!detail) {
      warnings.push(
        `Post ${resource.id}: detail fetch returned no matching post; body may stay empty.`
      );
      return { resource, included: listIncluded };
    }
    const da = detail.attributes ?? {};
    const ra = resource.attributes ?? {};
    const mergedAttrs = { ...ra, ...da };
    const mergedRels = {
      ...resource.relationships,
      ...detail.relationships
    };
    return {
      resource: {
        ...resource,
        attributes: mergedAttrs,
        relationships: mergedRels
      },
      included: merged
    };
  } catch (e) {
    warnings.push(
      `Post ${resource.id}: detail fetch failed (${(e as Error).message}).`
    );
    return { resource, included: listIncluded };
  }
}
