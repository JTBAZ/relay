/**
 * PILOT-014 — Relay-native post API routes + pilot UX create → patron feed integration.
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
  PostSource,
  type PrismaClient
} from "@prisma/client";
import { createApp } from "../src/server.js";
import { getR2ClientConfigFromEnv } from "../src/storage/r2-config.js";
import { buildRelayR2ObjectKey } from "../src/storage/relay-upload-r2.js";
import { loadPilotUxSeedSpec, resolvePilotUxDevPassword } from "../src/pilot-ux/pilot-ux-seed-spec.js";
import { seedPilotUxDevAccounts } from "../src/pilot-ux/seed-pilot-ux-dev-accounts.js";
import { prisma } from "../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const hasR2Configured = Boolean(getR2ClientConfigFromEnv());
const fixturePath = join(process.cwd(), "tests/fixtures/pilot-ux-seed.json");
const AVA_CREATOR_ID = "rcx_pilot_dev_ava";
const AVA_CAMPAIGN_ID = "pilot_campaign_ava";

/** Minimal 1×1 PNG for presigned upload tests. */
const MINI_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

function fileOnlyConfig(tempDir: string) {
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
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}

function pilotUxDbAppConfig(tempDir: string) {
  return {
    ...fileOnlyConfig(tempDir),
    prisma,
    relay_db_store_identity: true,
    relay_db_store_canonical: true,
    relay_db_store_overrides: true
  };
}

async function loginCreator(app: ReturnType<typeof createApp>["app"], email: string, password: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

async function loginPatron(app: ReturnType<typeof createApp>["app"], email: string, password: string) {
  return loginCreator(app, email, password);
}

async function fetchComposeTier(
  app: ReturnType<typeof createApp>["app"],
  token: string,
  creatorId: string,
  relayTierId: string
): Promise<{ tier_id: string; campaign_id: string | null }> {
  const res = await request(app)
    .get(`/api/v1/relay/compose-tiers?creator_id=${creatorId}`)
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  const row = (
    res.body.data.tiers as Array<{
      tier_id: string;
      relay_tier_id: string;
      campaign_id: string | null;
    }>
  ).find((t) => t.relay_tier_id === relayTierId);
  expect(row?.tier_id).toBeTruthy();
  return { tier_id: row!.tier_id, campaign_id: row!.campaign_id };
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

describe("relay-native post routes (PILOT-014)", () => {
  it("GET /api/v1/relay/compose-tiers returns 503 without database", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-compose-503-"));
    const { app } = createApp(fileOnlyConfig(tempDir));
    const res = await request(app).get(
      `/api/v1/relay/compose-tiers?creator_id=${AVA_CREATOR_ID}`
    );
    expect(res.status).toBe(503);
  });

  it("GET /api/v1/relay/compose-tiers returns 401 without session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-compose-401-"));
    const { app } = createApp({ ...fileOnlyConfig(tempDir), prisma: {} as PrismaClient });
    const res = await request(app).get(
      `/api/v1/relay/compose-tiers?creator_id=${AVA_CREATOR_ID}`
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/relay/posts returns 401 without session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-post-401-"));
    const { app } = createApp({ ...fileOnlyConfig(tempDir), prisma: {} as PrismaClient });
    const res = await request(app)
      .post("/api/v1/relay/posts")
      .send({
        creator_id: AVA_CREATOR_ID,
        title: "t",
        is_public: true,
        tier_ids: [],
        tag_ids: [],
        media_ids: [],
        publish: true
      });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/relay/posts returns 503 without database", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-post-503-"));
    const { app } = createApp(fileOnlyConfig(tempDir));
    const res = await request(app)
      .post("/api/v1/relay/posts")
      .send({
        creator_id: AVA_CREATOR_ID,
        title: "t",
        is_public: true,
        tier_ids: [],
        tag_ids: [],
        media_ids: [],
        publish: true
      });
    expect(res.status).toBe(503);
  });
});

