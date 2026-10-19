import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { GalleryEditorService } from "../src/gallery-editor/service.js";
import { loadPostNaming } from "../src/gallery-editor/naming.js";
import { searchLibraryPosts } from "../src/gallery-editor/context.js";
import { editorHistoryReader } from "../src/gallery-editor/routes.js";
import { confirmMergeCreativeWorkBundle, linkCreativeWorkMembers, splitCreativeWorkMember } from "../src/analytics/creative-work-bundling-service.js";
import { defaultCreativeWorkIdForPost } from "../src/analytics/creative-work-service.js";
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
      await db.tenant.deleteMany({ where: { relayCreatorId: creator } });
      await db.tenant.deleteMany({where:{relayCreatorId:creator}});
    }
  });
  afterAll(async () => { await db?.$disconnect(); });

  it('merges compiled patches against the transaction cart, preserving manual provenance and rejecting stale revisions',async()=>{
    const manual:EditAction={id:'manual',kind:'rename_post',postId:customPost,title:'Manual exception'};
    const original=await draft([manual]);
    const ai:EditAction={id:'ai',kind:'rename_work',workId,title:'Compiled name'};
    const patch={revision:original.cart.revision,changes:[{kind:'add' as const,action:ai}]};
    const next=await editor.revise(creatorId,actorId,original.id,original.revision,[],undefined,[{role:'user',text:'Rename this work'},{role:'assistant',text:'UNTRUSTED MODEL CLAIM'}],'ai',{patch,factualPreview:true});
    expect(next.cart.actions).toEqual([manual,ai]);
    expect(next.cart.actionOrigins).toEqual({manual:'manual',ai:'ai'});
    expect(next.messages.at(-1)?.text).toContain('No Library changes have been applied');
    expect(next.messages.at(-1)?.text).not.toContain('UNTRUSTED MODEL CLAIM');
    expect((await db.creativeWork.findUniqueOrThrow({where:{id:workId}})).title).toBe('Original work');
    await expect(editor.revise(creatorId,actorId,original.id,original.revision,[],undefined,undefined,'ai',{patch,factualPreview:true})).rejects.toMatchObject({code:'STALE_CART'});
    const receipt=await editor.apply(creatorId,actorId,next.id,next.revision,newId());
    expect(receipt.summary).toContain('Applied:');
    const undone=await editor.undo(creatorId,actorId,receipt.id);
    expect(undone.summary).toContain('Undone:');
    expect((await db.creativeWork.findUniqueOrThrow({where:{id:workId}})).title).toBe('Original work');
  });

  it.each(["merge","link","split"] as const)("legacy manual %s preserves displayed names, journals mode changes, and supports Undo",async operation=>{
    await db.tenant.create({data:{relayCreatorId:creatorId}});
    await commit([{id:"canonical",kind:"rename_work",workId,title:"Shared canonical title"}]);
    const original=await db.creativeWorkMember.findUniqueOrThrow({where:{postId:postA}});
    if(operation==="merge"){
      const target=newId();await db.creativeWork.create({data:{id:target,creatorId,title:"Other work"}});
      expect((await confirmMergeCreativeWorkBundle(db,creatorId,{actorId,sourcePostId:postA,targetCreativeWorkId:target})).ok).toBe(true);
    }else if(operation==="link"){
      expect((await linkCreativeWorkMembers(db,creatorId,{actorId,title:"Linked work",members:[{postId:postA},{postId:customPost}]})).ok).toBe(true);
    }else expect((await splitCreativeWorkMember(db,creatorId,postA,{actorId})).ok).toBe(true);
    expect((await loadPostNaming(db,creatorId))[postA]).toMatchObject({mode:"custom",effectiveTitle:"Shared canonical title"});
    const current=await editor.create(creatorId,actorId,{selectedPostIds:[postA]});
    const receipt=current.lastReceipt!;
    const journal=await db.galleryEditorCommit.findUniqueOrThrow({where:{id:receipt.id}});
    expect(journal.scope).toBe(`manual_work_${operation}_preserve_titles`);
    expect(journal.actions).toEqual(expect.arrayContaining([expect.objectContaining({kind:"link_work_post",postId:postA,titleMode:"custom",customTitle:"Shared canonical title"})]));
    await editor.undo(creatorId,actorId,receipt.id);
    expect((await loadPostNaming(db,creatorId))[postA]).toMatchObject({mode:"inherit_work",effectiveTitle:"Shared canonical title"});
    expect(await db.creativeWorkMember.findUniqueOrThrow({where:{postId:postA}})).toEqual(original);
  });

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

  it("journals an Inspect Save rename and exposes its receipt to old and new sessions before Undo", async () => {
    const prior = await editor.create(creatorId, actorId, { selectedPostIds: [postB] });
    const sourceTitle = `Source ${postA}`;
    const result = await editor.applyManualPresentation(creatorId, actorId, postA, {
      titleMode: "custom", relayTitle: "Saved from Inspect", relayDescription: "<p>Artist note</p>"
    });
    expect(result.presentation).toMatchObject({ postId: postA, titleMode: "custom", relayTitle: "Saved from Inspect", relayDescription: "<p>Artist note</p>" });
    const journal = await db.galleryEditorCommit.findUniqueOrThrow({ where: { id: result.receipt.id } });
    expect(journal).toMatchObject({ creatorId, actorId, origin: "manual", scope: "post_presentation" });
    expect(journal.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "rename_post", postId: postA, title: "Saved from Inspect" })
    ]));
    expect(journal.actions).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "source_post_title" })]));
    expect((await editor.read(creatorId, actorId, prior.id)).lastReceipt?.id).toBe(result.receipt.id);
    const fresh = await editor.create(creatorId, actorId, { selectedPostIds: [] });
    expect(fresh.lastReceipt?.id).toBe(result.receipt.id);
    expect((await loadPostNaming(db, creatorId))[postA].effectiveTitle).toBe("Saved from Inspect");
    const undone = await editor.undo(creatorId, actorId, result.receipt.id);
    expect(undone.reversedAt).toBeTruthy();
    expect(await db.postPresentation.findUnique({ where: { postId: postA } })).toBeNull();
    expect((await loadPostNaming(db, creatorId))[postA].effectiveTitle).toBe(sourceTitle);
    expect((await editor.read(creatorId, actorId, fresh.id)).lastReceipt?.reversedAt).toBeTruthy();
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

  it("searches current and historical composed series titles containing quotes", async () => {
    const seriesId = newId();
    const oldTitle = 'O\'Brien\'s "Field" Notes';
    const newTitle = 'New "Field" Notes';
    const partLabel = "Part I";
    await commit([
      { id: "series", kind: "create_series", seriesId, title: oldTitle },
      { id: "link", kind: "link_series_work", seriesId, workId, partLabel, titleMode: "inherit_series", sortOrder: 0 },
      { id: "inherit", kind: "inherit_post_title", postId: postA }
    ]);
    const history = editorHistoryReader(db);
    const oldComposed = `${oldTitle} — ${partLabel}`;
    const current = await searchLibraryPosts(db, creatorId, oldComposed, { history });
    expect(current.items.map(item => item.postId)).toContain(postA);
    expect(current.matches).toContainEqual({ postId: postA, matchedTitle: oldComposed, provenance: "current" });
    await commit([{ id: "rename", kind: "rename_series", seriesId, title: newTitle }]);
    const newComposed = `${newTitle} — ${partLabel}`;
    const renamed = await searchLibraryPosts(db, creatorId, newComposed, { history });
    expect(renamed.matches).toContainEqual({ postId: postA, matchedTitle: newComposed, provenance: "current" });
    const historical = await searchLibraryPosts(db, creatorId, oldComposed, { history });
    expect(historical.items.map(item => item.postId)).toContain(postA);
    expect(historical.matches).toContainEqual({ postId: postA, matchedTitle: oldComposed, provenance: "historical" });
    const other = await otherCreator();
    expect((await searchLibraryPosts(db, other.creator, oldComposed, { history })).items).toEqual([]);
  });

  it("mixed presentation, tags and collection edits commit in one journal and safely undo", async () => {
    const collectionId = newId();
    const session = await draft([
      { id: "rename", kind: "rename_post", postId: postA, title: "Curated" },
      { id: "description", kind: "set_description", postId: postA, description: "<p>Clean</p><script>bad()</script>" },
      { id: "tags", kind: "tags", postId: postA, add: ["curated"], remove: [] },
      { id: "collection", kind: "create_collection", collectionId, title: "New collection" },
      { id: "member", kind: "collection_membership", collectionId, postIds: [postA, postB], operation: "add" },
      { id: "order", kind: "reorder_collection", collectionId, postIds: [postB, postA] }
    ]);
    const postItem = session.cart.items.find(i => i.targetType === "post" && i.targetId === postA)!;
    expect(postItem.before).toMatchObject({ titleMode: "source", tags: [], collectionIds: [] });
    expect(postItem.after).toMatchObject({ title: "Curated", titleMode: "custom", description: "<p>Clean</p>", tags: ["curated"], collectionIds: [collectionId] });
    const receipt = await editor.apply(creatorId, actorId, session.id, 1, newId());
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

  it("Undo after reparenting cannot overwrite later edits to the old family", async () => {
    const destination = newId();
    await db.creativeWork.create({ data: { id: destination, creatorId, title: "Destination" } });
    const receipt = await commit([{ id: "move", kind: "link_work_post", postId: postA, workId: destination, titleMode: "inherit_work", sortOrder: 0 }]);
    await db.creativeWork.update({ where: { id: workId }, data: { title: "Old family edited later" } });
    await expect(editor.undo(creatorId, actorId, receipt.id)).rejects.toMatchObject({ code: "STALE_PREVIEW" });
    expect((await db.creativeWork.findUniqueOrThrow({ where: { id: workId } })).title).toBe("Old family edited later");
    expect((await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: postA } })).creativeWorkId).toBe(destination);
    expect(await db.galleryEditorCommit.count({ where: { creatorId, reversalOfId: receipt.id } })).toBe(0);
  });

  it("shows destination siblings in a reparent preview without changing their titles", async () => {
    const destination = newId();
    await db.creativeWork.create({ data: { id: destination, creatorId, title: "Destination work" } });
    const destinationSibling = await seedPost(creatorId, campaignId, destination);
    await db.postPresentation.create({ data: { creatorId, postId: destinationSibling, titleMode: "inherit_work" } });
    const session = await draft([{ id: "move", kind: "link_work_post", postId: postA, workId: destination, titleMode: "inherit_work", sortOrder: 1 }]);
    const sibling = session.cart.items.find(item => item.targetType === "post" && item.targetId === destinationSibling);
    expect(sibling).toMatchObject({ related: true, before: { title: "Destination work" }, after: { title: "Destination work" } });
    expect(session.cart.items.find(item => item.targetType === "post" && item.targetId === postA)?.after).toMatchObject({ title: "Destination work", workId: destination });
    expect((await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: postA } })).creativeWorkId).toBe(workId);
  });

  it("links an unbundled post atomically and Undo restores its absent membership", async () => {
    await db.tenant.create({ data: { id: newId(), relayCreatorId: creatorId } });
    await db.creativeWorkMember.delete({ where: { postId: postA } });
    const failedDb = db.$extends({ query: { galleryEditorCommit: { async create({ args, query }) {
      if (args.data.creatorId === creatorId) throw new Error("Injected bundle journal failure");
      return query(args);
    } } } });
    await expect(linkCreativeWorkMembers(failedDb as unknown as PrismaClient, creatorId, {
      actorId, members: [{ postId: postA, isCover: true }, { postId: postB }]
    })).rejects.toThrow("Injected bundle journal failure");
    expect(await db.creativeWorkMember.findUnique({ where: { postId: postA } })).toBeNull();
    expect((await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: postB } })).creativeWorkId).toBe(workId);
    expect(await db.creativeWork.count({ where: { creatorId } })).toBe(1);
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(0);

    const linked = await linkCreativeWorkMembers(db, creatorId, {
      actorId, members: [{ postId: postA, isCover: true }, { postId: postB }]
    });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    const receipt = await db.galleryEditorCommit.findFirstOrThrow({ where: { creatorId, scope: "manual_work_link_preserve_titles" } });
    expect((await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: postA } })).creativeWorkId).toBe(linked.result.creative_work_id);
    await editor.undo(creatorId, actorId, receipt.id);
    expect(await db.creativeWorkMember.findUnique({ where: { postId: postA } })).toBeNull();
    expect((await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: postB } })).creativeWorkId).toBe(workId);
    expect(await db.creativeWork.findUnique({ where: { id: linked.result.creative_work_id } })).toBeNull();
  });

  it("splits into a fresh work when the deterministic default is occupied and leaves its family intact", async () => {
    await db.tenant.create({ data: { id: newId(), relayCreatorId: creatorId } });
    await db.postPresentation.create({ data: { creatorId, postId: postA, titleMode: "inherit_work" } });
    const occupiedId = defaultCreativeWorkIdForPost(postA);
    await db.creativeWork.create({ data: { id: occupiedId, creatorId, title: "Occupant family" } });
    const occupant = await seedPost(creatorId, campaignId, occupiedId);
    const split = await splitCreativeWorkMember(db, creatorId, postA, { actorId });
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.result.creative_work_id).not.toBe(occupiedId);
    expect((await db.creativeWork.findUniqueOrThrow({ where: { id: split.result.creative_work_id } })).title).toBe("Original work");
    expect((await loadPostNaming(db, creatorId))[postA].effectiveTitle).toBe("Original work");
    expect((await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: occupant } })).creativeWorkId).toBe(occupiedId);
    const receipt = await db.galleryEditorCommit.findFirstOrThrow({ where: { creatorId, scope: "manual_work_split_preserve_titles" } });
    await editor.undo(creatorId, actorId, receipt.id);
    expect((await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: postA } })).creativeWorkId).toBe(workId);
    expect((await db.creativeWorkMember.findUniqueOrThrow({ where: { postId: occupant } })).creativeWorkId).toBe(occupiedId);
    expect((await db.creativeWork.findUniqueOrThrow({ where: { id: occupiedId } })).title).toBe("Occupant family");
  });

  it("journals both source and destination family closure for a manual merge", async () => {
    await db.tenant.create({ data: { id: newId(), relayCreatorId: creatorId } });
    const destination = newId();
    await db.creativeWork.create({ data: { id: destination, creatorId, title: "Destination" } });
    const sibling = await seedPost(creatorId, campaignId, destination);
    await db.postPresentation.create({ data: { creatorId, postId: postA, titleMode: "inherit_work" } });
    const merged = await confirmMergeCreativeWorkBundle(db, creatorId, { actorId, sourcePostId: postA, targetCreativeWorkId: destination });
    expect(merged.ok).toBe(true);
    const receipt = await db.galleryEditorCommit.findFirstOrThrow({ where: { creatorId, scope: "manual_work_merge_preserve_titles" } });
    const before = receipt.before as unknown as { scope: { posts: string[]; works: string[] } };
    expect(before.scope.posts).toEqual(expect.arrayContaining([postA, postB, sibling]));
    expect(before.scope.works).toEqual(expect.arrayContaining([workId, destination]));
    expect((await loadPostNaming(db, creatorId))[postA].effectiveTitle).toBe("Original work");
    await db.postPresentation.create({ data: { creatorId, postId: sibling, titleMode: "custom", relayTitle: "Later destination edit" } });
    await expect(editor.undo(creatorId, actorId, receipt.id)).rejects.toMatchObject({ code: "STALE_PREVIEW" });
  });

  it("cart exposes changed part label and ordering even when the work row stays inherited", async () => {
    const seriesId = newId();
    await commit([
      { id: "series", kind: "create_series", seriesId, title: "Series" },
      { id: "link", kind: "link_series_work", seriesId, workId, partLabel: "Old part", titleMode: "inherit_series", sortOrder: 1 }
    ]);
    const session = await draft([{ id: "relabel", kind: "link_series_work", seriesId, workId, partLabel: "New part", titleMode: "inherit_series", sortOrder: 4 }]);
    const item = session.cart.items.find(i => i.targetType === "work" && i.targetId === workId)!;
    expect(item.before).toMatchObject({ title: "Series — Old part", seriesId, partLabel: "Old part", sortOrder: 1 });
    expect(item.after).toMatchObject({ title: "Series — New part", seriesId, partLabel: "New part", sortOrder: 4 });
    expect((await db.creativeSeriesMember.findUniqueOrThrow({ where: { creativeWorkId: workId } })).partLabel).toBe("Old part");
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

  it("concurrent sessions cannot commit competing previews for the same post", async () => {
    const first = await draft([{ id: "first", kind: "rename_post", postId: postA, title: "First proposal" }]);
    const second = await draft([{ id: "second", kind: "rename_post", postId: postA, title: "Second proposal" }]);
    // Hold both real database transactions after reading the absent overlay.
    // This exercises PostgreSQL's unique-insert race deterministically.
    let readers = 0, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const timeout = setTimeout(release, 2000);
    const synchronizedDb = db.$extends({ query: { postPresentation: { async findMany({ args, query }) {
      const rows = await query(args);
      if (args.where?.creatorId === creatorId && readers < 2) {
        readers += 1; if (readers === 2) release(); await gate;
      }
      return rows;
    } } } });
    const concurrentEditor = new GalleryEditorService(synchronizedDb as unknown as PrismaClient);
    const results = await Promise.allSettled([
      concurrentEditor.apply(creatorId, actorId, first.id, 1, newId()), concurrentEditor.apply(creatorId, actorId, second.id, 1, newId())
    ]);
    clearTimeout(timeout);
    expect(readers).toBe(2);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "STALE_PREVIEW" });
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
