/**
 * @fileoverview Type definitions for static “clone” site models derived from canonical ingest + export index.
 * @description Used by file/DB stores and clone generator; maps to `CloneSite.payload` JSON in Prisma.
 * @see prisma/schema.prisma CloneSite
 * @see src/jsdoc-core-entities.ts Gallery (visitor layout is separate; clone is export-oriented)
 */

/** @description Coarse entitlements for clone pages mirroring Patreon access modes. */
export type AccessLevel = "public" | "member_only" | "tier_gated";

/** @description Tier metadata embedded in clone output for gating UX. */
export type CloneTierRule = {
  tier_id: string;
  title: string;
  access_level: AccessLevel;
  campaign_id?: string;
};

/** @description Media pointer with optional export availability for static hosting. */
export type CloneMediaRef = {
  media_id: string;
  mime_type?: string;
  has_export: boolean;
  content_path: string;
};

/** @description Denormalized post row in a generated clone bundle. */
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

/**
 * @description Complete generated clone graph for one creator.
 * @security-audit-required Includes public/member/tier-gated structure; callers must not leak paid-only paths to unauthorized viewers.
 */
export type CloneSiteModel = {
  site_id: string;
  creator_id: string;
  generated_at: string;
  base_url: string;
  tiers: CloneTierRule[];
  posts: ClonePostEntry[];
  total_media: number;
};

/** @description Lightweight preview row for admin/QA navigation lists. */
export type ClonePreviewPage = {
  url: string;
  post_id: string;
  title: string;
  access: ClonePostEntry["access"];
  media_count: number;
};

/** @description JSON file root storing multiple creator clone models keyed by creator id (legacy file layout). */
export type CloneSiteStoreRoot = {
  sites: Record<string, CloneSiteModel>;
};
