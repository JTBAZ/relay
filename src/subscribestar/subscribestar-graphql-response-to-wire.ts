/**
 * Interpret SubscribeStar GraphQL HTTP JSON `{ data?, errors? }` into exploratory wire for
 * {@link ./map-subscribestar-to-ingest.js buildSubscribeStarSyncBatch}.
 *
 * Supports **hypothesis roots** (`contentProviderProfile`, `content_provider_profile`) plus
 * `postsConnection.edges[].node` or flat `posts` arrays — adjust after Explorer names real paths.
 */

import type {
  SubscribeStarIngestBatchWire,
  SubscribeStarIngestMediaWire,
  SubscribeStarIngestPostWire,
  SubscribeStarIngestTierWire
} from "./map-subscribestar-to-ingest.js";

export type SubscribeStarPostsGraphqlMapOk = {
  ok: true;
  wire: SubscribeStarIngestBatchWire;
  end_cursor: string | null;
  has_next_page: boolean;
};

export type SubscribeStarPostsGraphqlMapErr = {
  ok: false;
  issues: string[];
};

export type SubscribeStarPostsGraphqlMapResult = SubscribeStarPostsGraphqlMapOk | SubscribeStarPostsGraphqlMapErr;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stringifyId(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s.length > 0 ? s : null;
  }
  return null;
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickIsoDate(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  const s = pickStr(obj, ...keys);
  return s?.length ? s : undefined;
}

function connectionEdgesNodes(pc: Record<string, unknown>): {
  nodes: Record<string, unknown>[];
  pageInfo: Record<string, unknown> | null;
} {
  const edges = pc.edges;
  const nodes: Record<string, unknown>[] = [];
  if (Array.isArray(edges)) {
    for (const e of edges) {
      const er = asRecord(e);
      const node = er ? asRecord(er.node) : null;
      if (node) nodes.push(node);
    }
  }
  return { nodes, pageInfo: asRecord(pc.pageInfo ?? pc.page_info) };
}

function unwrapPostsFromProfile(cpp: Record<string, unknown>): {
  posts: Record<string, unknown>[];
  pageInfo: Record<string, unknown> | null;
} {
  const pc = asRecord(cpp.postsConnection ?? cpp.posts_connection);
  if (pc) {
    const { nodes: posts, pageInfo } = connectionEdgesNodes(pc);
    return { posts, pageInfo };
  }
  const plain = cpp.posts;
  if (!Array.isArray(plain)) return { posts: [], pageInfo: null };
  const out: Record<string, unknown>[] = [];
  for (const p of plain) {
    const pr = asRecord(p);
    if (pr) out.push(pr);
  }
  return { posts: out, pageInfo: null };
}

function flattenIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const x of value) {
    if (typeof x === "string" || typeof x === "number") {
      const id = stringifyId(x);
      if (id) out.push(id);
      continue;
    }
    const r = asRecord(x);
    const id = r ? stringifyId(r.id ?? r.tier_id ?? r.plan_id) : null;
    if (id) out.push(id);
  }
  return out;
}

function tierWiresFromProfile(cpp: Record<string, unknown>, nowFallback: string): SubscribeStarIngestTierWire[] {
  const buckets: unknown[] = [
    cpp.plans,
    cpp.tiers,
    cpp.subscriptionPlans,
    cpp.subscription_plans,
    cpp.reward_tiers,
    cpp.rewardPlans
  ];
  const seen = new Set<string>();
  const out: SubscribeStarIngestTierWire[] = [];
  for (const b of buckets) {
    if (!Array.isArray(b)) continue;
    for (const t of b) {
      const tr = asRecord(t);
      if (!tr) continue;
      const tid = stringifyId(tr.id ?? tr.tier_id);
      if (!tid || seen.has(tid)) continue;
      seen.add(tid);
      const title =
        pickStr(tr, "title", "name", "label") ??
        tid;
      let amount_cents: number | undefined;
      const maybeCents = tr.amount_cents ?? tr.amountCents;
      if (typeof maybeCents === "number" && Number.isFinite(maybeCents)) amount_cents = maybeCents;
      else if (typeof tr.amount === "number" && Number.isFinite(tr.amount)) amount_cents = Math.round(tr.amount * 100);
      out.push({
        external_tier_id: tid,
        title,
        upstream_updated_at: pickIsoDate(tr, "updated_at", "updatedAt") ?? nowFallback,
        ...(amount_cents !== undefined ? { amount_cents } : {})
      });
    }
  }
  return out;
}

function mapAttachments(node: Record<string, unknown>): SubscribeStarIngestMediaWire[] {
  const bags: unknown[] = [
    node.attachments,
    node.mediaAttachments,
    node.media_attachments,
    node.media,
    node.files,
    node.images
  ];
  const out: SubscribeStarIngestMediaWire[] = [];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const item of bag) {
      const m = asRecord(item);
      if (!m) continue;
      const mid = stringifyId(m.id ?? m.media_id ?? m.attachment_id ?? m.upload_id);
      if (!mid) continue;
      const url = pickStr(m, "upstream_url", "url", "src", "full_url", "download_url", "public_url");
      const mime_type = pickStr(m, "mime_type", "mimeType", "content_type", "contentType");
      const upstream_revision =
        pickStr(m, "upstream_revision", "revision", "version", "checksum", "etag") ??
        (url?.length ? `url_len:${url.length}` : `id:${mid}`);
      out.push({
        external_media_id: mid,
        upstream_revision,
        ...(url ? { upstream_url: url } : {}),
        ...(mime_type ? { mime_type } : {})
      });
    }
  }
  return out;
}

