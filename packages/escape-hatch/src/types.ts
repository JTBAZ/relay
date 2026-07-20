/**
 * Escape Hatch site bundle — CloneSiteModel semantics plus theme + soft-gate personas.
 */

export type AccessLevel = "public" | "member_only" | "tier_gated";

export type PaywallStyle = "blur" | "hard" | "teaser";

export type ColorScheme = "dark" | "light" | "warm";

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
  /** Relative URL under the generated site, e.g. /media/m1.svg */
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

export type EscapeHatchTheme = {
  color_scheme: ColorScheme;
  accent_color?: string;
  paywall_style: PaywallStyle;
  hero: {
    title: string;
    subtitle?: string;
    bio?: string;
  };
};

export type DemoPersona = {
  id: string;
  label: string;
  /** Soft-gate: tier ids this persona holds (empty = public visitor). */
  tier_ids: string[];
};

export type SiteBundle = {
  site_id: string;
  creator_id: string;
  generated_at: string;
  base_url: string;
  creator: {
    display_name: string;
    handle: string;
  };
  theme: EscapeHatchTheme;
  demo_personas: DemoPersona[];
  tiers: CloneTierRule[];
  posts: ClonePostEntry[];
  total_media: number;
};

/** Minimal CloneSiteModel shape accepted by from-clone adapter. */
export type CloneSiteModelInput = {
  site_id: string;
  creator_id: string;
  generated_at: string;
  base_url: string;
  tiers: CloneTierRule[];
  posts: ClonePostEntry[];
  total_media: number;
};

export type ExportMediaRecordInput = {
  media_id: string;
  relative_blob_path: string;
  mime_type?: string;
  sha256?: string;
  byte_length?: number;
  exported_at?: string;
};

export type CreatorExportIndexInput = {
  creator_id: string;
  media: Record<string, ExportMediaRecordInput>;
};
