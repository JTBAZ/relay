import type { IngestCampaign, IngestPost, IngestTier, SyncBatchInput } from "../ingest/types.js";
import type { JsonApiDocument, JsonApiResource } from "./jsonapi-types.js";
import { asDataArray, indexIncluded } from "./patreon-resource-api.js";
import {
  RELAY_TIER_ALL_PATRONS,
  RELAY_TIER_PUBLIC
} from "./relay-access-tiers.js";
import { flattenProseMirrorDoc, normalizePatreonPostContent } from "./post-content.js";

const IMG_IN_CONTENT_RE =
  /https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'<>]*)?/gi;

const PATREON_CDN_RE =
  /https?:\/\/[a-z0-9]+\.patreonusercontent\.com\/[^\s"'<>]+/gi;

const IMG_SRC_RE = /<img[^>]+src=["']([^"']+)["']/gi;

function strAttr(a: Record<string, unknown> | undefined, key: string): string {
  const v = a?.[key];
  return typeof v === "string" ? v : "";
}

function guessMimeFromUrl(url: string): string | undefined {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return undefined;
}

function normalizeTierRefArray(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string" || typeof x === "number") {
      const id = String(x).trim();
      if (id) out.push(`patreon_tier_${id}`);
      continue;
    }
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const id = o.id ?? o.tier_id;
      if (typeof id === "string" || typeof id === "number") {
        const s = String(id).trim();
        if (s) out.push(`patreon_tier_${s}`);
      }
    }
  }
  return out;
}

function tierLinksToIds(
  data:
    | { type: string; id: string }
    | Array<{ type: string; id: string }>
    | null
    | undefined
): string[] {
  if (!data) return [];
  const links = Array.isArray(data) ? data : [data];
  const out: string[] = [];
  for (const link of links) {
    if (link?.type === "tier" && link.id) {
      out.push(`patreon_tier_${String(link.id)}`);
    }
  }
  return out;
}

/**
 * Tier ids from a Patreon post resource: `attributes.tiers` (strings, numbers, or
 * JSON:API-style objects) and fallback to `relationships.tiers.data`.
 */
export function tierIdsFromPatreonPost(resource: JsonApiResource): string[] {
  const a = resource.attributes ?? {};
  const fromAttrs = normalizeTierRefArray(a.tiers);
  if (fromAttrs.length > 0) return fromAttrs;
  return tierLinksToIds(resource.relationships?.tiers?.data);
}

/** Patreon sometimes sends booleans as strings in JSON:API attributes. */
export function patreonBoolAttr(
  attrs: Record<string, unknown>,
  key: string
): boolean | undefined {
  const v = attrs[key];
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return undefined;
}

/**
 * Use `is_public` when Patreon sends it so we distinguish public posts from
 * patron-only posts that have an empty `tiers` array (common on older posts).
 * When `is_public` is omitted, falls back to `is_paid` to avoid treating
 * ambiguous posts as public.
 */
export function applyPatreonAccessToTierIds(
  patreonTierIds: string[],
  attrs: Record<string, unknown>
): string[] {
  const pub = patreonBoolAttr(attrs, "is_public");
  if (pub === true) {
    return [RELAY_TIER_PUBLIC];
  }
  if (pub === false) {
    if (patreonTierIds.length > 0) return patreonTierIds;
    return [RELAY_TIER_ALL_PATRONS];
  }
  if (patreonTierIds.length > 0) return patreonTierIds;
  const paid = patreonBoolAttr(attrs, "is_paid");
  if (paid === true) return [RELAY_TIER_ALL_PATRONS];
  if (paid === false) return [RELAY_TIER_PUBLIC];
  return patreonTierIds;
}

/**
 * Diagnostic dump of the raw API fields that drive description and tier extraction.
 * Pushed into scrape warnings so dry-run output reveals the exact shape Patreon sent.
 */
