export type AccessLevel = "public" | "member_only" | "tier_gated";
export type PaywallStyle = "blur" | "hard" | "teaser";

export type DemoPersona = {
  id: string;
  label: string;
  tier_ids: string[];
};

export type ClonePostEntry = {
  post_id: string;
  slug: string;
  title: string;
  published_at: string;
  tag_ids: string[];
  access: { level: AccessLevel; tier_ids: string[] };
  media: Array<{
    media_id: string;
    mime_type?: string;
    has_export: boolean;
    content_path: string;
  }>;
};

export type SiteBundle = {
  site_id: string;
  creator_id: string;
  generated_at: string;
  creator: { display_name: string; handle: string };
  theme: {
    color_scheme: string;
    accent_color?: string;
    paywall_style: PaywallStyle;
    hero: { title: string; subtitle?: string; bio?: string };
  };
  demo_personas: DemoPersona[];
  tiers: Array<{ tier_id: string; title: string; access_level: AccessLevel }>;
  posts: ClonePostEntry[];
  total_media: number;
};

export function canAccessPost(
  postAccess: { level: AccessLevel; tier_ids: string[] },
  userTierIds: string[]
): boolean {
  if (postAccess.level === "public") return true;
  if (postAccess.level === "member_only") return userTierIds.length > 0;
  return postAccess.tier_ids.some((t) => userTierIds.includes(t));
}

export function canViewPost(post: ClonePostEntry, persona: DemoPersona): boolean {
  return canAccessPost(post.access, persona.tier_ids);
}
