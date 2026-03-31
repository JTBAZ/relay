import type { IngestMediaItem, SyncBatchInput } from "./types.js";

export function validateIngestBatchBody(body: unknown): {
  ok: true;
  batch: SyncBatchInput;
} | {
  ok: false;
  details: Array<{ field: string; issue: string }>;
} {
  if (body === null || typeof body !== "object") {
    return {
      ok: false,
      details: [{ field: "body", issue: "invalid" }]
    };
  }

  const raw = body as Record<string, unknown>;
  if (typeof raw.creator_id !== "string" || raw.creator_id.trim() === "") {
    return {
      ok: false,
      details: [{ field: "creator_id", issue: "missing" }]
    };
  }

  const batch: SyncBatchInput = {
    creator_id: raw.creator_id.trim()
  };

  if (raw.campaigns !== undefined) {
    if (!Array.isArray(raw.campaigns)) {
      return {
        ok: false,
        details: [{ field: "campaigns", issue: "invalid" }]
      };
    }
    batch.campaigns = [];
    for (let i = 0; i < raw.campaigns.length; i++) {
      const c = raw.campaigns[i];
      if (!c || typeof c !== "object") {
        return {
          ok: false,
          details: [{ field: `campaigns[${i}]`, issue: "invalid" }]
        };
      }
      const o = c as Record<string, unknown>;
      const campaignId = o.campaign_id;
      if (typeof campaignId !== "string" || campaignId.trim() === "") {
        return {
          ok: false,
          details: [{ field: `campaigns[${i}].campaign_id`, issue: "missing" }]
        };
      }
      batch.campaigns.push({
        campaign_id: campaignId.trim(),
        name: typeof o.name === "string" ? o.name : "",
        upstream_updated_at:
          typeof o.upstream_updated_at === "string" && o.upstream_updated_at
            ? o.upstream_updated_at
            : new Date().toISOString()
      });
    }
  }

  if (raw.tiers !== undefined) {
    if (!Array.isArray(raw.tiers)) {
      return {
        ok: false,
        details: [{ field: "tiers", issue: "invalid" }]
      };
    }
    batch.tiers = [];
    for (let i = 0; i < raw.tiers.length; i++) {
      const t = raw.tiers[i];
      if (!t || typeof t !== "object") {
        return {
          ok: false,
          details: [{ field: `tiers[${i}]`, issue: "invalid" }]
        };
      }
      const o = t as Record<string, unknown>;
      const tierId = o.tier_id;
      if (typeof tierId !== "string" || tierId.trim() === "") {
        return {
          ok: false,
          details: [{ field: `tiers[${i}].tier_id`, issue: "missing" }]
        };
      }
      batch.tiers.push({
        tier_id: tierId.trim(),
        title: typeof o.title === "string" ? o.title : "",
        campaign_id:
          typeof o.campaign_id === "string" && o.campaign_id
            ? o.campaign_id
            : undefined,
        upstream_updated_at:
          typeof o.upstream_updated_at === "string" && o.upstream_updated_at
            ? o.upstream_updated_at
            : new Date().toISOString()
      });
    }
  }

  if (raw.posts !== undefined) {
    if (!Array.isArray(raw.posts)) {
      return {
        ok: false,
        details: [{ field: "posts", issue: "invalid" }]
      };
    }
    batch.posts = [];
    for (let i = 0; i < raw.posts.length; i++) {
      const p = raw.posts[i];
      if (!p || typeof p !== "object") {
        return {
          ok: false,
          details: [{ field: `posts[${i}]`, issue: "invalid" }]
        };
      }
      const o = p as Record<string, unknown>;
      for (const field of ["post_id", "title", "published_at", "upstream_revision"] as const) {
        if (typeof o[field] !== "string" || String(o[field]).trim() === "") {
          return {
            ok: false,
            details: [{ field: `posts[${i}].${field}`, issue: "missing" }]
          };
        }
      }
      const tagIds = Array.isArray(o.tag_ids)
        ? o.tag_ids.filter((x): x is string => typeof x === "string")
        : [];
      const tierIds = Array.isArray(o.tier_ids)
        ? o.tier_ids.filter((x): x is string => typeof x === "string")
        : [];
      const mediaRaw = Array.isArray(o.media) ? o.media : [];
      const media: IngestMediaItem[] = [];
      for (let j = 0; j < mediaRaw.length; j++) {
        const m = mediaRaw[j];
        if (!m || typeof m !== "object") {
          return {
            ok: false,
            details: [{ field: `posts[${i}].media[${j}]`, issue: "invalid" }]
          };
        }
        const mo = m as Record<string, unknown>;
        if (
          typeof mo.media_id !== "string" ||
          mo.media_id.trim() === "" ||
          typeof mo.upstream_revision !== "string" ||
          mo.upstream_revision.trim() === ""
        ) {
          return {
            ok: false,
            details: [{ field: `posts[${i}].media[${j}]`, issue: "missing" }]
          };
        }
        media.push({
          media_id: mo.media_id.trim(),
          mime_type: typeof mo.mime_type === "string" ? mo.mime_type : undefined,
          upstream_url: typeof mo.upstream_url === "string" ? mo.upstream_url : undefined,
          upstream_revision: mo.upstream_revision.trim()
        });
      }
      batch.posts.push({
        post_id: String(o.post_id).trim(),
        title: String(o.title).trim(),
        published_at: String(o.published_at).trim(),
        tag_ids: tagIds,
        tier_ids: tierIds,
        upstream_revision: String(o.upstream_revision).trim(),
        media
      });
    }
  }

  if (raw.tombstones !== undefined) {
    if (!Array.isArray(raw.tombstones)) {
      return {
        ok: false,
        details: [{ field: "tombstones", issue: "invalid" }]
      };
    }
    batch.tombstones = [];
    for (let i = 0; i < raw.tombstones.length; i++) {
      const t = raw.tombstones[i];
      if (!t || typeof t !== "object") {
        return {
          ok: false,
          details: [{ field: `tombstones[${i}]`, issue: "invalid" }]
        };
      }
      const o = t as Record<string, unknown>;
      if (o.entity_type !== "post" && o.entity_type !== "media") {
        return {
          ok: false,
          details: [{ field: `tombstones[${i}].entity_type`, issue: "invalid" }]
        };
      }
      if (typeof o.id !== "string" || !o.id.trim()) {
        return {
          ok: false,
          details: [{ field: `tombstones[${i}].id`, issue: "missing" }]
        };
      }
      batch.tombstones.push({
        entity_type: o.entity_type,
        id: o.id.trim(),
        deleted_at:
          typeof o.deleted_at === "string" && o.deleted_at
            ? o.deleted_at
            : new Date().toISOString()
      });
    }
  }

  return { ok: true, batch };
}
