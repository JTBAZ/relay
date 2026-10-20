/**
 * @fileoverview Prisma persistence for canonical ingest snapshots (posts, media, tiers, campaigns).
 * @description `saveForCreator` refreshes imported posts in place while preserving Relay-native posts (T-2.1).
 * @see ./canonical-store.js
 * @see src/jsdoc-core-entities.ts
 */

import {
  MediaIngestOrigin,
  MediaProcessingStatus,
  MediaUpstreamStatus,
  PostSource,
  PostUpstreamStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { ensureDefaultCreativeWorkForPost } from "../analytics/creative-work-service.js";
import { ensurePatreonPlatformInstanceForIngestedPost } from "../analytics/platform-instance-service.js";
import { IngestOwnershipConflict } from "./ownership-conflict.js";
import type {
  CampaignRow,
  CanonicalSnapshot,
  CanonicalStore,
  MediaProcessingState,
  MediaRow,
  MediaVersionRow,
  PostRow,
  PostVersionRow,
  TierRow
} from "./canonical-store.js";

/** Snapshot rows ingest synchronizes (`Post.source=PATREON` or SUBSCRIBESTAR); Relay-native posts are preserved (T-2.1). */
function isMirroredIngestSnapshotPost(p: PostRow): boolean {
  return p.source !== "RELAY";
}

function snapshotMirrorDbSource(p: PostRow): PostSource {
  return p.source === "SUBSCRIBESTAR" ? PostSource.SUBSCRIBESTAR : PostSource.PATREON;
}

/**
 * `ingest_idempotency` stores legacy digests, v2 tuple keys and namespaced deletion keys; the DB row also
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

function mapMediaStateRow(media: MediaRow) {
  return {
    postIds: [...media.post_ids],
    upstreamStatus: media.upstream_status === "deleted" ? MediaUpstreamStatus.deleted : MediaUpstreamStatus.active,
    currentVersionSeq: media.current.version_seq,
    currentUpstreamRevision: media.current.upstream_revision,
    currentMimeType: media.current.mime_type ?? null,
    currentUpstreamUrl: media.current.upstream_url ?? null,
    currentRole: media.current.role ?? null,
    currentStorageKey: media.current.storage_key ?? null,
    currentIngestedAt: new Date(media.current.ingested_at),
    versionsJson: media.versions as unknown as Prisma.InputJsonValue
  };
}

/**
 * Ensures at most one row per `version_seq` before nested `PostVersion` creates.
 * Last occurrence wins when duplicates exist (defensive; DB @@unique([postId, versionSeq]) otherwise fails).
 */
export function deduplicatePostVersionsForSave(versions: PostVersionRow[]): PostVersionRow[] {
  const bySeq = new Map<number, PostVersionRow>();
  for (const v of versions) {
    bySeq.set(v.version_seq, v);
  }
  return [...bySeq.values()].sort((a, b) => a.version_seq - b.version_seq);
}

/** Fingerprint of Patreon `Post` version history for T-2.2 (skip re-write on unchanged re-ingest). */
function versionListFingerprint(versions: { versionSeq: number; upstreamRevision: string }[]): string {
  return versions.map((v) => `${v.versionSeq}:${v.upstreamRevision}`).join("\u001f");
}

function patreonVersionFingerprintFromSnapshot(versions: PostVersionRow[]): string {
  return versionListFingerprint(
    deduplicatePostVersionsForSave(versions).map((v) => ({
      versionSeq: v.version_seq,
      upstreamRevision: v.upstream_revision
    }))
  );
}

function snapshotToUpstreamStatus(post: PostRow): PostUpstreamStatus {
  return post.upstream_status === "deleted" ? PostUpstreamStatus.deleted : PostUpstreamStatus.active;
}

/**
 * In a multi-tenant Postgres canonical store the Patreon campaign id (e.g. `patreon_campaign_15782831`)
 * and post id (e.g. `patreon_post_12345`) are globally unique PKs shared across all creator entries.
 * If two creator entries in the snapshot claim the same campaign/post id (e.g. a legacy `dev_creator`
 * entry alongside a real creator), `save()` deduplicates by preferring the entry with the highest
 * `version_seq` and logs a warning so the collision is visible in server output.
 */

/** Resolve winner when two creators claim the same global id. Higher version_seq wins. */
function pickWinner<T extends { version_seq: number; creator_id: string }>(
  existing: T,
  challenger: T
): T {
  if (challenger.version_seq > existing.version_seq) return challenger;
  if (challenger.version_seq === existing.version_seq && existing.creator_id === "dev_creator") {
    return challenger;
  }
  return existing;
}

/**
 * @description Postgres implementation: `saveForCreator()` synchronizes mirrored ingest posts (`Post.source=PATREON`
 * or `SUBSCRIBESTAR`) in separate persistence lanes so Patreon ↔ SubscribeStar do not wipe one another.
 * Rows with `Post.source=RELAY` remain intact (T-2.1). Global `save()` delegates per-creator for backward compat.
 * @see ./canonical-store.js
 */
export class DbCanonicalStore implements CanonicalStore {
  public constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // Global load — gallery / admin reads all creators
  // ---------------------------------------------------------------------------
  public async load(): Promise<CanonicalSnapshot> {
    return this.loadImpl();
  }

  // ---------------------------------------------------------------------------
  // Creator-scoped load — only rows belonging to `creatorId`
  // ---------------------------------------------------------------------------
  public async loadForCreator(creatorId: string): Promise<CanonicalSnapshot> {
    return this.loadImpl(creatorId);
  }

  private async loadImpl(creatorId?: string, db: Prisma.TransactionClient = this.prisma): Promise<CanonicalSnapshot> {
    const where = creatorId ? { creatorId } : undefined;
    const [
      campaigns,
      tiers,
      posts,
      postVersions,
      mediaRows,
      idemRows
    ] = await Promise.all([
      db.campaign.findMany({ where }),
      db.tier.findMany({ where }),
      db.post.findMany({ where }),
      db.postVersion.findMany({
        where: where
          ? { post: { creatorId } }
          : undefined,
        orderBy: { versionSeq: "asc" }
      }),
      db.mediaAsset.findMany({ where }),
      db.ingestIdempotencyKey.findMany({
        where: creatorId ? { creatorId } : undefined
      })
    ]);

    const snapshot = emptySnapshot();
    if (campaigns.length || tiers.length) snapshot.legacy_timestamps_normalized = true;

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
      if (!v.publishedAt) continue;
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
        is_public: p.isPublic,
        current,
        versions: sorted,
        upstream_status: p.upstreamStatus === PostUpstreamStatus.deleted ? "deleted" : "active",
        source:
          p.source === PostSource.RELAY
            ? "RELAY"
            : p.source === PostSource.SUBSCRIBESTAR
              ? "SUBSCRIBESTAR"
              : "PATREON"
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
        storage_key: m.currentStorageKey ?? undefined,
        role: m.currentRole ?? undefined,
        ingested_at: m.currentIngestedAt.toISOString()
      };
      const row: MediaRow = {
        media_id: m.id,
        creator_id: m.creatorId,
        post_ids: [...m.postIds],
        upstream_status: m.upstreamStatus === MediaUpstreamStatus.deleted ? "deleted" : "active",
        current,
        versions: Array.isArray(versions) ? versions : [],
        processing_status: m.processingStatus as MediaProcessingState
      };
      const byCreator = (snapshot.media[m.creatorId] ??= {});
      byCreator[m.id] = row;
    }

    return snapshot;
  }

  // ---------------------------------------------------------------------------
  // Global save — delegates to per-creator saves for each creator in snapshot.
  // Preserved for backward compat (gallery overrides, file-store migration).
  // ---------------------------------------------------------------------------
  public async save(snapshot: CanonicalSnapshot): Promise<void> {
    const creatorIds = new Set<string>();
    for (const cid of Object.keys(snapshot.campaigns)) creatorIds.add(cid);
    for (const cid of Object.keys(snapshot.tiers)) creatorIds.add(cid);
    for (const cid of Object.keys(snapshot.posts)) creatorIds.add(cid);
    for (const cid of Object.keys(snapshot.media)) creatorIds.add(cid);
    for (const cid of creatorIds) {
      await this.saveForCreator(cid, snapshot);
    }
  }

  // ---------------------------------------------------------------------------
  // Creator-scoped save — only touches rows for `creatorId`
  //
  // Relay presentation (`post_presentations`) is NEVER written from ingest payload.
  // Existing imported posts are updated in place so their creator-owned relationships survive.
  // ---------------------------------------------------------------------------
  public async saveForCreator(creatorId: string, snapshot: CanonicalSnapshot): Promise<void> {
    try {
      await this.prisma.$transaction(
        (tx) => this.saveForCreatorInTransaction(creatorId, snapshot, tx),
        { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
      );
    } catch (error) {
      await this.checkOwnershipAfterUniqueConflict(error, creatorId, snapshot);
      throw error;
    }
  }

  private async assertNoForeignOwners(creatorId: string, snapshot: CanonicalSnapshot, db: Prisma.TransactionClient): Promise<void> {
    const campaigns = Object.values(snapshot.campaigns[creatorId] ?? {});
    const tiers = Object.values(snapshot.tiers[creatorId] ?? {});
    const posts = Object.values(snapshot.posts[creatorId] ?? {});
    const media = Object.values(snapshot.media[creatorId] ?? {});
    const groups = [
      { kind: "campaign", rows: campaigns.map((r) => ({ id: r.campaign_id, owner: r.creator_id })) },
      { kind: "tier", rows: tiers.map((r) => ({ id: tierStableId(creatorId, r.tier_id), owner: r.creator_id })) },
      { kind: "post", rows: posts.map((r) => ({ id: r.post_id, owner: r.creator_id })) },
      { kind: "media", rows: media.map((r) => ({ id: r.media_id, owner: r.creator_id })) }
    ] as const;
    for (const group of groups) {
      for (const row of group.rows) {
        if (row.owner !== creatorId) {
          throw new IngestOwnershipConflict({ entity_type: group.kind, entity_id: row.id, owner_creator_id: row.owner });
        }
      }
    }
    const ids = groups.map((group) => new Set(group.rows.map((r) => r.id)));
    for (const tier of tiers) if (tier.campaign_id) ids[0]!.add(tier.campaign_id);
    for (const post of posts) {
      const version = deduplicatePostVersionsForSave(post.versions).at(-1) ?? post.current;
      for (const tierId of version.tier_ids) ids[1]!.add(tierStableId(creatorId, tierId));
    }
    for (const asset of media) for (const postId of asset.post_ids) ids[2]!.add(postId);
    const where = (index: number) => ({ id: { in: [...ids[index]!] }, creatorId: { not: creatorId } });
    const select = { id: true, creatorId: true } as const;
    const owners = await Promise.all([
      ids[0]!.size ? db.campaign.findMany({ where: where(0), select }) : [],
      ids[1]!.size ? db.tier.findMany({ where: where(1), select }) : [],
      ids[2]!.size ? db.post.findMany({ where: where(2), select }) : [],
      ids[3]!.size ? db.mediaAsset.findMany({ where: where(3), select }) : []
    ]);
    for (let index = 0; index < owners.length; index++) {
      const owner = owners[index]!.find((row) => row.creatorId !== creatorId);
      if (owner) throw new IngestOwnershipConflict({ entity_type: groups[index]!.kind, entity_id: owner.id, owner_creator_id: owner.creatorId });
    }
  }

  private async checkOwnershipAfterUniqueConflict(error: unknown, creatorId: string, snapshot: CanonicalSnapshot): Promise<void> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // A different creator can claim a previously unused ID after our preflight.
      await this.assertNoForeignOwners(creatorId, snapshot, this.prisma);
    }
  }

  private async saveForCreatorInTransaction(
    creatorId: string,
    snapshot: CanonicalSnapshot,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const campaignMap = snapshot.campaigns[creatorId] ?? {};
    const postMap = snapshot.posts[creatorId] ?? {};
    const mediaMap = snapshot.media[creatorId] ?? {};
    const tierMap = snapshot.tiers[creatorId] ?? {};
    const mirrorPosts = (Object.values(postMap) as PostRow[]).filter(isMirroredIngestSnapshotPost);
    const postEntriesPatreon = mirrorPosts.filter(
      (p) => snapshotMirrorDbSource(p) === PostSource.PATREON
    );
    const postEntriesSubscribestar = mirrorPosts.filter(
      (p) => snapshotMirrorDbSource(p) === PostSource.SUBSCRIBESTAR
    );
    const snapTierIds = new Set(
      (Object.values(tierMap) as TierRow[]).map((r) => tierStableId(r.creator_id, r.tier_id))
    );
    const snapCampaignIds = new Set(Object.keys(campaignMap));
    await this.assertNoForeignOwners(creatorId, snapshot, tx);

    async function mirrorLane(
      postSource: PostSource,
      ingestOrigin: MediaIngestOrigin,
      postEntries: PostRow[]
    ) {
      const existingMirror = await tx.post.findMany({
        where: { creatorId, source: postSource },
        include: { versions: { orderBy: { versionSeq: "asc" } } }
      });
      const existingById = new Map(existingMirror.map((p) => [p.id, p]));
      const preservePostIds = new Set<string>();
      for (const post of postEntries) {
        const dbP = existingById.get(post.post_id);
        if (!dbP) continue;
        if (snapshotToUpstreamStatus(post) !== dbP.upstreamStatus) continue;
        if (inferCampaignIdForPost(creatorId, post, snapshot) !== dbP.campaignId) continue;
        const wantFp = patreonVersionFingerprintFromSnapshot(post.versions);
        const haveFp = versionListFingerprint(
          (dbP.versions ?? []).map((v) => ({ versionSeq: v.versionSeq, upstreamRevision: v.upstreamRevision }))
        );
        if (wantFp === haveFp) {
          preservePostIds.add(post.post_id);
        }
      }
      const stompPostIds: string[] = existingMirror.map((p) => p.id).filter((id) => !preservePostIds.has(id));
      const incomingPostIds = new Set(postEntries.map((p) => p.post_id));
      const removedPostIds = stompPostIds.filter((id) => !incomingPostIds.has(id));
      if (stompPostIds.length > 0) {
        await tx.postTier.deleteMany({ where: { postId: { in: stompPostIds } } });
        await tx.mediaAsset.deleteMany({
          where: {
            primaryPostId: { in: stompPostIds },
            ingestOrigin
          }
        });
        await tx.postVersion.deleteMany({ where: { postId: { in: stompPostIds } } });
      }
      if (removedPostIds.length > 0) {
        await tx.post.deleteMany({ where: { id: { in: removedPostIds } } });
      }
      return { preservePostIds, existingPostIds: new Set(existingById.keys()) };
    }

    const lanePatreon = await mirrorLane(
      PostSource.PATREON,
      MediaIngestOrigin.PATREON,
      postEntriesPatreon
    );
    const laneSubscribestar = await mirrorLane(
      PostSource.SUBSCRIBESTAR,
      MediaIngestOrigin.SUBSCRIBESTAR,
      postEntriesSubscribestar
    );
    const preservePostIdsPat = lanePatreon.preservePostIds;
    const preservePostIdsSs = laneSubscribestar.preservePostIds;
    await tx.ingestIdempotencyKey.deleteMany({ where: { creatorId } });

    // --- Idempotency + upsert campaigns/tiers, then synchronize changed imported posts + media. ---
    const idemEntries = Object.entries(snapshot.ingest_idempotency);
    if (idemEntries.length > 0) {
      await tx.ingestIdempotencyKey.createMany({
        skipDuplicates: true,
        data: idemEntries.map(([batchKey, meta]) => ({
          creatorId,
          batchKey,
          firstSeenAt: new Date(meta.first_seen_at)
        }))
      });
    }

    const campaignRows = Object.values(campaignMap) as CampaignRow[];
    for (const row of campaignRows) {
      const data = { name: row.name, upstreamUpdatedAt: new Date(row.upstream_updated_at), versionSeq: row.version_seq };
      const updated = await tx.campaign.updateMany({
        where: { id: row.campaign_id, creatorId },
        data
      });
      if (updated.count === 0) {
        await tx.campaign.create({ data: { ...data, id: row.campaign_id, creatorId } });
      }
    }

    const tierRows = Object.values(tierMap) as TierRow[];
    for (const row of tierRows) {
      const id = tierStableId(row.creator_id, row.tier_id);
      const data = {
        title: row.title, amountCents: row.amount_cents ?? null, campaignId: row.campaign_id ?? null,
        upstreamUpdatedAt: new Date(row.upstream_updated_at), versionSeq: row.version_seq
      };
      const updated = await tx.tier.updateMany({
        where: { id, creatorId },
        data
      });
      if (updated.count === 0) {
        await tx.tier.create({ data: { ...data, id, creatorId, relayTierId: row.tier_id, providerTierId: row.tier_id } });
      }
    }

    const mirrorLanes: Array<{
      entries: PostRow[];
      preserve: Set<string>;
      existing: Set<string>;
      source: PostSource;
    }> = [
      { entries: postEntriesPatreon, preserve: preservePostIdsPat, existing: lanePatreon.existingPostIds, source: PostSource.PATREON },
      {
        entries: postEntriesSubscribestar,
        preserve: preservePostIdsSs,
        existing: laneSubscribestar.existingPostIds,
        source: PostSource.SUBSCRIBESTAR
      }
    ];

    const postIdsToMaterialize = new Set<string>();
    const postTierRows: Prisma.PostTierCreateManyInput[] = [];
    for (const lane of mirrorLanes) {
      for (const post of lane.entries) {
        if (lane.preserve.has(post.post_id)) {
          continue;
        }
        postIdsToMaterialize.add(post.post_id);
        const campaignId = inferCampaignIdForPost(creatorId, post, snapshot);
        const versionsForDb = deduplicatePostVersionsForSave(post.versions);
        if (versionsForDb.length < post.versions.length) {
          // eslint-disable-next-line no-console -- ops visibility
          console.warn(
            `[canonical-store-db] post ${post.post_id}: deduplicated ` +
              `${post.versions.length - versionsForDb.length} version(s) with colliding version_seq`
          );
        }
        const createdAt = earliestPublishedAt({ ...post, versions: versionsForDb });

        const data = {
          campaignId,
          upstreamStatus: snapshotToUpstreamStatus(post),
          createdAt,
          versions: { create: versionsForDb.map((v) => mapVersionRow(v)) }
        };
        if (lane.existing.has(post.post_id)) {
          await tx.post.update({ where: { id: post.post_id, creatorId, source: lane.source }, data });
        } else {
          await tx.post.create({
            data: { ...data, id: post.post_id, creatorId, providerPostId: post.post_id, source: lane.source }
          });
        }

        const tierSource = versionsForDb[versionsForDb.length - 1] ?? post.current;
        const tierIds = new Set(tierSource.tier_ids);
        for (const tid of tierIds) {
          const tierKey = tierStableId(creatorId, tid);
          postTierRows.push({
            postId: post.post_id,
            tierId: tierKey
          });
        }
      }
    }
    if (postTierRows.length > 0) {
      await tx.postTier.createMany({ data: postTierRows });
    }

    // Clean up only after refreshed posts have moved to their current campaigns and tiers.
    const dbOurCampaigns = await tx.campaign.findMany({ where: { creatorId }, select: { id: true } });
    for (const c of dbOurCampaigns) {
      if (snapCampaignIds.has(c.id)) {
        continue;
      }
      const n = await tx.post.count({ where: { campaignId: c.id } });
      if (n === 0) {
        await tx.campaign.delete({ where: { id: c.id } });
      }
    }
    const dbOurTiers = await tx.tier.findMany({ where: { creatorId }, select: { id: true } });
    for (const t of dbOurTiers) {
      if (snapTierIds.has(t.id)) {
        continue;
      }
      const n = await tx.postTier.count({ where: { tierId: t.id } });
      if (n === 0) {
        await tx.tier.delete({ where: { id: t.id } });
      }
    }

    const mediaEntriesAll = Object.values(mediaMap) as MediaRow[];
    for (const lane of mirrorLanes) {
      const ingestOriginLane =
        lane.source === PostSource.PATREON
          ? MediaIngestOrigin.PATREON
          : MediaIngestOrigin.SUBSCRIBESTAR;
      // A preserved parent can share fresh media revisions with newly materialized posts.
      if (lane.preserve.size > 0) {
        const preservedMedia = await tx.mediaAsset.findMany({
          where: { creatorId, ingestOrigin: ingestOriginLane, primaryPostId: { in: [...lane.preserve] } },
          select: { id: true, primaryPostId: true, currentUpstreamRevision: true, currentUpstreamUrl: true, upstreamStatus: true }
        });
        for (const row of preservedMedia) {
          const media = mediaMap[row.id];
          if (!media) continue;
          const advanceRevision = media.current.upstream_revision !== row.currentUpstreamRevision &&
            media.versions.some((v) => v.upstream_revision === row.currentUpstreamRevision &&
              v.version_seq < media.current.version_seq);
          const addReferences = media.post_ids.some((id) => postIdsToMaterialize.has(id));
          if (addReferences && media.current.upstream_revision !== row.currentUpstreamRevision && !advanceRevision) {
            throw new Error("Media revision changed since the snapshot; retry the ingest batch.");
          }
          const refreshUrl = media.current.upstream_revision === row.currentUpstreamRevision &&
            media.current.upstream_url?.trim() && media.current.upstream_url !== row.currentUpstreamUrl;
          const deleteMedia = media.upstream_status === "deleted" && row.upstreamStatus !== MediaUpstreamStatus.deleted;
          if (advanceRevision || addReferences || refreshUrl || deleteMedia) {
            const updated = await tx.mediaAsset.updateMany({
              where: {
                id: row.id, creatorId, primaryPostId: row.primaryPostId, ingestOrigin: ingestOriginLane,
                currentUpstreamRevision: row.currentUpstreamRevision, currentUpstreamUrl: row.currentUpstreamUrl,
                ...(advanceRevision || deleteMedia ? { upstreamStatus: row.upstreamStatus } : {})
              },
              data: advanceRevision ? mapMediaStateRow(media) : {
                ...(addReferences ? { postIds: [...media.post_ids] } : {}),
                ...(refreshUrl ? { currentUpstreamUrl: media.current.upstream_url } : {}),
                ...(deleteMedia ? { upstreamStatus: MediaUpstreamStatus.deleted } : {})
              }
            });
            if (deleteMedia && updated.count !== 1) {
              throw new Error("Media changed while applying deletion; retry the ingest batch.");
            }
            if ((advanceRevision || addReferences) && updated.count !== 1) {
              throw new Error("Media changed while saving shared state; retry the ingest batch.");
            }
          }
        }
      }
      const mediaEntries = mediaEntriesAll.filter((m) => {
        const primary = m.post_ids[0];
        if (!primary || !postIdsToMaterialize.has(primary)) {
          return false;
        }
        const prow = postMap[primary] as PostRow | undefined;
        if (!prow || prow.source === "RELAY") {
          return false;
        }
        return snapshotMirrorDbSource(prow) === lane.source;
      });
      if (mediaEntries.length === 0) {
        continue;
      }
      await tx.mediaAsset.createMany({
        data: mediaEntries.map((m) => {
          const primary =
            m.post_ids[0] ??
            (() => {
              throw new Error(`DbCanonicalStore.saveForCreator: media ${m.media_id} has empty post_ids`);
            })();
          return {
            id: m.media_id,
            creatorId: m.creator_id,
            primaryPostId: primary,
            ...mapMediaStateRow(m),
            ingestOrigin: ingestOriginLane,
            processingStatus: MediaProcessingStatus.READY,
            processingError: null
          };
        })
      });
    }

    // Packaging identity for Patreon imports: Creative Work + Patreon Platform Instance.
    // Runs for preserved and newly materialised posts so a sync also backfills older rows.
    for (const post of postEntriesPatreon) {
      const title =
        post.current?.title?.trim() ||
        post.versions[post.versions.length - 1]?.title?.trim() ||
        post.post_id;
      await ensureDefaultCreativeWorkForPost(tx, {
        postId: post.post_id,
        creatorId,
        title,
        createdAt: earliestPublishedAt(post)
      });
      await ensurePatreonPlatformInstanceForIngestedPost(tx, {
        postId: post.post_id,
        creatorId,
        linkedAt: earliestPublishedAt(post)
      });
    }
    // Recheck references after FK writes, which may have waited for another creator's commit.
    await this.assertNoForeignOwners(creatorId, snapshot, tx);
  }

  // ---------------------------------------------------------------------------
  // Global mutate — loads everything, applies fn, saves everything
  // ---------------------------------------------------------------------------
  public async mutate(
    fn: (snapshot: CanonicalSnapshot) => void | Promise<void>
  ): Promise<void> {
    const snapshot = await this.load();
    await fn(snapshot);
    await this.save(snapshot);
  }

  // ---------------------------------------------------------------------------
  // Creator-scoped mutate — loads only this creator, applies fn, saves only
  // this creator's data back. Other creators are untouched.
  // ---------------------------------------------------------------------------
  public async mutateForCreator(
    creatorId: string,
    fn: (snapshot: CanonicalSnapshot) => void | Promise<void>
  ): Promise<void> {
    let snapshot: CanonicalSnapshot | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Reserve before reading so another import cannot save a stale creator snapshot.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${"canonical-store:" + creatorId}, 0))`;
        snapshot = await this.loadImpl(creatorId, tx);
        await fn(snapshot);
        await this.saveForCreatorInTransaction(creatorId, snapshot, tx);
      }, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (snapshot) await this.checkOwnershipAfterUniqueConflict(error, creatorId, snapshot);
      throw error;
    }
  }
}
