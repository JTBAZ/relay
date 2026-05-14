/**
 * Request body validation for SubscribeStar Explorer / manual batch wire → `buildSubscribeStarSyncBatch`.
 */

import type {
  SubscribeStarIngestBatchWire,
  SubscribeStarIngestPostWire,
  SubscribeStarIngestTierWire
} from "./map-subscribestar-to-ingest.js";

export function validateSubscribeStarIngestWire(body: unknown): {
  ok: true;
  wire: SubscribeStarIngestBatchWire;
} | {
  ok: false;
  details: Array<{ field: string; issue: string }>;
} {
  if (body === null || typeof body !== "object") {
    return { ok: false, details: [{ field: "body", issue: "invalid" }] };
  }
  const raw = body as Record<string, unknown>;
  const details: Array<{ field: string; issue: string }> = [];

  if (typeof raw.creator_id !== "string" || !raw.creator_id.trim()) {
    details.push({ field: "creator_id", issue: "missing" });
  }
  if (!raw.campaign || typeof raw.campaign !== "object") {
    details.push({ field: "campaign", issue: "invalid" });
  } else {
    const c = raw.campaign as Record<string, unknown>;
    if (typeof c.external_campaign_id !== "string" || !String(c.external_campaign_id).trim()) {
      details.push({ field: "campaign.external_campaign_id", issue: "missing" });
    }
    if (typeof c.name !== "string") {
      details.push({ field: "campaign.name", issue: "missing" });
    }
  }
  if (!Array.isArray(raw.posts)) {
    details.push({ field: "posts", issue: "invalid" });
  } else if (raw.posts.length === 0) {
    details.push({ field: "posts", issue: "empty" });
  } else {
    raw.posts.forEach((p, i) => {
      if (!p || typeof p !== "object") {
        details.push({ field: `posts[${i}]`, issue: "invalid" });
        return;
      }
      const o = p as Record<string, unknown>;
      for (const f of [
        "external_post_id",
        "title",
        "published_at",
        "upstream_revision"
      ] as const) {
        if (typeof o[f] !== "string" || !String(o[f]).trim()) {
          details.push({ field: `posts[${i}].${f}`, issue: "missing" });
        }
      }
      if (o.media !== undefined && !Array.isArray(o.media)) {
        details.push({ field: `posts[${i}].media`, issue: "invalid" });
      } else if (Array.isArray(o.media)) {
        o.media.forEach((m, j) => {
          if (!m || typeof m !== "object") {
            details.push({ field: `posts[${i}].media[${j}]`, issue: "invalid" });
            return;
          }
          const mo = m as Record<string, unknown>;
          if (typeof mo.external_media_id !== "string" || !String(mo.external_media_id).trim()) {
            details.push({
              field: `posts[${i}].media[${j}].external_media_id`,
              issue: "missing"
            });
          }
          if (typeof mo.upstream_revision !== "string" || !String(mo.upstream_revision).trim()) {
            details.push({
              field: `posts[${i}].media[${j}].upstream_revision`,
              issue: "missing"
            });
          }
        });
      }
    });
  }

  if (raw.tiers !== undefined) {
    if (!Array.isArray(raw.tiers)) {
      details.push({ field: "tiers", issue: "invalid" });
    } else {
      raw.tiers.forEach((t, i) => {
        if (!t || typeof t !== "object") {
          details.push({ field: `tiers[${i}]`, issue: "invalid" });
          return;
        }
        const o = t as Record<string, unknown>;
        if (typeof o.external_tier_id !== "string" || !String(o.external_tier_id).trim()) {
          details.push({ field: `tiers[${i}].external_tier_id`, issue: "missing" });
        }
        if (typeof o.title !== "string") {
          details.push({ field: `tiers[${i}].title`, issue: "missing" });
        }
      });
    }
  }

  if (details.length > 0) {
    return { ok: false, details };
  }

  const rc = raw.campaign as Record<string, unknown>;
  const tiersIn = raw.tiers;
  const tiers: SubscribeStarIngestTierWire[] | undefined =
    Array.isArray(tiersIn) && tiersIn.length > 0
      ? tiersIn.map((t) => {
          const o = t as Record<string, unknown>;
          const u =
            typeof o.upstream_updated_at === "string" ? o.upstream_updated_at.trim() : "";
          const amount = o.amount_cents;
          const row: SubscribeStarIngestTierWire = {
            external_tier_id: String(o.external_tier_id).trim(),
            title: typeof o.title === "string" ? o.title : ""
          };
          return {
            ...row,
            ...(u ? { upstream_updated_at: u } : {}),
            ...(typeof amount === "number" && Number.isFinite(amount)
              ? { amount_cents: amount }
              : {})
          };
        })
      : undefined;

  const postsWire: SubscribeStarIngestPostWire[] = (raw.posts as unknown[]).map((p) => {
    const o = p as Record<string, unknown>;
    const mediaRaw = Array.isArray(o.media) ? o.media : [];
    const media = mediaRaw.map((m) => {
      const mo = m as Record<string, unknown>;
      return {
        external_media_id: String(mo.external_media_id).trim(),
        upstream_revision: String(mo.upstream_revision).trim(),
        ...(typeof mo.upstream_url === "string" && mo.upstream_url.trim()
          ? { upstream_url: mo.upstream_url.trim() }
          : {}),
        ...(typeof mo.mime_type === "string" && mo.mime_type.trim()
          ? { mime_type: mo.mime_type.trim() }
          : {}),
        ...(typeof mo.role === "string" && mo.role.trim() ? { role: mo.role.trim() } : {})
      };
    });
    const tagIds = Array.isArray(o.tag_ids)
      ? o.tag_ids.filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
      : [];
    const tierRefs = Array.isArray(o.tier_external_ids)
      ? o.tier_external_ids.filter((x): x is string => typeof x === "string")
      : [];
    return {
      external_post_id: String(o.external_post_id).trim(),
      title: String(o.title).trim(),
      description: typeof o.description === "string" ? o.description : undefined,
      published_at: String(o.published_at).trim(),
      upstream_revision: String(o.upstream_revision).trim(),
      ...(tierRefs.length ? { tier_external_ids: tierRefs } : {}),
      ...(tagIds.length ? { tag_ids: tagIds } : {}),
      ...(media.length ? { media } : {})
    };
  });

  const nowIsoRaw = raw.now_iso;
  const wire: SubscribeStarIngestBatchWire = {
    creator_id: String(raw.creator_id).trim(),
    campaign: {
      external_campaign_id: String(rc.external_campaign_id).trim(),
      name: typeof rc.name === "string" ? rc.name : "",
      ...(typeof rc.upstream_updated_at === "string" && rc.upstream_updated_at.trim()
        ? { upstream_updated_at: rc.upstream_updated_at.trim() }
        : {})
    },
    ...(tiers?.length ? { tiers } : {}),
    posts: postsWire,
    ...(typeof nowIsoRaw === "string" && nowIsoRaw.trim() ? { now_iso: nowIsoRaw.trim() } : {})
  };
  return { ok: true, wire };
}
