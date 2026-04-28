import {
  MediaIngestOrigin,
  MediaUpstreamStatus,
  PostSource,
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

/** Snapshot rows the Patreon sync replaces; Relay-native posts are preserved (see T-2.1). */
function isPatreonSnapshotPost(p: PostRow): boolean {
  return p.source !== "RELAY";
}

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
 * Postgres-backed canonical store. `saveForCreator()` replaces Patreon-sourced
 * post/media rows for the target creator; `Post.source=RELAY` is left intact (T-2.1).
 * The global `save()` is preserved for backward compat but delegates to per-creator saves internally.
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

  private async loadImpl(creatorId?: string): Promise<CanonicalSnapshot> {
    const where = creatorId ? { creatorId } : undefined;
    const [
      campaigns,
      tiers,
      posts,
      postVersions,
      mediaRows,
      idemRows
    ] = await Promise.all([
      this.prisma.campaign.findMany({ where }),
      this.prisma.tier.findMany({ where }),
      this.prisma.post.findMany({ where }),
      this.prisma.postVersion.findMany({
        where: where
          ? { post: { creatorId } }
          : undefined,
        orderBy: { versionSeq: "asc" }
      }),
      this.prisma.mediaAsset.findMany({ where }),
      this.prisma.ingestIdempotencyKey.findMany({
        where: creatorId ? { creatorId } : undefined
      })
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
        upstream_status: p.upstreamStatus === PostUpstreamStatus.deleted ? "deleted" : "active",
        source: p.source === PostSource.RELAY ? "RELAY" : "PATREON"
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
        versions: Array.isArray(versions) ? versions : []
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
  // ---------------------------------------------------------------------------
  public async saveForCreator(creatorId: string, snapshot: CanonicalSnapshot): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const campaignMap = snapshot.campaigns[creatorId] ?? {};
        const postMap = snapshot.posts[creatorId] ?? {};
        const mediaMap = snapshot.media[creatorId] ?? {};
        const tierMap = snapshot.tiers[creatorId] ?? {};
        const postEntries = (Object.values(postMap) as PostRow[]).filter(isPatreonSnapshotPost);
        const snapTierIds = new Set(
          (Object.values(tierMap) as TierRow[]).map((r) => tierStableId(r.creator_id, r.tier_id))
        );
        const snapCampaignIds = new Set(Object.keys(campaignMap));

        // --- T-2.2: fingerprint unchanged Patreon posts so a no-op re-ingest skips delete+reinsert. ---
        const existingPatreon = await tx.post.findMany({
          where: { creatorId, source: PostSource.PATREON },
          include: { versions: { orderBy: { versionSeq: "asc" } } }
        });
        const existingById = new Map(existingPatreon.map((p) => [p.id, p]));
        const preservePostIds = new Set<string>();
        for (const post of postEntries) {
          const dbP = existingById.get(post.post_id);
          if (!dbP) {
            continue;
          }
          if (snapshotToUpstreamStatus(post) !== dbP.upstreamStatus) {
            continue;
          }
          if (inferCampaignIdForPost(creatorId, post, snapshot) !== dbP.campaignId) {
            continue;
          }
          const wantFp = patreonVersionFingerprintFromSnapshot(post.versions);
          const haveFp = versionListFingerprint(
            (dbP.versions ?? []).map((v) => ({ versionSeq: v.versionSeq, upstreamRevision: v.upstreamRevision }))
          );
          if (wantFp === haveFp) {
            preservePostIds.add(post.post_id);
          }
        }
        const stompPostIds: string[] = existingPatreon
          .map((p) => p.id)
          .filter((id) => !preservePostIds.has(id));
        if (stompPostIds.length > 0) {
          await tx.postTier.deleteMany({ where: { postId: { in: stompPostIds } } });
          await tx.mediaAsset.deleteMany({ where: { primaryPostId: { in: stompPostIds } } });
          await tx.postVersion.deleteMany({ where: { postId: { in: stompPostIds } } });
          await tx.post.deleteMany({ where: { id: { in: stompPostIds } } });
        }
        await tx.ingestIdempotencyKey.deleteMany({ where: { creatorId } });

        // Orphaned campaigns/tiers for this creator: not in the incoming snapshot, no remaining posts.
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

        // --- Cross-tenant reassign: same upstream PKs must land on the saving creator. ---
        const incomingCampaignIds = (Object.values(campaignMap) as CampaignRow[]).map((r) => r.campaign_id);
        const incomingPostIds = (Object.values(postMap) as PostRow[]).map((r) => r.post_id);
        const incomingMediaIds = (Object.values(mediaMap) as MediaRow[]).map((r) => r.media_id);
        const incomingTierIds = (Object.values(tierMap) as TierRow[]).map(
          (r) => tierStableId(r.creator_id, r.tier_id)
        );

        if (incomingPostIds.length > 0) {
          const orphanPosts = await tx.post.findMany({
            where: {
              id: { in: incomingPostIds },
              creatorId: { not: creatorId },
              source: PostSource.PATREON
            },
            select: { id: true, creatorId: true }
          });
          if (orphanPosts.length > 0) {
            const orphanPostIds = orphanPosts.map((p) => p.id);
            const orphanCreators = [...new Set(orphanPosts.map((p) => p.creatorId))];
            // eslint-disable-next-line no-console -- ops visibility for workspace migration
            console.warn(
              `[canonical-store-db] workspace migration: reassigning ${orphanPosts.length} post(s) ` +
                `from ${orphanCreators.join(", ")} → ${creatorId}`
            );
            await tx.postTier.deleteMany({ where: { postId: { in: orphanPostIds } } });
            await tx.mediaAsset.deleteMany({ where: { primaryPostId: { in: orphanPostIds } } });
            await tx.postVersion.deleteMany({ where: { postId: { in: orphanPostIds } } });
            await tx.post.deleteMany({ where: { id: { in: orphanPostIds } } });
          }
        }

        if (incomingMediaIds.length > 0) {
          await tx.mediaAsset.deleteMany({
            where: {
              id: { in: incomingMediaIds },
              creatorId: { not: creatorId },
              post: { source: PostSource.PATREON }
            }
          });
        }

        if (incomingTierIds.length > 0) {
          await tx.tier.deleteMany({
            where: { id: { in: incomingTierIds }, creatorId: { not: creatorId } }
          });
        }

        if (incomingCampaignIds.length > 0) {
          const orphanCampaigns = await tx.campaign.findMany({
            where: { id: { in: incomingCampaignIds }, creatorId: { not: creatorId } },
            select: { id: true, creatorId: true }
          });
          if (orphanCampaigns.length > 0) {
            const orphanCampIds = orphanCampaigns.map((c) => c.id);
            const leftoverPosts = await tx.post.findMany({
              where: { campaignId: { in: orphanCampIds }, source: PostSource.PATREON },
              select: { id: true }
            });
            if (leftoverPosts.length > 0) {
              const lpIds = leftoverPosts.map((p) => p.id);
              await tx.postTier.deleteMany({ where: { postId: { in: lpIds } } });
              await tx.mediaAsset.deleteMany({ where: { primaryPostId: { in: lpIds } } });
              await tx.postVersion.deleteMany({ where: { postId: { in: lpIds } } });
              await tx.post.deleteMany({ where: { id: { in: lpIds } } });
            }
            await tx.tier.deleteMany({ where: { campaignId: { in: orphanCampIds } } });
            await tx.campaign.deleteMany({ where: { id: { in: orphanCampIds } } });
          }
        }

        // --- Idempotency + upsert campaigns/tiers, then (re)insert changed Patreon posts + media. ---
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
          await tx.campaign.upsert({
            where: { id: row.campaign_id },
            create: {
              id: row.campaign_id,
              creatorId: row.creator_id,
              name: row.name,
              upstreamUpdatedAt: new Date(row.upstream_updated_at),
              versionSeq: row.version_seq
            },
            update: {
              name: row.name,
              upstreamUpdatedAt: new Date(row.upstream_updated_at),
              versionSeq: row.version_seq
            }
          });
        }

        const tierRows = Object.values(tierMap) as TierRow[];
        for (const row of tierRows) {
          const id = tierStableId(row.creator_id, row.tier_id);
          await tx.tier.upsert({
            where: { id },
            create: {
              id,
              creatorId: row.creator_id,
              relayTierId: row.tier_id,
              providerTierId: row.tier_id,
              campaignId: row.campaign_id ?? null,
              title: row.title,
              amountCents: row.amount_cents ?? null,
              upstreamUpdatedAt: new Date(row.upstream_updated_at),
              versionSeq: row.version_seq
            },
            update: {
              title: row.title,
              amountCents: row.amount_cents ?? null,
              campaignId: row.campaign_id ?? null,
              upstreamUpdatedAt: new Date(row.upstream_updated_at),
              versionSeq: row.version_seq
            }
          });
        }

        const postIdsToMaterialize = new Set(
          postEntries.filter((p) => !preservePostIds.has(p.post_id)).map((p) => p.post_id)
        );
        const postTierRows: Prisma.PostTierCreateManyInput[] = [];
        for (const post of postEntries) {
          if (preservePostIds.has(post.post_id)) {
            continue;
          }
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

          await tx.post.create({
            data: {
              id: post.post_id,
              campaignId,
              creatorId,
              providerPostId: post.post_id,
              source: PostSource.PATREON,
              upstreamStatus:
                post.upstream_status === "deleted"
                  ? PostUpstreamStatus.deleted
                  : PostUpstreamStatus.active,
              createdAt,
              versions: {
                create: versionsForDb.map((v) => mapVersionRow(v))
              }
            }
          });

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
        if (postTierRows.length > 0) {
          await tx.postTier.createMany({ data: postTierRows });
        }

        const mediaEntriesAll = Object.values(mediaMap) as MediaRow[];
        const mediaEntries = mediaEntriesAll.filter((m) => {
          const primary = m.post_ids[0];
          return Boolean(primary) && postIdsToMaterialize.has(primary);
        });
        if (mediaEntries.length > 0) {
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
                currentStorageKey: m.current.storage_key ?? null,
                currentIngestedAt: new Date(m.current.ingested_at),
                versionsJson: m.versions as unknown as Prisma.InputJsonValue,
                ingestOrigin: MediaIngestOrigin.PATREON
              };
            })
          });
        }
      },
      { timeout: 30_000 }
    );
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
    const snapshot = await this.loadForCreator(creatorId);
    await fn(snapshot);
    await this.saveForCreator(creatorId, snapshot);
  }
}