function postTierRefs(node: Record<string, unknown>): string[] | undefined {
  const fromScalar = flattenIdList(node.tier_ids ?? node.tier_external_ids ?? node.plan_ids);
  if (fromScalar.length > 0) return fromScalar;
  const objs = [...flattenIdList(node.plans ?? node.tiers), ...flattenIdList(node.accessPlans ?? node.reward_plans)];
  return objs.length > 0 ? objs : undefined;
}

function mapOnePost(node: Record<string, unknown>, nowFallback: string): SubscribeStarIngestPostWire | null {
  const pid = stringifyId(node.id ?? node.post_id ?? node.slug);
  if (!pid) return null;
  const published_at =
    pickIsoDate(
      node,
      "published_at",
      "publishedAt",
      "posted_at",
      "postedAt",
      "released_at",
      "created_at",
      "createdAt"
    ) ?? nowFallback;
  const title = pickStr(node, "title", "name", "subject") ?? `Post ${pid}`;
  const description = pickStr(
    node,
    "description",
    "body",
    "body_html",
    "bodyHtml",
    "content",
    "text",
    "message"
  );
  const upstream_revision =
    pickStr(
      node,
      "upstream_revision",
      "revision",
      "version",
      "updated_at",
      "updatedAt",
      "modified_at"
    ) ?? `${published_at}:${title.length}`;

  const tierRefs = postTierRefs(node);
  const media = mapAttachments(node);
  const tag_ids = flattenIdList(node.tag_ids ?? node.tags ?? node.categories);

  return {
    external_post_id: pid,
    title,
    published_at,
    upstream_revision,
    ...(description?.length ? { description } : {}),
    ...(tierRefs?.length ? { tier_external_ids: tierRefs } : {}),
    ...(tag_ids.length > 0 ? { tag_ids } : {}),
    ...(media.length > 0 ? { media } : {})
  };
}

function graphqlErrorMessages(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  const out: string[] = [];
  for (const e of errors) {
    const er = asRecord(e);
    const msg =
      typeof er?.message === "string" ? er.message.trim() : typeof e === "string" ? e.trim() : "";
    if (msg) out.push(msg);
  }
  return out;
}

/**
 * Map a GraphQL response envelope to one `SubscribeStarIngestBatchWire` page (same semantics as Explorer wire JSON sent to ingest/batch).
 */
export function mapSubscribeStarPostsGraphqlResponseToIngestWire(input: {
  creator_id: string;
  /** Full HTTP JSON ({ data?, errors? }) */
  response: unknown;
  now_iso?: string;
}): SubscribeStarPostsGraphqlMapResult {
  const creatorId = input.creator_id.trim();
  if (!creatorId) return { ok: false, issues: ["creator_id is empty"] };

  const envelope = input.response;
  const root = asRecord(envelope);
  const gqlErrors = root ? graphqlErrorMessages(root.errors) : [];

  const data = root ? root.data : null;
  const dataRec = data === null || data === undefined ? null : asRecord(data);

  const cppRaw =
    dataRec &&
    (asRecord(dataRec.contentProviderProfile ?? dataRec.content_provider_profile ?? dataRec.starProfile));
  if (!cppRaw) {
    const issues = ["missing_content_provider_profile_root"];
    if (gqlErrors.length > 0) issues.push(`graphql:${gqlErrors.join(" | ")}`);
    return { ok: false, issues };
  }

  const cpp = cppRaw;
  const nowFallback =
    typeof input.now_iso === "string" && input.now_iso.trim()
      ? input.now_iso.trim()
      : new Date().toISOString();

  const { posts: postNodes, pageInfo } = unwrapPostsFromProfile(cpp);

  const campaignIdCandidate =
    stringifyId(cpp.id ?? cpp.profile_id ?? cpp.profileId ?? cpp.page_id ?? cpp.pageId) ??
    stringifyId(cpp.slug) ??
    creatorId;
  const campaignName =
    pickStr(cpp, "title", "name", "nickname", "display_name", "displayName") ?? "SubscribeStar";
  const campaignUpdated =
    pickIsoDate(cpp, "updated_at", "updatedAt", "modified_at") ?? nowFallback;

  const tiers = tierWiresFromProfile(cpp, nowFallback);
  const posts: SubscribeStarIngestPostWire[] = [];
  for (const n of postNodes) {
    const row = mapOnePost(n, nowFallback);
    if (row) posts.push(row);
  }

  if (posts.length === 0) {
    const issues = ["no_posts_in_response"];
    if (gqlErrors.length > 0) issues.push(`graphql:${gqlErrors.join(" | ")}`);
    return { ok: false, issues };
  }

  let has_next_page = false;
  let end_cursor: string | null = null;
  if (pageInfo) {
    if (typeof pageInfo.hasNextPage === "boolean") has_next_page = pageInfo.hasNextPage;
    else if (typeof pageInfo.has_next_page === "boolean") has_next_page = pageInfo.has_next_page;
    const ec =
      typeof pageInfo.endCursor === "string"
        ? pageInfo.endCursor.trim()
        : typeof pageInfo.end_cursor === "string"
          ? String(pageInfo.end_cursor).trim()
          : "";
    end_cursor = ec.length > 0 ? ec : null;
  }

  const wire: SubscribeStarIngestBatchWire = {
    creator_id: creatorId,
    now_iso: nowFallback,
    campaign: {
      external_campaign_id: campaignIdCandidate,
      name: campaignName,
      upstream_updated_at: campaignUpdated
    },
    ...(tiers.length > 0 ? { tiers } : {}),
    posts
  };

  return { ok: true, wire, end_cursor, has_next_page };
}
