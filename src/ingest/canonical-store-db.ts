import {
  MediaUpstreamStatus,
  PostUpstreamStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import type {
  CampaignRow,
  CanonicalSnapshot,
  CanonicalStore,
  MediaRow,
  MediaVersionRow,
  PostRow,
  PostVersionRow,
  TierRow
} from "./canonical-store.js";

/**
 * `ingest_idempotency` in `canonical.json` is keyed only by SHA-256 hex; the DB row also
 * requires `creator_id`. We use a sentinel for rows restored from a flat snapshot map.
 */
export const RELAY_IDEMPOTENCY_CREATOR_SENTINEL = "_relay_snapshot_";

export function tierStableId(creatorId: string, relayTierId: string): string {
  return `${creatorId}::${relayTierId}`;
}

function emptySnapshot(): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {},
    media: {}
  };
}

function inferCampaignIdForPost(
  creatorId: string,
  post: PostRow,
  snapshot: CanonicalSnapshot
): string {
  const cmap = snapshot.campaigns[creatorId] ?? {};
  const campaignIds = Object.keys(cmap);
  if (campaignIds.length === 1) {
    return campaignIds[0]!;
  }
  const tierMap = snapshot.tiers[creatorId] ?? {};
  const fromTiers = new Set<string>();
  for (const tid of post.current.tier_ids) {
    const tr = tierMap[tid];
    if (tr?.campaign_id) {
      fromTiers.add(tr.campaign_id);
    }
  }
  if (fromTiers.size === 1) {
    return [...fromTiers][0]!;
  }
  if (campaignIds.length > 0) {
    return [...campaignIds].sort()[0]!;
  }
  throw new Error(
    `DbCanonicalStore.save: cannot infer campaign_id for post ${post.post_id} (creator ${creatorId}). ` +
      `Ensure at least one campaign exists for this creator in the snapshot.`
  );
}

function earliestPublishedAt(post: PostRow): Date {
  const times = post.versions.map((v) => Date.parse(v.published_at)).filter(Number.isFinite);
  if (times.length === 0) {
    return new Date();
  }
  return new Date(Math.min(...times));
}

function mapVersionRow(v: PostVersionRow) {
  return {
    versionSeq: v.version_seq,
    upstreamRevision: v.upstream_revision,
    title: v.title,
    description: v.description ?? null,
    publishedAt: new Date(v.published_at),
    tagIds: [...v.tag_ids],
    tierIds: [...v.tier_ids],
    mediaIds: [...v.media_ids],
    ingestedAt: new Date(v.ingested_at)
  };
}

/**
 * Postgres-backed canonical store. `save()` replaces **all** canonical rows (same as overwriting `canonical.json`).
 */
export class DbCanonicalStore implements CanonicalStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async load(): Promise<CanonicalSnapshot> {
    const [
      campaigns,
      tiers,
      posts,
      postVersions,
      mediaRows,
      idemRows
    ] = await Promise.all([
      this.prisma.campaign.findMany(),
      this.prisma.tier.findMany(),
      this.prisma.post.findMany(),
      this.prisma.postVersion.findMany({ orderBy: { versionSeq: "asc" } }),
      this.prisma.mediaAsset.findMany(),
      this.prisma.ingestIdempotencyKey.findMany()
    ]);

    const snapshot = emptySnapshot();

    for (const r of idemRows) {
      snapshot.ingest_idempotency[r.batchKey] = {
        first_seen_at: r.firstSeenAt.toISOString()
      };
    }

    for (const c of campaigns) {
      const byCreator = (snapshot.campaigns[c.creatorId] ??= {});
      const row: CampaignRow = {
        campaign_id: c.id,
        creator_id: c.creatorId,
        name: c.name,
        upstream_updated_at: c.upstreamUpdatedAt.toISOString(),
        version_seq: c.versionSeq
      };
      byCreator[c.id] = row;
    }

    for (const t of tiers) {
      const byCreator = (snapshot.tiers[t.creatorId] ??= {});
      const row: TierRow = {
        tier_id: t.relayTierId,
        creator_id: t.creatorId,
        campaign_id: t.campaignId ?? undefined,
        title: t.title,
        amount_cents: t.amountCents ?? undefined,
        upstream_updated_at: t.upstreamUpdatedAt.toISOString(),
        version_seq: t.versionSeq
      };
      byCreator[t.relayTierId] = row;
    }

    const versionsByPost = new Map<string, PostVersionRow[]>();
    for (const v of postVersions) {
      const pv: PostVersionRow = {
        version_seq: v.versionSeq,
        upstream_revision: v.upstreamRevision,
        title: v.title,
        description: v.description ?? undefined,
        published_at: v.publishedAt.toISOString(),
        tag_ids: [...v.tagIds],
        tier_ids: [...v.tierIds],
        media_ids: [...v.mediaIds],
        ingested_at: v.ingestedAt.toISOString()
      };
      const list = versionsByPost.get(v.postId) ?? [];
      list.push(pv);
      versionsByPost.set(v.postId, list);
    }

