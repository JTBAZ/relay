/**
 * SubscribeStar exploratory payload → Relay `SyncBatchInput`.
 * @description Pure mapper; populate from GraphQL/Explorer shapes after field names are validated.
 * @see docs/integrations/subscribestar-ingest-mapping.md id prefixes (`substar_*`).
 */

import type {
  IngestCampaign,
  IngestMediaItem,
  IngestPost,
  IngestTier,
  SyncBatchInput
} from "../ingest/types.js";
import { mirrorSnapshotSourceForIngestPostId } from "../ingest/mirror-post-source.js";

/** External id fragments (numbers/slugs) without `substar_*` prefix wrappers. */
export type SubscribeStarIngestCampaignWire = {
  external_campaign_id: string;
  name: string;
  upstream_updated_at?: string;
};

export type SubscribeStarIngestTierWire = {
  external_tier_id: string;
  title: string;
  amount_cents?: number;
  upstream_updated_at?: string;
};

export type SubscribeStarIngestMediaWire = {
  external_media_id: string;
  upstream_revision: string;
  upstream_url?: string;
  mime_type?: string;
  role?: string;
};

export type SubscribeStarIngestPostWire = {
  external_post_id: string;
  title: string;
  description?: string;
  published_at: string;
  upstream_revision: string;
  tier_external_ids?: string[];
  tag_ids?: string[];
  media?: SubscribeStarIngestMediaWire[];
};

export type SubscribeStarIngestBatchWire = {
  creator_id: string;
  campaign: SubscribeStarIngestCampaignWire;
  tiers?: SubscribeStarIngestTierWire[];
  posts: SubscribeStarIngestPostWire[];
  /** Fallback timestamp for campaign/tier rows when wire omits one. */
  now_iso?: string;
};

export function substarCampaignId(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("substar_campaign_")) return t;
  return `substar_campaign_${t}`;
}

export function substarTierId(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("substar_tier_")) return t;
  return `substar_tier_${t}`;
}

export function substarPostId(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("substar_post_")) return t;
  return `substar_post_${t}`;
}

export function substarMediaId(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("substar_media_")) return t;
  return `substar_media_${t}`;
}

/** True when ingest post ids partition to SubscribeStar in `apply-batch` / DB persistence. */
export function isSubscribeStarIngestPostId(postId: string): boolean {
  return mirrorSnapshotSourceForIngestPostId(postId) === "SUBSCRIBESTAR";
}

export function subscribeStarCampaignRow(
  wire: SubscribeStarIngestCampaignWire,
  nowIso?: string
): IngestCampaign {
  const cid = substarCampaignId(wire.external_campaign_id);
  return {
    campaign_id: cid,
    name: wire.name.trim() || cid,
    upstream_updated_at:
      typeof wire.upstream_updated_at === "string" && wire.upstream_updated_at.trim()
        ? wire.upstream_updated_at.trim()
        : nowIso ?? new Date().toISOString()
  };
}

export function subscribeStarTierRows(
  wireTiers: SubscribeStarIngestTierWire[] | undefined,
  campaignId: string,
  nowIso?: string
): IngestTier[] {
  const ts = typeof nowIso === "string" ? nowIso : new Date().toISOString();
  const list = wireTiers ?? [];
  const out: IngestTier[] = [];
  for (const t of list) {
    out.push({
      tier_id: substarTierId(t.external_tier_id),
      title: t.title.trim() || substarTierId(t.external_tier_id),
      campaign_id: campaignId,
      upstream_updated_at:
        typeof t.upstream_updated_at === "string" && t.upstream_updated_at.trim()
          ? t.upstream_updated_at.trim()
          : ts,
      ...(typeof t.amount_cents === "number" && Number.isFinite(t.amount_cents)
        ? { amount_cents: t.amount_cents }
        : {})
    });
  }
  return out;
}

function mapSubscribeStarMedia(items: SubscribeStarIngestMediaWire[] | undefined): IngestMediaItem[] {
  const raw = items ?? [];
  const out: IngestMediaItem[] = [];
  for (const m of raw) {
    out.push({
      media_id: substarMediaId(m.external_media_id),
      upstream_revision: m.upstream_revision.trim(),
      upstream_url: typeof m.upstream_url === "string" ? m.upstream_url.trim() || undefined : undefined,
      mime_type: typeof m.mime_type === "string" ? m.mime_type.trim() || undefined : undefined,
      role: typeof m.role === "string" ? m.role.trim() || undefined : undefined
    });
  }
  return out;
}

export function subscribeStarPostRow(wire: SubscribeStarIngestPostWire): IngestPost {
  const tierIds = (wire.tier_external_ids ?? []).map((x) => substarTierId(String(x)));
  const tagIds = (wire.tag_ids ?? []).filter((x) => typeof x === "string" && x.trim());
  return {
    post_id: substarPostId(wire.external_post_id),
    title: wire.title.trim() || substarPostId(wire.external_post_id),
    description: typeof wire.description === "string" ? wire.description : undefined,
    published_at: wire.published_at.trim(),
    tag_ids: tagIds,
    tier_ids: tierIds,
    upstream_revision: wire.upstream_revision.trim(),
    media: mapSubscribeStarMedia(wire.media)
  };
}

/**
 * One logical SubscribeStar “page” campaign + optional tiers + posts (Explorer wire).
 */
export function buildSubscribeStarSyncBatch(wire: SubscribeStarIngestBatchWire): SyncBatchInput {
  const creatorId = wire.creator_id.trim();
  const nowBase = typeof wire.now_iso === "string" && wire.now_iso.trim() ? wire.now_iso.trim() : undefined;
  const campaign = subscribeStarCampaignRow(wire.campaign, nowBase);
  const tiers = subscribeStarTierRows(wire.tiers, campaign.campaign_id, nowBase);
  const posts = wire.posts.map((p) => subscribeStarPostRow(p));
  return {
    creator_id: creatorId,
    campaigns: [campaign],
    ...(tiers.length > 0 ? { tiers } : {}),
    posts
  };
}
