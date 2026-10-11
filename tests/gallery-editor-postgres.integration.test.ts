import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { GalleryEditorService } from "../src/gallery-editor/service.js";
import { loadPostNaming } from "../src/gallery-editor/naming.js";
import type { EditAction } from "../src/gallery-editor/types.js";

// Never run against the ordinary DATABASE_URL. This suite requires deliberate
// opt-in and only permits a local database; every fixture has a random partition.
const databaseUrl = process.env.GALLERY_EDITOR_TEST_DATABASE_URL?.trim();
if (databaseUrl && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Gallery editor integration tests require an explicit local test database.");
}

describe.skipIf(!databaseUrl)("Gallery editor — PostgreSQL atomic execution", () => {
  let db: PrismaClient;
  let editor: GalleryEditorService;
  let creatorId: string, actorId: string, campaignId: string, workId: string, postA: string, postB: string, customPost: string;
  const newId = () => `ce_it_${randomUUID()}`;
  const fixtureCreators: string[] = [];

  async function seedPost(creator: string, campaign: string, work?: string, custom?: string) {
    const id = newId();
    await db.post.create({ data: {
      id, creatorId: creator, campaignId: campaign, upstreamStatus: "active", source: "PATREON", createdAt: new Date(),
      versions: { create: { versionSeq: 1, upstreamRevision: "upstream-1", title: `Source ${id}`, publishedAt: new Date(), ingestedAt: new Date(), mediaIds: [], tagIds: [], tierIds: [] } }
    } });
    if (work) await db.creativeWorkMember.create({ data: { id: newId(), creatorId: creator, creativeWorkId: work, postId: id, variantRole: "full" } });
    if (custom) await db.postPresentation.create({ data: { creatorId: creator, postId: id, titleMode: "custom", relayTitle: custom } });
    return id;
  }
  async function draft(actions: EditAction[]) {
    const session = await editor.create(creatorId, actorId, { selectedPostIds: [postA] });
    return editor.revise(creatorId, actorId, session.id, 0, actions);
  }
  async function commit(actions: EditAction[]) {
    const session = await draft(actions);
    return editor.apply(creatorId, actorId, session.id, session.revision, newId());
  }
  async function otherCreator() {
    const creator = newId(), campaign = newId(); fixtureCreators.push(creator);
    await db.campaign.create({ data: { id: campaign, creatorId: creator, name: "Other fixture", upstreamUpdatedAt: new Date(), versionSeq: 1 } });
    return { creator, campaign, post: await seedPost(creator, campaign) };
  }
  beforeAll(() => { db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) }); editor = new GalleryEditorService(db); });
  beforeEach(async () => {
    creatorId = newId(); actorId = newId(); campaignId = newId(); workId = newId(); fixtureCreators.push(creatorId);
    await db.campaign.create({ data: { id: campaignId, creatorId, name: "Editor fixture", upstreamUpdatedAt: new Date(), versionSeq: 1 } });
    await db.creativeWork.create({ data: { id: workId, creatorId, title: "Original work" } });
    postA = await seedPost(creatorId, campaignId, workId);
    postB = await seedPost(creatorId, campaignId, workId);
    customPost = await seedPost(creatorId, campaignId, workId, "Special edition");
  });
  afterEach(async () => {
    // Delete journal reversals first because they restrict deletion of originals.
    for (const creator of fixtureCreators.splice(0)) {
      await db.galleryEditorCommit.deleteMany({ where: { creatorId: creator, reversalOfId: { not: null } } });
      await db.galleryEditorCommit.deleteMany({ where: { creatorId: creator } });
      await db.galleryEditorSession.deleteMany({ where: { creatorId: creator } });
      await db.libraryCollection.deleteMany({ where: { creatorId: creator } });
      await db.postOverride.deleteMany({ where: { creatorId: creator } });
      await db.post.deleteMany({ where: { creatorId: creator } });
      await db.creativeWork.deleteMany({ where: { creatorId: creator } });
      await db.creativeSeries.deleteMany({ where: { creatorId: creator } });
      await db.campaign.deleteMany({ where: { creatorId: creator } });
    }
  });
  afterAll(async () => { await db?.$disconnect(); });

  it("preview writes only the session; family commit inherits source titles and preserves custom exceptions", async () => {
    const sourceVersions = await db.postVersion.findMany({ where: { postId: { in: [postA, postB, customPost] } } });
    const session = await draft([{ id: "rename", kind: "rename_work", workId, title: "Renamed family" }]);
    expect(session.cart.items.filter(i => i.targetType === "post")).toHaveLength(3);
    expect(await db.postPresentation.count({ where: { creatorId } })).toBe(1);
    expect((await db.creativeWork.findUniqueOrThrow({ where: { id: workId } })).title).toBe("Original work");
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(0);
    const receipt = await editor.apply(creatorId, actorId, session.id, 1, newId());
    expect(receipt.affectedPostIds.sort()).toEqual([postA, postB].sort());
    expect(receipt.preservedExceptions).toEqual([customPost]);
    const names = await loadPostNaming(db, creatorId);
    expect(names[postA]).toMatchObject({ mode: "inherit_work", effectiveTitle: "Renamed family" });
    expect(names[customPost]).toMatchObject({ mode: "custom", effectiveTitle: "Special edition" });
    expect(await db.postVersion.findMany({ where: { postId: { in: [postA, postB, customPost] } } })).toEqual(sourceVersions);
  });

  it("explicit post rename is affected and is not counted as a preserved exception", async () => {
    const receipt = await commit([{ id: "rename", kind: "rename_post", postId: customPost, title: "New special title" }]);
    expect(receipt.affectedPostIds).toContain(customPost);
    expect(receipt.preservedExceptions).not.toContain(customPost);
    expect((await loadPostNaming(db, creatorId))[customPost].effectiveTitle).toBe("New special title");
  });

  it("creates a series with ordered part labels and resolves the live inherited title", async () => {
    const seriesId = newId();
    await commit([
      { id: "series", kind: "create_series", seriesId, title: "Collected tales" },
      { id: "link", kind: "link_series_work", seriesId, workId, partLabel: "Part II", titleMode: "inherit_series", sortOrder: 1 },
      { id: "inherit", kind: "inherit_post_title", postId: postA }
    ]);
    expect((await loadPostNaming(db, creatorId))[postA]).toMatchObject({ effectiveTitle: "Collected tales — Part II", seriesId, partLabel: "Part II" });
    await commit([{ id: "rename", kind: "rename_series", seriesId, title: "Renamed tales" }]);
    expect((await loadPostNaming(db, creatorId))[postA].effectiveTitle).toBe("Renamed tales — Part II");
    expect((await db.creativeSeriesMember.findUniqueOrThrow({ where: { creativeWorkId: workId } })).sortOrder).toBe(1);
  });

  it("mixed presentation, tags and collection edits commit in one journal and safely undo", async () => {
    const collectionId = newId();
    const receipt = await commit([
      { id: "rename", kind: "rename_post", postId: postA, title: "Curated" },
      { id: "description", kind: "set_description", postId: postA, description: "<p>Clean</p><script>bad()</script>" },
      { id: "tags", kind: "tags", postId: postA, add: ["curated"], remove: [] },
      { id: "collection", kind: "create_collection", collectionId, title: "New collection" },
      { id: "member", kind: "collection_membership", collectionId, postIds: [postA, postB], operation: "add" },
      { id: "order", kind: "reorder_collection", collectionId, postIds: [postB, postA] }
    ]);
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(1);
    expect((await db.postPresentation.findUniqueOrThrow({ where: { postId: postA } })).relayDescription).toBe("<p>Clean</p>");
    expect((await db.postOverride.findFirstOrThrow({ where: { creatorId, postId: postA } })).addTagIds).toEqual(["curated"]);
    expect((await db.collectionPost.findMany({ where: { collectionId }, orderBy: { sortIndex: "asc" } })).map(p => p.postId)).toEqual([postB, postA]);
    const undo = await editor.undo(creatorId, actorId, receipt.id);
    expect(undo.reversedAt).toBeTruthy();
    expect(await db.postPresentation.findUnique({ where: { postId: postA } })).toBeNull();
    expect(await db.libraryCollection.findUnique({ where: { id: collectionId } })).toBeNull();
    expect(await db.postOverride.count({ where: { creatorId } })).toBe(0);
    expect(await db.galleryEditorCommit.count({ where: { creatorId, reversalOfId: receipt.id } })).toBe(1);
    expect(await editor.undo(creatorId, actorId, receipt.id)).toEqual(undo);
  });

  it("invalid multi-action proposal rolls back its session revision and artist writes", async () => {
    const session = await editor.create(creatorId, actorId, { selectedPostIds: [postA] });
    await expect(editor.revise(creatorId, actorId, session.id, 0, [
      { id: "valid", kind: "rename_post", postId: postA, title: "Valid" },
      { id: "invalid", kind: "reorder_media", postId: postA, mediaIds: [newId()] }
    ])).rejects.toMatchObject({ code: "INVALID_MEDIA" });
    expect((await editor.read(creatorId, actorId, session.id)).revision).toBe(0);
    expect(await db.postPresentation.findUnique({ where: { postId: postA } })).toBeNull();
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(0);
  });

  it("rolls actual artist writes back if durable journal insertion fails", async () => {
    const session = await draft([{ id: "rename", kind: "rename_work", workId, title: "Must roll back" }]);
    let journalReached = false;
    const failingDb = db.$extends({ query: { galleryEditorCommit: { async create({ args, query }) {
      if (args.data.creatorId === creatorId) { journalReached = true; throw new Error("Injected journal write failure"); }
      return query(args);
    } } } });
    await expect(new GalleryEditorService(failingDb as unknown as PrismaClient).apply(creatorId, actorId, session.id, 1, newId())).rejects.toThrow("Injected journal write failure");
    expect(journalReached).toBe(true);
    expect((await db.creativeWork.findUniqueOrThrow({ where: { id: workId } })).title).toBe("Original work");
    expect(await db.postPresentation.findUnique({ where: { postId: postA } })).toBeNull();
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(0);
    expect((await editor.read(creatorId, actorId, session.id)).revision).toBe(1);
  });

  it("Undo restores original work membership and removes newly created naming parents", async () => {
    const replacementWork = newId(), seriesId = newId();
    await db.creativeWork.create({ data: { id: replacementWork, creatorId, title: "Other work" } });
    const original = await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: postA } });
    const receipt = await commit([
      { id: "series", kind: "create_series", seriesId, title: "New series" },
      { id: "work", kind: "link_series_work", seriesId, workId: replacementWork, partLabel: "Chapter", titleMode: "inherit_series", sortOrder: 0 },
      { id: "post", kind: "link_work_post", workId: replacementWork, postId: postA, titleMode: "inherit_work", memberLabel: "New page", sortOrder: 2 }
    ]);
    expect((await loadPostNaming(db, creatorId))[postA].effectiveTitle).toBe("New series — Chapter");
    await editor.undo(creatorId, actorId, receipt.id);
    expect(await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: postA } })).toEqual(original);
    expect(await db.creativeSeries.findUnique({ where: { id: seriesId } })).toBeNull();
    expect(await db.creativeSeriesMember.findUnique({ where: { creativeWorkId: replacementWork } })).toBeNull();
    expect((await db.creativeWork.findUniqueOrThrow({ where: { id: replacementWork } })).titleMode).toBe("independent");
  });

  it("same-key concurrent Apply returns one receipt and one atomic journal", async () => {
    const session = await draft([{ id: "rename", kind: "rename_work", workId, title: "Once" }]), key = newId();
    const receipts = await Promise.all([
      editor.apply(creatorId, actorId, session.id, 1, key),
      editor.apply(creatorId, actorId, session.id, 1, key)
    ]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(1);
    expect((await editor.read(creatorId, actorId, session.id)).revision).toBe(2);
    expect(await editor.apply(creatorId, actorId, session.id, 1, key)).toEqual(receipts[0]);
    await expect(editor.apply(creatorId, actorId, session.id, 2, key)).rejects.toMatchObject({ code: "KEY_REUSED" });
  });

  it("two distinct keys cannot both consume the same cart revision", async () => {
    const session = await draft([{ id: "rename", kind: "rename_post", postId: postA, title: "Single revision" }]);
    const results = await Promise.allSettled([
      editor.apply(creatorId, actorId, session.id, 1, newId()), editor.apply(creatorId, actorId, session.id, 1, newId())
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "STALE_CART" });
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(1);
  });

  it("new family members invalidate the preview and prevent partial Apply", async () => {
    const session = await draft([{ id: "rename", kind: "rename_work", workId, title: "Stale" }]);
    await seedPost(creatorId, campaignId, workId);
    await expect(editor.apply(creatorId, actorId, session.id, 1, newId())).rejects.toMatchObject({ code: "STALE_PREVIEW" });
    expect((await db.creativeWork.findUniqueOrThrow({ where: { id: workId } })).title).toBe("Original work");
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(0);
  });

  it("Undo refuses to overwrite later manual edits or a new family child", async () => {
    const receipt = await commit([{ id: "rename", kind: "rename_work", workId, title: "Committed" }]);
    await db.postPresentation.update({ where: { postId: postA }, data: { titleMode: "custom", relayTitle: "Later manual title" } });
    await expect(editor.undo(creatorId, actorId, receipt.id)).rejects.toMatchObject({ code: "STALE_PREVIEW" });
    expect((await loadPostNaming(db, creatorId))[postA].effectiveTitle).toBe("Later manual title");
    expect(await db.galleryEditorCommit.count({ where: { creatorId, reversalOfId: receipt.id } })).toBe(0);
    const second = await commit([{ id: "rename2", kind: "rename_work", workId, title: "Committed again" }]);
    await seedPost(creatorId, campaignId, workId);
    await expect(editor.undo(creatorId, actorId, second.id)).rejects.toMatchObject({ code: "STALE_PREVIEW" });
    expect((await db.creativeWork.findUniqueOrThrow({ where: { id: workId } })).title).toBe("Committed again");
  });

  it("enforces creator/actor ownership in sessions, actions and relational naming links", async () => {
    const other = await otherCreator();
    const session = await draft([{ id: "rename", kind: "rename_post", postId: postA, title: "Owned" }]);
    await expect(editor.read(other.creator, actorId, session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(editor.apply(creatorId, newId(), session.id, 1, newId())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(editor.revise(creatorId, actorId, session.id, 1, [{ id: "cross", kind: "rename_post", postId: other.post, title: "Cross tenant" }])).rejects.toMatchObject({ code: "INVALID_TARGET" });
    await expect(db.creativeWorkMember.create({ data: { id: newId(), creatorId, creativeWorkId: workId, postId: other.post } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.postPresentation.create({ data: { creatorId, postId: other.post, titleMode: "custom", relayTitle: "Private" } })).rejects.toMatchObject({ code: "P2003" });
    const foreignSeries = newId();
    await db.creativeSeries.create({ data: { id: foreignSeries, creatorId: other.creator, title: "Foreign" } });
    await expect(db.creativeSeriesMember.create({ data: { id: newId(), creatorId, creativeSeriesId: foreignSeries, creativeWorkId: workId, partLabel: "Part" } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("database constraints enforce one naming series per work and valid part ordering", async () => {
    const first = newId(), second = newId();
    await db.creativeSeries.createMany({ data: [{ id: first, creatorId, title: "One" }, { id: second, creatorId, title: "Two" }] });
    await expect(db.creativeSeriesMember.create({ data: { id: newId(), creatorId, creativeSeriesId: first, creativeWorkId: workId, partLabel: " ", sortOrder: 0 } })).rejects.toBeTruthy();
    await expect(db.creativeSeriesMember.create({ data: { id: newId(), creatorId, creativeSeriesId: first, creativeWorkId: workId, partLabel: "Part", sortOrder: -1 } })).rejects.toBeTruthy();
    await db.creativeSeriesMember.create({ data: { id: newId(), creatorId, creativeSeriesId: first, creativeWorkId: workId, partLabel: "Part", sortOrder: 0 } });
    await expect(db.creativeSeriesMember.create({ data: { id: newId(), creatorId, creativeSeriesId: second, creativeWorkId: workId, partLabel: "Part", sortOrder: 0 } })).rejects.toMatchObject({ code: "P2002" });
  });
});
