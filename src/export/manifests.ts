import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { CreatorExportIndex } from "./types.js";

export type MediaManifestJson = {
  creator_id: string;
  generated_at: string;
  items: Array<{
    media_id: string;
    sha256: string;
    byte_length: number;
    mime_type?: string;
    upstream_revision: string;
    post_ids: string[];
    blob_relative_path: string;
    exported_at: string;
  }>;
};

export type PostMapJson = {
  creator_id: string;
  generated_at: string;
  posts: Record<
    string,
    {
      title: string;
      published_at: string;
      tag_ids: string[];
      tier_ids: string[];
      media_ids: string[];
      upstream_status: string;
      current_upstream_revision: string;
    }
  >;
};

export type TierMapJson = {
  creator_id: string;
  generated_at: string;
  tiers: Record<
    string,
    {
      title: string;
      campaign_id?: string;
      upstream_updated_at: string;
    }
  >;
};

export function buildMediaManifest(
  creatorId: string,
  snapshot: CanonicalSnapshot,
  exportIndex: CreatorExportIndex
): MediaManifestJson {
  const mediaMap = snapshot.media[creatorId] ?? {};
  const items: MediaManifestJson["items"] = [];
  for (const [mediaId, row] of Object.entries(mediaMap)) {
    const exp = exportIndex.media[mediaId];
    if (!exp) {
      continue;
    }
    items.push({
      media_id: mediaId,
      sha256: exp.sha256,
      byte_length: exp.byte_length,
      mime_type: exp.mime_type ?? row.current.mime_type,
      upstream_revision: exp.upstream_revision,
      post_ids: [...row.post_ids],
      blob_relative_path: exp.relative_blob_path,
      exported_at: exp.exported_at
    });
  }
  return {
    creator_id: creatorId,
    generated_at: new Date().toISOString(),
    items
  };
}

export function buildPostMap(creatorId: string, snapshot: CanonicalSnapshot): PostMapJson {
  const posts = snapshot.posts[creatorId] ?? {};
  const out: PostMapJson["posts"] = {};
  for (const [postId, row] of Object.entries(posts)) {
    out[postId] = {
      title: row.current.title,
      published_at: row.current.published_at,
      tag_ids: [...row.current.tag_ids],
      tier_ids: [...row.current.tier_ids],
      media_ids: [...row.current.media_ids],
      upstream_status: row.upstream_status,
      current_upstream_revision: row.current.upstream_revision
    };
  }
  return {
    creator_id: creatorId,
    generated_at: new Date().toISOString(),
    posts: out
  };
}

export function buildTierMap(creatorId: string, snapshot: CanonicalSnapshot): TierMapJson {
  const tiers = snapshot.tiers[creatorId] ?? {};
  const out: TierMapJson["tiers"] = {};
  for (const [tierId, row] of Object.entries(tiers)) {
    out[tierId] = {
      title: row.title,
      campaign_id: row.campaign_id,
      upstream_updated_at: row.upstream_updated_at
    };
  }
  return {
    creator_id: creatorId,
    generated_at: new Date().toISOString(),
    tiers: out
  };
}