    for (const p of posts) {
      const versions = versionsByPost.get(p.id);
      if (!versions || versions.length === 0) {
        continue;
      }
      const sorted = [...versions].sort((a, b) => a.version_seq - b.version_seq);
      const current = sorted[sorted.length - 1]!;
      const postRow: PostRow = {
        post_id: p.id,
        creator_id: p.creatorId,
        current,
        versions: sorted,
        upstream_status: p.upstreamStatus === PostUpstreamStatus.deleted ? "deleted" : "active"
      };
      const byCreator = (snapshot.posts[p.creatorId] ??= {});
      byCreator[p.id] = postRow;
    }

    for (const m of mediaRows) {
      const versions = m.versionsJson as unknown as MediaVersionRow[];
      const current: MediaVersionRow = {
        version_seq: m.currentVersionSeq,
        upstream_revision: m.currentUpstreamRevision,
        mime_type: m.currentMimeType ?? undefined,
        upstream_url: m.currentUpstreamUrl ?? undefined,
        role: m.currentRole ?? undefined,
        ingested_at: m.currentIngestedAt.toISOString()
      };
      const row: MediaRow = {
        media_id: m.id,
        creator_id: m.creatorId,
        post_ids: [...m.postIds],
        upstream_status: m.upstreamStatus === MediaUpstreamStatus.deleted ? "deleted" : "active",
        current,
        versions: Array.isArray(versions) ? versions : []
      };
      const byCreator = (snapshot.media[m.creatorId] ??= {});
      byCreator[m.id] = row;
    }

    return snapshot;
  }

  public async save(snapshot: CanonicalSnapshot): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.postTier.deleteMany();
      await tx.mediaAsset.deleteMany();
      await tx.postVersion.deleteMany();
      await tx.post.deleteMany();
      await tx.tier.deleteMany();
      await tx.campaign.deleteMany();
      await tx.ingestIdempotencyKey.deleteMany();

      for (const [batchKey, meta] of Object.entries(snapshot.ingest_idempotency)) {
        await tx.ingestIdempotencyKey.create({
          data: {
            creatorId: RELAY_IDEMPOTENCY_CREATOR_SENTINEL,
            batchKey,
            firstSeenAt: new Date(meta.first_seen_at)
          }
        });
      }

      for (const [_c, cmap] of Object.entries(snapshot.campaigns)) {
        for (const row of Object.values(cmap) as CampaignRow[]) {
          await tx.campaign.create({
            data: {
              id: row.campaign_id,
              creatorId: row.creator_id,
              name: row.name,
              upstreamUpdatedAt: new Date(row.upstream_updated_at),
              versionSeq: row.version_seq
            }
          });
        }
      }

      for (const [_c, tmap] of Object.entries(snapshot.tiers)) {
        for (const row of Object.values(tmap) as TierRow[]) {
          const id = tierStableId(row.creator_id, row.tier_id);
          await tx.tier.create({
            data: {
              id,
              creatorId: row.creator_id,
              relayTierId: row.tier_id,
              providerTierId: row.tier_id,
              campaignId: row.campaign_id ?? null,
              title: row.title,
              amountCents: row.amount_cents ?? null,
              upstreamUpdatedAt: new Date(row.upstream_updated_at),
              versionSeq: row.version_seq
            }
          });
        }
      }

      for (const [_c, pmap] of Object.entries(snapshot.posts)) {
        for (const post of Object.values(pmap) as PostRow[]) {
          const creatorId = post.creator_id;
          const campaignId = inferCampaignIdForPost(creatorId, post, snapshot);
          const createdAt = earliestPublishedAt(post);

          await tx.post.create({
            data: {
              id: post.post_id,
              campaignId,
              creatorId,
              providerPostId: null,
              upstreamStatus:
                post.upstream_status === "deleted"
                  ? PostUpstreamStatus.deleted
                  : PostUpstreamStatus.active,
              createdAt,
              versions: {
                create: post.versions.map((v) => mapVersionRow(v))
              }
            }
          });

          const tierIds = new Set(post.current.tier_ids);
          for (const tid of tierIds) {
            const tierKey = tierStableId(creatorId, tid);
            await tx.postTier.create({
              data: {
                postId: post.post_id,
                tierId: tierKey
              }
            });
          }
        }
      }

      for (const [_c, mmap] of Object.entries(snapshot.media)) {
        for (const m of Object.values(mmap) as MediaRow[]) {
          const primary =
            m.post_ids[0] ??
            (() => {
              throw new Error(`DbCanonicalStore.save: media ${m.media_id} has empty post_ids`);
            })();
          await tx.mediaAsset.create({
            data: {
              id: m.media_id,
              creatorId: m.creator_id,
              postIds: [...m.post_ids],
              primaryPostId: primary,
              upstreamStatus:
                m.upstream_status === "deleted"
                  ? MediaUpstreamStatus.deleted
                  : MediaUpstreamStatus.active,
              currentVersionSeq: m.current.version_seq,
              currentUpstreamRevision: m.current.upstream_revision,
              currentMimeType: m.current.mime_type ?? null,
              currentUpstreamUrl: m.current.upstream_url ?? null,
              currentRole: m.current.role ?? null,
              currentIngestedAt: new Date(m.current.ingested_at),
              versionsJson: m.versions as unknown as Prisma.InputJsonValue
            }
          });
        }
      }
    });
  }

  public async mutate(
    fn: (snapshot: CanonicalSnapshot) => void | Promise<void>
  ): Promise<void> {
    const snapshot = await this.load();
    await fn(snapshot);
    await this.save(snapshot);
  }
}
