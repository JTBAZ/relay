/**
 * Seed a multi-media pilot post and collection snips for UX QA.
 *
 * Creates/updates:
 * - Post `pilot_post_ava_multi_gallery` (Ava, Supporter tier) with 3 media ids
 * - Media storage keys copied from existing staged pilot fixtures
 * - Riley collection `Multi-media QA` with snips for media #2 and #3
 *
 * Usage:
 *   npm run seed:pilot-multi-media-qa
 *
 * Note: `npm run seed:pilot-ux` removes these posts (they are not in pilot-ux-seed.json)
 * but leaves ingest idempotency keys behind. This script clears stale keys before re-ingest.
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const API = "http://127.0.0.1:8787";
const AVA_EMAIL = "creator_dev_ava@pilot.relay.test";
const RILEY_EMAIL = "patron_dev_riley@pilot.relay.test";
const DEV_PASSWORD = "pilot-ux-dev-only";
const CREATOR_ID = "rcx_pilot_dev_ava";
const IDEA_1_POST_ID = "pilot_post_ava_multi_gallery";
const IDEA_2_POST_ID = "pilot_post_ava_multi_gallery_idea2";
const IDEA_1_MEDIA_IDS = [
  "pilot_media_ava_multi_1",
  "pilot_media_ava_multi_2",
  "pilot_media_ava_multi_3"
];
const IDEA_2_MEDIA_IDS = [
  "pilot_media_ava_multi2_1",
  "pilot_media_ava_multi2_2",
  "pilot_media_ava_multi2_3"
];
const SEED_POSTS = [
  {
    post_id: IDEA_1_POST_ID,
    title: "Collect test - Multi-media navigation",
    description: "Idea 1 test bed (edge rail) with three media assets.",
    published_at: "2026-05-30T14:35:00.000Z",
    tag_ids: ["collect-test", "multi-media", "ux-nav-idea1"],
    tier_ids: ["patreon_tier_ava_supporter"],
    upstream_revision: "v1",
    media: [
      { media_id: IDEA_1_MEDIA_IDS[0], mime_type: "image/png", upstream_revision: "v1a" },
      { media_id: IDEA_1_MEDIA_IDS[1], mime_type: "image/png", upstream_revision: "v1b" },
      { media_id: IDEA_1_MEDIA_IDS[2], mime_type: "image/png", upstream_revision: "v1c" }
    ]
  },
  {
    post_id: IDEA_2_POST_ID,
    title: "Collect test - Multi-media navigation",
    description: "Idea 2 test bed (peek deck) with three media assets.",
    published_at: "2026-05-30T14:34:00.000Z",
    tag_ids: ["collect-test", "multi-media", "ux-nav-idea2"],
    tier_ids: ["patreon_tier_ava_supporter"],
    upstream_revision: "v1",
    media: [
      { media_id: IDEA_2_MEDIA_IDS[0], mime_type: "image/png", upstream_revision: "v2a" },
      { media_id: IDEA_2_MEDIA_IDS[1], mime_type: "image/png", upstream_revision: "v2b" },
      { media_id: IDEA_2_MEDIA_IDS[2], mime_type: "image/png", upstream_revision: "v2c" }
    ]
  }
];

const { prisma } = await import("../dist/src/lib/db.js");
const { ingestIdempotencyKey } = await import("../dist/src/ingest/idempotency.js");

function multiMediaIdempotencyKeys() {
  const keys = [];
  for (const post of SEED_POSTS) {
    keys.push(
      ingestIdempotencyKey(["ingest_post", CREATOR_ID, post.post_id, post.upstream_revision])
    );
    for (const media of post.media) {
      keys.push(
        ingestIdempotencyKey([
          "ingest_media_rev",
          CREATOR_ID,
          media.media_id,
          media.upstream_revision
        ])
      );
    }
  }
  return keys;
}

async function clearStaleMultiMediaSeedState() {
  const postIds = SEED_POSTS.map((post) => post.post_id);
  const mediaIds = [...IDEA_1_MEDIA_IDS, ...IDEA_2_MEDIA_IDS];
  const batchKeys = multiMediaIdempotencyKeys();

  await prisma.ingestIdempotencyKey.deleteMany({
    where: { creatorId: CREATOR_ID, batchKey: { in: batchKeys } }
  });
  await prisma.postVersion.deleteMany({ where: { postId: { in: postIds } } });
  await prisma.post.deleteMany({ where: { id: { in: postIds } } });
  await prisma.mediaAsset.deleteMany({
    where: { id: { in: mediaIds }, creatorId: CREATOR_ID }
  });
}

async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`${path}: ${message}`);
  }
  return json?.data;
}

async function login(email) {
  const data = await api("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: DEV_PASSWORD
    })
  });
  return data.token;
}

async function seedPost(creatorToken) {
  const body = {
    creator_id: CREATOR_ID,
    tiers: [],
    posts: SEED_POSTS
  };
  const result = await api("/api/v1/ingest/batches?process_sync=true", {
    method: "POST",
    headers: { authorization: `Bearer ${creatorToken}` },
    body: JSON.stringify(body)
  });
  if ((result?.posts_written ?? 0) < SEED_POSTS.length) {
    throw new Error(
      `Expected ${SEED_POSTS.length} multi-media posts but ingest wrote ${result?.posts_written ?? 0}. ` +
        `idempotent_skips=${result?.idempotent_skips ?? 0}`
    );
  }
}

async function copyStorageKeys() {
  const sources = await prisma.mediaAsset.findMany({
    where: {
      id: {
        in: ["pilot_media_ava_intro", "pilot_media_ava_supporter", "pilot_media_ava_studio"]
      }
    },
    select: {
      id: true,
      currentStorageKey: true,
      currentMimeType: true
    }
  });
  const byId = new Map(sources.map((s) => [s.id, s]));
  const mapping = [
    ["pilot_media_ava_intro", IDEA_1_MEDIA_IDS[0]],
    ["pilot_media_ava_supporter", IDEA_1_MEDIA_IDS[1]],
    ["pilot_media_ava_studio", IDEA_1_MEDIA_IDS[2]],
    ["pilot_media_ava_intro", IDEA_2_MEDIA_IDS[0]],
    ["pilot_media_ava_supporter", IDEA_2_MEDIA_IDS[1]],
    ["pilot_media_ava_studio", IDEA_2_MEDIA_IDS[2]]
  ];
  for (const [sourceId, targetId] of mapping) {
    const source = byId.get(sourceId);
    if (!source?.currentStorageKey) {
      throw new Error(`Source media missing storage key: ${sourceId}`);
    }
    await prisma.mediaAsset.updateMany({
      where: { id: targetId, creatorId: CREATOR_ID },
      data: {
        currentStorageKey: source.currentStorageKey,
        currentMimeType: source.currentMimeType ?? "image/png",
        processingStatus: "READY",
        upstreamStatus: "active"
      }
    });
  }
}

async function ensureCollectionAndSnips(rileyToken) {
  const list = await api(`/api/v1/patron/collections?creator_id=${encodeURIComponent(CREATOR_ID)}`, {
    headers: { authorization: `Bearer ${rileyToken}` }
  });
  let collection = list.collections.find((c) => c.title === "Multi-media QA");
  if (!collection) {
    const created = await api("/api/v1/patron/collections", {
      method: "POST",
      headers: { authorization: `Bearer ${rileyToken}` },
      body: JSON.stringify({
        creator_id: CREATOR_ID,
        title: "Multi-media QA"
      })
    });
    collection = created.collection;
  }

  const targets = [
    { postId: IDEA_1_POST_ID, mediaId: IDEA_1_MEDIA_IDS[1] },
    { postId: IDEA_1_POST_ID, mediaId: IDEA_1_MEDIA_IDS[2] },
    { postId: IDEA_2_POST_ID, mediaId: IDEA_2_MEDIA_IDS[1] }
  ];
  for (const target of targets) {
    await api(`/api/v1/patron/collections/${encodeURIComponent(collection.collection_id)}/entries`, {
      method: "POST",
      headers: { authorization: `Bearer ${rileyToken}` },
      body: JSON.stringify({
        creator_id: CREATOR_ID,
        post_id: target.postId,
        media_id: target.mediaId
      })
    });
  }
  return collection.collection_id;
}

async function main() {
  await clearStaleMultiMediaSeedState();
  const creatorToken = await login(AVA_EMAIL);
  await seedPost(creatorToken);
  await copyStorageKeys();
  const rileyToken = await login(RILEY_EMAIL);
  const collectionId = await ensureCollectionAndSnips(rileyToken);
  console.log("seed-pilot-multi-media-qa: ok");
  console.log(`Collection: /patron/collections/${collectionId}`);
  console.log(
    `Idea 1 post: /patron/feed/post/${CREATOR_ID}/${IDEA_1_POST_ID}?media_id=${IDEA_1_MEDIA_IDS[1]}`
  );
  console.log(
    `Idea 2 post: /patron/feed/post/${CREATOR_ID}/${IDEA_2_POST_ID}?media_id=${IDEA_2_MEDIA_IDS[1]}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

