/**
 * Local, non-destructive Library editor test flight for the pilot Ava account.
 * Run after the pilot UX account seed: node scripts/seed-gallery-editor-demo.mjs
 * Existing ce_demo_* rows and edited presentation/work titles are never updated.
 */
import { constants } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const fixture = JSON.parse(await readFile(join(root, "tests/fixtures/pilot-ux-seed.json"), "utf8"));
const ava = fixture.creators.find((creator) => creator.accountKey === "creatorAva");
const avaAccount = fixture.accounts.creatorAva;
if (!ava?.relayCreatorId || !ava?.campaignId || !avaAccount?.email) throw new Error("Pilot Ava fixture is incomplete.");

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const parsedUrl = new URL(databaseUrl);
if (process.env.NODE_ENV?.toLowerCase() === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)) {
  throw new Error("Gallery editor demo seed is restricted to a local, non-production database.");
}
const creatorId = ava.relayCreatorId;
const storageRoot = resolve(root, process.env.RELAY_EXPORT_STORAGE_ROOT?.trim() || ".relay-data/exports");
const storageRelative = relative(root, storageRoot);
if (storageRelative.startsWith("..") || isAbsolute(storageRelative)) throw new Error("RELAY_EXPORT_STORAGE_ROOT must stay inside this checkout for the local demo.");

const series = { id: "ce_demo_series_green", title: "Green study" };
const works = [
  { id: "ce_demo_work_green_1", title: "Green study — Part 1", titleMode: "inherit_series", partLabel: "Part 1", sortOrder: 0 },
  { id: "ce_demo_work_green_2", title: "Green study — Part 2", titleMode: "inherit_series", partLabel: "Part 2", sortOrder: 1 },
  { id: "ce_demo_work_blue", title: "Blue study", titleMode: "independent" }
];
const posts = [
  { key: "green_1_main", workId: works[0].id, sourceTitle: "Green study, early layout", mode: "inherit_work", image: "asset-b.png", tags: ["all-green", "green-part-1"], order: 0 },
  { key: "green_1_teaser", workId: works[0].id, sourceTitle: "Green study — Part 1 teaser", mode: "source", image: "asset-b.png", tags: ["all-green", "green-part-1", "teaser"], order: 1 },
  { key: "green_1_closeup", workId: works[0].id, sourceTitle: "Green study detail draft", mode: "custom", customTitle: "A personal close-up", image: "asset-b.png", tags: ["all-green", "green-part-1", "detail"], order: 2 },
  { key: "green_2_main", workId: works[1].id, sourceTitle: "Green study, second layout", mode: "inherit_work", image: "asset-b.png", tags: ["all-green", "green-part-2"], order: 0 },
  { key: "green_2_teaser", workId: works[1].id, sourceTitle: "Green study — Part 2 teaser", mode: "source", image: "asset-b.png", tags: ["all-green", "green-part-2", "teaser"], order: 1 },
  { key: "green_2_closeup", workId: works[1].id, sourceTitle: "Green study second detail draft", mode: "custom", customTitle: "Another personal close-up", image: "asset-b.png", tags: ["all-green", "green-part-2", "detail"], order: 2 },
  { key: "blue_main", workId: works[2].id, sourceTitle: "Blue study, early layout", mode: "inherit_work", image: "asset-a.png", tags: ["blue", "blue-study"], order: 0 },
  { key: "blue_teaser", workId: works[2].id, sourceTitle: "Blue study teaser", mode: "source", image: "asset-a.png", tags: ["blue", "blue-study", "teaser"], order: 1 }
].map((post) => ({ ...post,
  id: `ce_demo_post_${post.key}`,
  versionId: `ce_demo_version_${post.key}`,
  mediaId: `ce_demo_media_${post.key}`,
  memberId: `ce_demo_member_${post.key}`
}));

const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const imageDir = join(root, "tests/fixtures/gallery-editor-visual");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function stageLocalImage(post) {
  const source = join(imageDir, post.image);
  const target = join(storageRoot, creatorId, "media", post.mediaId, "asset");
  await mkdir(dirname(target), { recursive: true });
  try { await copyFile(source, target, constants.COPYFILE_EXCL); }
  catch (error) { if (error?.code !== "EEXIST") throw error; }
  if (digest(await readFile(source)) !== digest(await readFile(target))) {
    console.warn(`Kept edited local demo image: ${post.mediaId}`);
  }
}