describe.skipIf(!hasDatabaseUrl)("relay-native posts — pilot UX integration (Gate H API)", () => {
  it(
    "Dev Ava creates RELAY post → Library + Riley patron feed (tier entitlement)",
    async () => {
      const spec = loadPilotUxSeedSpec(fixturePath);
      const password = resolvePilotUxDevPassword(spec);
      await seedPilotUxDevAccounts(prisma, { fixturePath });

      const tempDir = await mkdtemp(join(tmpdir(), "relay-native-int-"));
      const { app } = createApp(pilotUxDbAppConfig(tempDir));

      const avaToken = await loginCreator(app, spec.accounts.creatorAva.email, password);
      const supporterTier = await fetchComposeTier(
        app,
        avaToken,
        AVA_CREATOR_ID,
        "patreon_tier_ava_supporter"
      );
      const studioTier = await fetchComposeTier(
        app,
        avaToken,
        AVA_CREATOR_ID,
        "patreon_tier_ava_studio"
      );
      expect(supporterTier.campaign_id).toBe(AVA_CAMPAIGN_ID);
      expect(studioTier.campaign_id).toBe(AVA_CAMPAIGN_ID);

      const suffix = randomUUID().slice(0, 8);
      const supporterMediaId = `pilot_relay_media_sup_${suffix}`;
      const studioMediaId = `pilot_relay_media_stu_${suffix}`;
      await seedCommittedRelayUploadMedia(AVA_CREATOR_ID, supporterMediaId);
      await seedCommittedRelayUploadMedia(AVA_CREATOR_ID, studioMediaId);

      const supporterTitle = `Pilot relay supporter ${suffix}`;
      const studioTitle = `Pilot relay studio ${suffix}`;

      const supporterCreate = await request(app)
        .post("/api/v1/relay/posts")
        .set("Authorization", `Bearer ${avaToken}`)
        .send({
          creator_id: AVA_CREATOR_ID,
          campaign_id: supporterTier.campaign_id,
          title: supporterTitle,
          description: "PILOT-014 integration — Riley entitled",
          is_public: false,
          required_tier_id: null,
          tier_ids: [supporterTier.tier_id],
          tag_ids: ["pilot-014"],
          media_ids: [supporterMediaId],
          publish: true
        });
      expect(
        supporterCreate.status,
        JSON.stringify(supporterCreate.body?.error ?? supporterCreate.body, null, 2)
      ).toBe(201);
      expect(supporterCreate.body.data.post.source).toBe("RELAY");
      const supporterPostId = supporterCreate.body.data.post.id as string;

      const studioCreate = await request(app)
        .post("/api/v1/relay/posts")
        .set("Authorization", `Bearer ${avaToken}`)
        .send({
          creator_id: AVA_CREATOR_ID,
          campaign_id: studioTier.campaign_id,
          title: studioTitle,
          description: "PILOT-014 integration — Riley not entitled",
          is_public: false,
          required_tier_id: null,
          tier_ids: [studioTier.tier_id],
          tag_ids: ["pilot-014"],
          media_ids: [studioMediaId],
          publish: true
        });
      expect(studioCreate.status).toBe(201);
      const studioPostId = studioCreate.body.data.post.id as string;

      const dbSupporter = await prisma.post.findUnique({ where: { id: supporterPostId } });
      expect(dbSupporter?.source).toBe(PostSource.RELAY);

      const gallery = await request(app).get(
        `/api/v1/gallery/items?creator_id=${AVA_CREATOR_ID}&limit=50&display=post_primary`
      );
      expect(gallery.status).toBe(200);
      const galleryPostIds = (gallery.body.data.items as Array<{ post_id: string }>).map(
        (row) => row.post_id
      );
      expect(galleryPostIds).toContain(supporterPostId);
      expect(galleryPostIds).toContain(studioPostId);

      const rileyToken = await loginPatron(app, spec.accounts.patronRiley.email, password);
      const feed = await request(app)
        .get("/api/v1/patron/feed?limit=50")
        .set("Authorization", `Bearer ${rileyToken}`);
      expect(feed.status).toBe(200);

      const feedPostIds = (feed.body.data.feedPosts as Array<{ id: string; title: string }>).map(
        (p) => p.id
      );
      const feedTitles = (feed.body.data.feedPosts as Array<{ id: string; title: string }>).map(
        (p) => p.title
      );
      expect(feedPostIds).toContain(supporterPostId);
      expect(feedTitles).toContain(supporterTitle);
      expect(feedPostIds).not.toContain(studioPostId);
    },
    120_000
  );
});

