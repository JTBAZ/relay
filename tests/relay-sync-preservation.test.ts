/**
 * Relay-native posts must survive Patreon re-sync (T-2.1 invariant, end-to-end).
 *
 * Creates a published RELAY post through the real HTTP route, then runs a
 * Patreon-style ingest save (`DbCanonicalStore.saveForCreator`) whose snapshot
 * contains Patreon posts but never the Relay post — exactly what a real
 * Patreon sync produces. The Relay post, its version, and its media must be
 * untouched, and the creator gallery must still return it.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  MediaIngestOrigin,
  MediaProcessingStatus,
  MediaUpstreamStatus,
  PostSource
} from "@prisma/client";
import { createApp } from "../src/server.js";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";
import type { PostRow } from "../src/ingest/canonical-store.js";
import { buildRelayR2ObjectKey } from "../src/storage/relay-upload-r2.js";
import { loadPilotUxSeedSpec, resolvePilotUxDevPassword } from "../src/pilot-ux/pilot-ux-seed-spec.js";
import { seedPilotUxDevAccounts } from "../src/pilot-ux/seed-pilot-ux-dev-accounts.js";
import { prisma } from "../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const fixturePath = join(process.cwd(), "tests/fixtures/pilot-ux-seed.json");
const AVA_CREATOR_ID = "rcx_pilot_dev_ava";
const SUPPORTER_RELAY_TIER_ID = "patreon_tier_ava_supporter";

function pilotUxDbAppConfig(tempDir: string) {
  return {
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"),
    ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"),
    export_storage_root: join(tempDir, "exports"),
    gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"),
    gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
    collections_store_path: join(tempDir, "collections.json"),
    page_layout_store_path: join(tempDir, "page_layout.json"),
    patron_favorites_store_path: join(tempDir, "patron_favorites.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    prisma,
    relay_db_store_identity: true,
    relay_db_store_canonical: true,
    relay_db_store_overrides: true
  };
}

async function seedCommittedRelayUploadMedia(creatorId: string, mediaId: string): Promise<void> {
  const storageKey = buildRelayR2ObjectKey(creatorId, mediaId);
  await prisma.mediaAsset.upsert({
    where: { id: mediaId },
    create: {
      id: mediaId,
      creatorId,
      postIds: [],
      primaryPostId: null,
      upstreamStatus: MediaUpstreamStatus.active,
      currentVersionSeq: 1,
      currentUpstreamRevision: "relay:upload:committed",
      currentMimeType: "image/png",
      currentUpstreamUrl: null,
      currentStorageKey: storageKey,
      currentIngestedAt: new Date(),
      versionsJson: [],
      ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD,
      processingStatus: MediaProcessingStatus.READY
    },
    update: {
      creatorId,
      postIds: [],
      primaryPostId: null,
      currentMimeType: "image/png",
      currentStorageKey: storageKey,
      ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD,
      processingStatus: MediaProcessingStatus.READY,
      upstreamStatus: MediaUpstreamStatus.active
    }
  });
}

function syntheticPatreonPost(postId: string, publishedAt: string): PostRow {
  const v = {
    version_seq: 1,
    upstream_revision: `rev:${postId}:1`,
    title: `Synthetic Patreon post ${postId}`,
    published_at: publishedAt,
    tag_ids: [],
    tier_ids: [SUPPORTER_RELAY_TIER_ID],
    media_ids: [],
    ingested_at: publishedAt
  };
  return {
    post_id: postId,
    creator_id: AVA_CREATOR_ID,
    current: v,
    versions: [v],
    upstream_status: "active",
    source: "PATREON"
  };
}

describe.skipIf(!hasDatabaseUrl)("Patreon re-sync preserves Relay-native posts", () => {
  it(
    "RELAY post + media survive a saveForCreator ingest pass that omits them",
    async () => {
      const spec = loadPilotUxSeedSpec(fixturePath);
      const password = resolvePilotUxDevPassword(spec);
      await seedPilotUxDevAccounts(prisma, { fixturePath });

      const tempDir = await mkdtemp(join(tmpdir(), "relay-sync-preserve-"));
      const { app } = createApp(pilotUxDbAppConfig(tempDir));

      const login = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.creatorAva.email, password });
      expect(login.status).toBe(200);
      const avaToken = login.body.data.token as string;

      const composeRes = await request(app)
        .get(`/api/v1/relay/compose-tiers?creator_id=${AVA_CREATOR_ID}`)
        .set("Authorization", `Bearer ${avaToken}`);
      expect(composeRes.status).toBe(200);
      const supporterTier = (
        composeRes.body.data.tiers as Array<{
          tier_id: string;
          relay_tier_id: string;
          campaign_id: string | null;
        }>
      ).find((t) => t.relay_tier_id === SUPPORTER_RELAY_TIER_ID);
      expect(supporterTier?.tier_id).toBeTruthy();

      const suffix = randomUUID().slice(0, 8);
      const mediaId = `sync_preserve_media_${suffix}`;
      const syntheticPatreonPostId = `sync_preserve_patreon_${suffix}`;
      await seedCommittedRelayUploadMedia(AVA_CREATOR_ID, mediaId);

      const title = `Sync preservation ${suffix}`;
      const create = await request(app)
        .post("/api/v1/relay/posts")
        .set("Authorization", `Bearer ${avaToken}`)
        .send({
          creator_id: AVA_CREATOR_ID,
          campaign_id: supporterTier!.campaign_id,
          title,
          description: "re-sync preservation regression",
          is_public: false,
          required_tier_id: null,
          tier_ids: [supporterTier!.tier_id],
          tag_ids: [],
          media_ids: [mediaId],
          publish: true
        });
      expect(
        create.status,
        JSON.stringify(create.body?.error ?? create.body, null, 2)
      ).toBe(201);
      const relayPostId = create.body.data.post.id as string;

      const expectedStorageKey = buildRelayR2ObjectKey(AVA_CREATOR_ID, mediaId);

      try {
        // Patreon-style ingest pass: load the live snapshot (as the sync
        // coordinator does), add a "newly synced" Patreon post, and save.
        // Real Patreon data never contains the Relay post or its media.
        const store = new DbCanonicalStore(prisma);
        const snap = await store.loadForCreator(AVA_CREATOR_ID);
        const byPost = (snap.posts[AVA_CREATOR_ID] ??= {});
        byPost[syntheticPatreonPostId] = syntheticPatreonPost(
          syntheticPatreonPostId,
          new Date().toISOString()
        );
        await store.saveForCreator(AVA_CREATOR_ID, snap);

        // Synthetic Patreon post materialized — the ingest pass actually ran.
        const patreonRow = await prisma.post.findUnique({
          where: { id: syntheticPatreonPostId }
        });
        expect(patreonRow?.source).toBe(PostSource.PATREON);

        // Relay post untouched.
        const relayRow = await prisma.post.findUnique({ where: { id: relayPostId } });
        expect(relayRow).toBeTruthy();
        expect(relayRow?.source).toBe(PostSource.RELAY);
        expect(relayRow?.upstreamStatus).toBe("active");

        const versionCount = await prisma.postVersion.count({
          where: { postId: relayPostId }
        });
        expect(versionCount).toBe(1);

        // Relay media untouched (not in the RELAY_UPLOAD ingest-origin stomp lane).
        const mediaRow = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
        expect(mediaRow).toBeTruthy();
        expect(mediaRow?.ingestOrigin).toBe(MediaIngestOrigin.RELAY_UPLOAD);
        expect(mediaRow?.postIds).toContain(relayPostId);
        expect(mediaRow?.currentStorageKey).toBe(expectedStorageKey);

        // Creator gallery still serves the Relay post.
        const gallery = await request(app).get(
          `/api/v1/gallery/items?creator_id=${AVA_CREATOR_ID}&limit=100&display=post_primary`
        );
        expect(gallery.status).toBe(200);
        const galleryPostIds = (gallery.body.data.items as Array<{ post_id: string }>).map(
          (row) => row.post_id
        );
        expect(galleryPostIds).toContain(relayPostId);
      } finally {
        // Clean up so repeated runs / sibling suites see the seeded baseline.
        await prisma.platformInstance.deleteMany({ where: { postId: syntheticPatreonPostId } });
        await prisma.creativeWorkMember.deleteMany({ where: { postId: syntheticPatreonPostId } });
        await prisma.creativeWork.deleteMany({
          where: { id: `cw_default_${syntheticPatreonPostId}` }
        }).catch(() => undefined);
        await prisma.postTier.deleteMany({ where: { postId: syntheticPatreonPostId } });
        await prisma.postVersion.deleteMany({ where: { postId: syntheticPatreonPostId } });
        await prisma.post.deleteMany({ where: { id: syntheticPatreonPostId } });
        await prisma.postTier.deleteMany({ where: { postId: relayPostId } });
        await prisma.postVersion.deleteMany({ where: { postId: relayPostId } });
        await prisma.mediaAsset.deleteMany({ where: { id: mediaId } });
        await prisma.post.deleteMany({ where: { id: relayPostId } });
      }
    },
    120_000
  );
});