try {
  // Files are staged without overwriting existing bytes. Database rows commit together.
  for (const post of posts) await stageLocalImage(post);
  const result = await client.$transaction(async (tx) => {
    const [account, campaign, tenant] = await Promise.all([
      tx.account.findUnique({ where: { emailNorm: avaAccount.email.toLowerCase() }, select: { primaryRelayCreatorId: true } }),
      tx.campaign.findUnique({ where: { id: ava.campaignId }, select: { creatorId: true } }),
      tx.tenant.findUnique({ where: { relayCreatorId: creatorId }, select: { id: true } })
    ]);
    if (account?.primaryRelayCreatorId !== creatorId || campaign?.creatorId !== creatorId || !tenant) {
      throw new Error("Seed the pilot Ava account and campaign first; no demo rows were written.");
    }
    const [existingPosts, existingMedia, existingWorks, existingSeries] = await Promise.all([
      tx.post.findMany({ where: { id: { in: posts.map((p) => p.id) } }, select: { id: true, creatorId: true } }),
      tx.mediaAsset.findMany({ where: { id: { in: posts.map((p) => p.mediaId) } }, select: { id: true, creatorId: true } }),
      tx.creativeWork.findMany({ where: { id: { in: works.map((w) => w.id) } }, select: { id: true, creatorId: true } }),
      tx.creativeSeries.findMany({ where: { id: series.id }, select: { id: true, creatorId: true } })
    ]);
    const existing = [...existingPosts, ...existingMedia, ...existingWorks, ...existingSeries];
    if (existing.some((row) => row.creatorId !== creatorId)) throw new Error("A demo ID belongs to another creator; refusing to modify it.");
    if (existing.length) return { created: false, count: existing.length };

    const createdAt = new Date("2026-10-01T12:00:00.000Z");
    await tx.creativeSeries.create({ data: { id: series.id, creatorId, title: series.title } });
    for (const work of works) {
      await tx.creativeWork.create({ data: { id: work.id, creatorId, title: work.title, titleMode: work.titleMode, isDefaultBundle: false } });
      if (work.partLabel) await tx.creativeSeriesMember.create({ data: {
        id: `ce_demo_series_member_${work.sortOrder + 1}`, creatorId, creativeSeriesId: series.id,
        creativeWorkId: work.id, partLabel: work.partLabel, sortOrder: work.sortOrder
      } });
    }
    for (const post of posts) {
      await tx.post.create({ data: {
        id: post.id, creatorId, campaignId: ava.campaignId, source: "RELAY", upstreamStatus: "active",
        publishState: "published", isPublic: true, createdAt,
        versions: { create: { id: post.versionId, versionSeq: 1, upstreamRevision: "ce-demo-v1",
          title: post.sourceTitle, description: `Gallery editor demo: ${post.tags.join(", ")}.`, publishedAt: createdAt,
          ingestedAt: createdAt, tagIds: post.tags, tierIds: [], mediaIds: [post.mediaId] } }
      } });
      await tx.mediaAsset.create({ data: {
        id: post.mediaId, creatorId, postIds: [post.id], primaryPostId: post.id,
        upstreamStatus: "active", currentVersionSeq: 1, currentUpstreamRevision: "ce-demo-v1",
        currentMimeType: "image/png", currentStorageKey: `media/${post.mediaId}/asset`, currentIngestedAt: createdAt,
        versionsJson: [], ingestOrigin: "RELAY_UPLOAD", processingStatus: "READY"
      } });
      await tx.creativeWorkMember.create({ data: { id: post.memberId, creatorId, postId: post.id,
        creativeWorkId: post.workId, variantRole: post.key.endsWith("teaser") ? "teaser" : "full", sortOrder: post.order } });
      await tx.postPresentation.create({ data: { creatorId, postId: post.id, titleMode: post.mode,
        relayTitle: post.mode === "custom" ? post.customTitle : null } });
    }
    return { created: true, count: posts.length };
  }, { isolationLevel: "Serializable", timeout: 60000 });
  console.log(`gallery-editor-demo: ${result.created ? "created" : "already present; preserved existing edits"} (${result.count} ${result.created ? "posts" : "matching rows"})`);
  console.log(`Creator: ${creatorId} (pilot Ava; /login/pilot-ux)`);
  console.log("Guided goal: rename work ‘Green study — Part 1’ to ‘Meadow study’; check main and teaser inherit it, while the custom close-up and Part 2 stay unchanged. Undo restores the original names and modes.");
  console.log("Then try an open-ended request: organize the green posts, inspect a thumbnail, or adjust tags. Review the cart before Apply.");
} finally {
  await client.$disconnect();
}