describe.skipIf(!hasDatabaseUrl || !hasR2Configured)(
  "relay-native posts — R2 upload chain (Gate H optional)",
  () => {
    it(
      "Dev Ava presign upload → commit → create RELAY post visible to Riley",
      async () => {
        const spec = loadPilotUxSeedSpec(fixturePath);
        const password = resolvePilotUxDevPassword(spec);
        await seedPilotUxDevAccounts(prisma, { fixturePath });

        const tempDir = await mkdtemp(join(tmpdir(), "relay-native-r2-"));
        const { app } = createApp(pilotUxDbAppConfig(tempDir));

        const avaToken = await loginCreator(app, spec.accounts.creatorAva.email, password);
        const supporterTier = await fetchComposeTier(
          app,
          avaToken,
          AVA_CREATOR_ID,
          "patreon_tier_ava_supporter"
        );

        const init = await request(app)
          .post("/api/v1/relay/upload/init")
          .set("Authorization", `Bearer ${avaToken}`)
          .send({
            creator_id: AVA_CREATOR_ID,
            content_type: "image/png",
            byte_size: MINI_PNG.byteLength
          });
        expect(init.status).toBe(201);
        const mediaId = init.body.data.media_id as string;
        const putUrl = init.body.data.upload.url as string;
        const putCt = init.body.data.upload.headers["Content-Type"] as string;

        const putRes = await fetch(putUrl, {
          method: "PUT",
          headers: { "Content-Type": putCt },
          body: MINI_PNG
        });
        expect(putRes.ok).toBe(true);

        const commit = await request(app)
          .post("/api/v1/relay/upload/commit")
          .set("Authorization", `Bearer ${avaToken}`)
          .send({
            creator_id: AVA_CREATOR_ID,
            media_id: mediaId,
            content_type: "image/png",
            byte_size: MINI_PNG.byteLength
          });
        expect(commit.status).toBe(200);

        const title = `PILOT-014 R2 ${randomUUID().slice(0, 8)}`;
        const create = await request(app)
          .post("/api/v1/relay/posts")
          .set("Authorization", `Bearer ${avaToken}`)
          .send({
            creator_id: AVA_CREATOR_ID,
            campaign_id: supporterTier.campaign_id,
            title,
            description: null,
            is_public: false,
            required_tier_id: null,
            tier_ids: [supporterTier.tier_id],
            tag_ids: [],
            media_ids: [mediaId],
            publish: true
          });
        expect(
          create.status,
          JSON.stringify(create.body?.error ?? create.body, null, 2)
        ).toBe(201);
        expect(create.body.data.post.source).toBe("RELAY");
        const postId = create.body.data.post.id as string;

        const rileyToken = await loginPatron(app, spec.accounts.patronRiley.email, password);
        const feed = await request(app)
          .get("/api/v1/patron/feed?limit=50")
          .set("Authorization", `Bearer ${rileyToken}`);
        expect(feed.status).toBe(200);
        const feedPosts = feed.body.data.feedPosts as Array<{ id: string; title: string }>;
        expect(feedPosts.some((p) => p.id === postId && p.title === title)).toBe(true);
      },
      120_000
    );
  }
);
