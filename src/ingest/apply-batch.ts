import type { InMemoryEventBus } from "../events/event-bus.js";
import type { MediaRow, PostRow, CanonicalSnapshot } from "./canonical-store.js";
import { ingestIdempotencyKey } from "./idempotency.js";
import type { ApplyBatchResult, SyncBatchInput } from "./types.js";

function ensureNested<T extends Record<string, Record<string, unknown>>>(
  root: T,
  key: string
): Record<string, unknown> {
  if (!root[key as keyof T]) {
    (root as Record<string, Record<string, unknown>>)[key] = {};
  }
  return root[key as keyof T] as Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function applySyncBatchToSnapshot(
  snapshot: CanonicalSnapshot,
  batch: SyncBatchInput,
  jobId: string,
  traceId: string,
  eventBus: InMemoryEventBus
): ApplyBatchResult {
  const result: ApplyBatchResult = {
    job_id: jobId,
    idempotent_skips: 0,
    campaigns_upserted: 0,
    tiers_upserted: 0,
    posts_written: 0,
    media_upserted: 0,
    tombstones_applied: 0,
    events_emitted: 0
  };

  const { creator_id: creatorId } = batch;

  for (const c of batch.campaigns ?? []) {
    const cKey = ingestIdempotencyKey([
      "ingest_campaign",
      creatorId,
      c.campaign_id,
      c.upstream_updated_at
    ]);
    if (snapshot.ingest_idempotency[cKey]) {
      result.idempotent_skips += 1;
      continue;
    }
    snapshot.ingest_idempotency[cKey] = { first_seen_at: nowIso() };
    const campaigns = ensureNested(snapshot.campaigns, creatorId);
    const existing = campaigns[c.campaign_id] as import("./canonical-store.js").CampaignRow | undefined;
    const nextSeq = existing ? existing.version_seq + 1 : 1;
    campaigns[c.campaign_id] = {
      campaign_id: c.campaign_id,
      creator_id: creatorId,
      name: c.name,
      upstream_updated_at: c.upstream_updated_at,
      version_seq: nextSeq
    };
    result.campaigns_upserted += 1;
  }

  for (const t of batch.tiers ?? []) {
    const tKey = ingestIdempotencyKey([
      "ingest_tier",
      creatorId,
      t.tier_id,
      t.upstream_updated_at
    ]);
    if (snapshot.ingest_idempotency[tKey]) {
      result.idempotent_skips += 1;
      continue;
    }
    snapshot.ingest_idempotency[tKey] = { first_seen_at: nowIso() };
    const tiers = ensureNested(snapshot.tiers, creatorId);
    const existing = tiers[t.tier_id] as import("./canonical-store.js").TierRow | undefined;
    const nextSeq = existing ? existing.version_seq + 1 : 1;
    const nextAmount =
      typeof t.amount_cents === "number" && Number.isFinite(t.amount_cents)
        ? t.amount_cents
        : existing && typeof existing.amount_cents === "number"
          ? existing.amount_cents
          : undefined;
    tiers[t.tier_id] = {
      tier_id: t.tier_id,
      creator_id: creatorId,
      campaign_id: t.campaign_id,
      title: t.title,
      ...(nextAmount !== undefined ? { amount_cents: nextAmount } : {}),
      upstream_updated_at: t.upstream_updated_at,
      version_seq: nextSeq
    };
    result.tiers_upserted += 1;
  }

  for (const p of batch.posts ?? []) {
    const idemKey = ingestIdempotencyKey([
      "ingest_post",
      creatorId,
      p.post_id,
      p.upstream_revision
    ]);
    if (snapshot.ingest_idempotency[idemKey]) {
      result.idempotent_skips += 1;
      continue;
    }
    snapshot.ingest_idempotency[idemKey] = { first_seen_at: nowIso() };

    const posts = ensureNested(snapshot.posts, creatorId);
    const existingPost = posts[p.post_id] as PostRow | undefined;
    const nextVersionSeq = existingPost
      ? Math.max(...existingPost.versions.map((v) => v.version_seq)) + 1
      : 1;

    const mediaIds: string[] = [];
    for (const m of p.media) {
      mediaIds.push(m.media_id);
      upsertMediaForPost(snapshot, creatorId, p.post_id, m, result);
    }

    const versionRow = {
      version_seq: nextVersionSeq,
      upstream_revision: p.upstream_revision,
      title: p.title,
      description: p.description,
      published_at: p.published_at,
      tag_ids: [...p.tag_ids],
      tier_ids: [...p.tier_ids],
      media_ids: [...mediaIds],
      ingested_at: nowIso()
    };

    const postRow: PostRow = {
      post_id: p.post_id,
      creator_id: creatorId,
      current: versionRow,
      versions: existingPost ? [...existingPost.versions, versionRow] : [versionRow],
      upstream_status: "active"
    };
    posts[p.post_id] = postRow;
    result.posts_written += 1;

    eventBus.publish(
      "post_published",
      creatorId,
      traceId,
      {
        primary_id: p.post_id,
        post_id: p.post_id,
        creator_id: creatorId,
        published_at: p.published_at,
        title: p.title,
        tag_ids: [...p.tag_ids],
        tier_ids: [...p.tier_ids],
        media_ids: [...mediaIds]
      },
      { producer: "ingestion-service" }
    );
    result.events_emitted += 1;
  }

  for (const tomb of batch.tombstones ?? []) {
    if (tomb.entity_type === "post") {
      const posts = ensureNested(snapshot.posts, creatorId);
      const row = posts[tomb.id] as PostRow | undefined;
      if (row) {
        row.upstream_status = "deleted";
      }
    } else {
      const mediaMap = ensureNested(snapshot.media, creatorId);
      const row = mediaMap[tomb.id] as MediaRow | undefined;
      if (row) {
        row.upstream_status = "deleted";
      }
    }
    result.tombstones_applied += 1;
  }

  return result;
}

function upsertMediaForPost(
  snapshot: CanonicalSnapshot,
  creatorId: string,
  postId: string,
  m: { media_id: string; mime_type?: string; upstream_url?: string; upstream_revision: string; role?: string },
  result: ApplyBatchResult
): void {
  const mediaMap = ensureNested(snapshot.media, creatorId);
  const existing = mediaMap[m.media_id] as MediaRow | undefined;
  const mediaIdemKey = ingestIdempotencyKey([
    "ingest_media_rev",
    creatorId,
    m.media_id,
    m.upstream_revision
  ]);

  if (!existing) {
    const mv = {
      version_seq: 1,
      upstream_revision: m.upstream_revision,
      mime_type: m.mime_type,
      upstream_url: m.upstream_url,
      role: m.role,
      ingested_at: nowIso()
    };
    mediaMap[m.media_id] = {
      media_id: m.media_id,
      creator_id: creatorId,
      post_ids: uniquePush([], postId),
      upstream_status: "active",
      current: mv,
      versions: [mv]
    };
    snapshot.ingest_idempotency[mediaIdemKey] = { first_seen_at: nowIso() };
    result.media_upserted += 1;
    return;
  }

  existing.post_ids = uniquePush(existing.post_ids, postId);

  if (m.upstream_url && m.upstream_url !== existing.current.upstream_url) {
    existing.current.upstream_url = m.upstream_url;
  }

  if (existing.current.upstream_revision === m.upstream_revision) {
    return;
  }

  if (snapshot.ingest_idempotency[mediaIdemKey]) {
    return;
  }
  snapshot.ingest_idempotency[mediaIdemKey] = { first_seen_at: nowIso() };

  const nextSeq =
    existing.versions.length > 0
      ? Math.max(...existing.versions.map((v) => v.version_seq)) + 1
      : 1;
  const mv = {
    version_seq: nextSeq,
    upstream_revision: m.upstream_revision,
    mime_type: m.mime_type ?? existing.current.mime_type,
    upstream_url: m.upstream_url ?? existing.current.upstream_url,
    role: m.role ?? existing.current.role,
    ingested_at: nowIso()
  };
  existing.current = mv;
  existing.versions.push(mv);
  result.media_upserted += 1;
}

function uniquePush(arr: string[], id: string): string[] {
  if (arr.includes(id)) {
    return arr;
  }
  return [...arr, id];
}
