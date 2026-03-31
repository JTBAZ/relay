export type AccessLevel = "public" | "member_only" | "tier_gated";

export type CloneTierRule = {
  tier_id: string;
  title: string;
  access_level: AccessLevel;
  campaign_id?: string;
};

export type CloneMediaRef = {
  media_id: string;
  mime_type?: string;
  has_export: boolean;
  content_path: string;
};

export type ClonePostEntry = {
  post_id: string;
  slug: string;
  title: string;
  published_at: string;
  tag_ids: string[];
  access: {
    level: AccessLevel;
    tier_ids: string[];
  };
  media: CloneMediaRef[];
};

export type CloneSiteModel = {
  site_id: string;
  creator_id: string;
  generated_at: string;
  base_url: string;
  tiers: CloneTierRule[];
  posts: ClonePostEntry[];
  total_media: number;
};

export type ClonePreviewPage = {
  url: string;
  post_id: string;
  title: string;
  access: ClonePostEntry["access"];
  media_count: number;
};

export type CloneSiteStoreRoot = {
  sites: Record<string, CloneSiteModel>;
};