export function diagnosePostResource(resource: JsonApiResource): string {
  const a = resource.attributes ?? {};
  const contentType = a.content === null ? "null" : typeof a.content;
  const contentKeys =
    a.content && typeof a.content === "object"
      ? Object.keys(a.content as Record<string, unknown>).join(",")
      : undefined;
  const hasJsonString = typeof a.content_json_string === "string" && a.content_json_string.length > 0;
  const tiersAttr = JSON.stringify(a.tiers ?? null).slice(0, 150);
  const tiersRel = JSON.stringify(resource.relationships?.tiers?.data ?? null).slice(0, 150);
  return (
    `[diag] Post ${resource.id}: ` +
    `content_type=${contentType}` +
    (contentKeys ? ` content_keys=[${contentKeys}]` : "") +
    ` content_json_string=${hasJsonString ? "present" : "absent"}` +
    ` is_public=${String(a.is_public ?? "(absent)")}` +
    ` is_paid=${String(a.is_paid ?? "(absent)")}` +
    ` attr.tiers=${tiersAttr}` +
    ` rel.tiers=${tiersRel}`
  );
}

/**
 * Extracts image URLs from post HTML content.  Three passes:
 * 1. <img src="…"> tags (any domain)
 * 2. Patreon CDN URLs (patreonusercontent.com, often extensionless)
 * 3. Bare image-extension URLs (jpg/png/gif/webp)
 * Patreon API v2 does NOT expose post images/attachments as relationships;
 * scraping `content` HTML is the best-effort path.
 */
function imageUrlsFromContent(html: string, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    if (seen.has(url) || out.length >= max) return;
    seen.add(url);
    out.push(url);
  };

  let m: RegExpExecArray | null;

  const imgSrc = new RegExp(IMG_SRC_RE.source, IMG_SRC_RE.flags);
  while ((m = imgSrc.exec(html)) !== null) {
    if (m[1]) push(m[1]);
  }

  const cdn = new RegExp(PATREON_CDN_RE.source, PATREON_CDN_RE.flags);
  while ((m = cdn.exec(html)) !== null) {
    push(m[0]);
  }

  const ext = new RegExp(IMG_IN_CONTENT_RE.source, IMG_IN_CONTENT_RE.flags);
  while ((m = ext.exec(html)) !== null) {
    push(m[0]);
  }

  return out;
}

/**
 * Extract URLs from the embed_data object (Patreon sets this for embedded
 * media — video embeds, some image posts, etc.).
 */
function urlsFromEmbedData(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const urls: string[] = [];
  for (const key of ["url", "thumbnail_url", "html"]) {
    const v = obj[key];
    if (typeof v === "string" && v.startsWith("http")) {
      urls.push(v);
    }
  }
  return urls;
}

export function mapPatreonPostToIngest(resource: JsonApiResource): IngestPost {
  const id = resource.id;
  const a = resource.attributes ?? {};
  const titleRaw = strAttr(a, "title");
  const title = titleRaw.trim() ? titleRaw.trim() : "(untitled)";
  let publishedAt = strAttr(a, "published_at").trim();
  if (!publishedAt) {
    publishedAt = new Date().toISOString();
  }
  const editedAt = strAttr(a, "edited_at").trim();
  const revTime = editedAt || publishedAt;
  const revBase = `${id}:${publishedAt}:${revTime}`;
  const upstream_revision = `patreon:${revBase}`;

  const baseTiers = tierIdsFromPatreonPost(resource);
  const tier_ids = applyPatreonAccessToTierIds(baseTiers, a);

  const content =
    normalizePatreonPostContent(a.content) ||
    flattenProseMirrorDoc(a.content_json_string);
  const embedUrl = strAttr(a, "embed_url").trim();
  const embedData = a.embed_data;

  const media: IngestPost["media"] = [];
  const seenUrls = new Set<string>();
  let mediaSeq = 0;

  const pushUrl = (url: string, idSuffix: string, revPrefix: string) => {
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    mediaSeq += 1;
    media.push({
      media_id: `patreon_${id}_${idSuffix}`,
      mime_type: guessMimeFromUrl(url) ?? "application/octet-stream",
      upstream_url: url,
      upstream_revision: `${revPrefix}:${revBase}`
    });
  };

  if (embedUrl) {
    pushUrl(embedUrl, "embed", "patreon_embed");
  }

  for (const u of urlsFromEmbedData(embedData)) {
    pushUrl(u, `edata_${mediaSeq + 1}`, "patreon_edata");
  }

  for (const url of imageUrlsFromContent(content, 20)) {
    pushUrl(url, `img_${mediaSeq + 1}`, `patreon_img`);
  }

  return {
    post_id: `patreon_post_${id}`,
    title,
    description: content.trim() || undefined,
    published_at: publishedAt,
    tag_ids: [],
    tier_ids,
    upstream_revision,
    media
  };
}

