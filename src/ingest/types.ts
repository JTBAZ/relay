export type IngestCampaign = {
  campaign_id: string;
  name: string;
  upstream_updated_at: string;
};

export type IngestTier = {
  tier_id: string;
  title: string;
  campaign_id?: string;
  upstream_updated_at: string;
};

export type IngestMediaItem = {
  media_id: string;
  mime_type?: string;
  upstream_url?: string;
  upstream_revision: string;
  role?: string;
};

export type IngestPost = {
  post_id: string;
  title: string;
  description?: string;
  published_at: string;
  tag_ids: string[];
  tier_ids: string[];
  upstream_revision: string;
  media: IngestMediaItem[];
};

export type IngestTombstone = {
  entity_type: "post" | "media";
  id: string;
  deleted_at: string;
};

export type SyncBatchInput = {
  creator_id: string;
  campaigns?: IngestCampaign[];
  tiers?: IngestTier[];
  posts?: IngestPost[];
  tombstones?: IngestTombstone[];
};

export type ApplyBatchResult = {
  job_id: string;
  idempotent_skips: number;
  campaigns_upserted: number;
  tiers_upserted: number;
  posts_written: number;
  media_upserted: number;
  tombstones_applied: number;
  events_emitted: number;
};