export function buildCampaignAndTiersFromCampaignsDoc(
  doc: JsonApiDocument,
  creatorId: string,
  campaignNumericId: string
): { campaign: IngestCampaign; tiers: IngestTier[] } | null {
  const list = asDataArray(doc.data);
  const campaignRes =
    list.find((r) => r.type === "campaign" && r.id === campaignNumericId) ?? null;
  if (!campaignRes) return null;

  const ca = campaignRes.attributes ?? {};
  const name =
    strAttr(ca, "name").trim() ||
    strAttr(ca, "creation_name").trim() ||
    `Campaign ${campaignNumericId}`;
  const upstream =
    strAttr(ca, "published_at").trim() ||
    strAttr(ca, "created_at").trim() ||
    new Date().toISOString();

  const campaign: IngestCampaign = {
    campaign_id: `patreon_campaign_${campaignNumericId}`,
    name,
    upstream_updated_at: upstream
  };

  const included = indexIncluded(doc);
  const tierLinks = campaignRes.relationships?.tiers?.data;
  const links = Array.isArray(tierLinks)
    ? tierLinks
    : tierLinks
      ? [tierLinks]
      : [];

  const tiers: IngestTier[] = [];
  for (const link of links) {
    if (!link || link.type !== "tier") continue;
    const tr = included.get(`tier:${link.id}`);
    const ta = tr?.attributes ?? {};
    const title = strAttr(ta, "title").trim() || `Tier ${link.id}`;
    const tu =
      strAttr(ta, "edited_at").trim() ||
      strAttr(ta, "created_at").trim() ||
      upstream;
    const rawAmt = ta.amount_cents;
    const amountCents =
      typeof rawAmt === "number" && Number.isFinite(rawAmt) && rawAmt >= 0
        ? rawAmt
        : undefined;
    tiers.push({
      tier_id: `patreon_tier_${link.id}`,
      title,
      campaign_id: campaign.campaign_id,
      ...(amountCents !== undefined ? { amount_cents: amountCents } : {}),
      upstream_updated_at: tu
    });
  }

  const have = new Set(tiers.map((t) => t.tier_id));
  const synthetic: IngestTier[] = [
    {
      tier_id: RELAY_TIER_PUBLIC,
      title: "Public",
      campaign_id: campaign.campaign_id,
      amount_cents: 0,
      upstream_updated_at: upstream
    },
    {
      tier_id: RELAY_TIER_ALL_PATRONS,
      title: "All patrons",
      campaign_id: campaign.campaign_id,
      amount_cents: 1,
      upstream_updated_at: upstream
    }
  ];
  for (const st of synthetic) {
    if (!have.has(st.tier_id)) {
      tiers.push(st);
    }
  }

  return { campaign, tiers };
}

/**
 * Pick a single campaign id from a campaigns list response when the client
 * did not specify one.
 */
export function pickDefaultCampaignId(doc: JsonApiDocument): string | null {
  const list = asDataArray(doc.data);
  const campaigns = list.filter((r) => r.type === "campaign");
  if (campaigns.length === 1) return campaigns[0]!.id;
  return null;
}

export function buildSyncBatchFromParts(
  creatorId: string,
  campaign: IngestCampaign,
  tiers: IngestTier[],
  posts: IngestPost[]
): SyncBatchInput {
  return {
    creator_id: creatorId,
    campaigns: [campaign],
    tiers,
    posts
  };
}
