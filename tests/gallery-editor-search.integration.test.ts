import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { searchLibraryPosts } from "../src/gallery-editor/context.js";

// Deliberate local-only opt-in; the normal DATABASE_URL is never used.
const databaseUrl = process.env.GALLERY_EDITOR_TEST_DATABASE_URL?.trim();
if (databaseUrl && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Library search integration tests require an explicit local test database.");
}
describe.skipIf(!databaseUrl)("Library effective metadata search — PostgreSQL", () => {
  let db: PrismaClient;
  let creatorId: string, otherCreatorId: string;
  const campaigns = new Map<string, string>();
  const freshId = () => `ce_search_${randomUUID()}`;
  async function seedPost(creator: string, tags: string[] = [], description = "Neutral description", previousTags?: string[], previousDescription?: string) {
    const id = freshId();
    await db.post.create({ data: {
      id, creatorId: creator, campaignId: campaigns.get(creator)!, upstreamStatus: "active", source: "PATREON", createdAt: new Date(),
      versions: { create: [
        ...(previousTags || previousDescription ? [{ versionSeq: 1, upstreamRevision: "old", title: "Earlier neutral title", description: previousDescription, tagIds: previousTags ?? [], ingestedAt: new Date() }] : []),
        { versionSeq: 2, upstreamRevision: "current", title: "Current neutral title", description, tagIds: tags, ingestedAt: new Date() }
      ] }
    } });
    return id;
  }
  beforeAll(() => { db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) }); });
  beforeEach(async () => {
    creatorId = freshId(); otherCreatorId = freshId();
    for (const creator of [creatorId, otherCreatorId]) {
      const campaign = freshId(); campaigns.set(creator, campaign);
      await db.campaign.create({ data: { id: campaign, creatorId: creator, name: "Search fixture", upstreamUpdatedAt: new Date(), versionSeq: 1 } });
    }
  });
  afterEach(async () => {
    for (const [creator, campaign] of campaigns) {
      await db.postOverride.deleteMany({ where: { creatorId: creator } });
      await db.post.deleteMany({ where: { creatorId: creator } });
      await db.campaign.deleteMany({ where: { id: campaign } });
    }
    campaigns.clear();
  });
  afterAll(async () => { await db?.$disconnect(); });

  it("uses latest effective tags, respects post-level add/remove deltas, and pages only the owning creator", async () => {
    const source = await seedPost(creatorId, ["coast"]);
    const added = await seedPost(creatorId);
    const removed = await seedPost(creatorId, ["coast"]);
    const historicalOnly = await seedPost(creatorId, [], "Neutral description", ["coast"]);
    const foreignDelta = await seedPost(creatorId);
    const mediaOnly = await seedPost(creatorId);
    const restored = await seedPost(creatorId, ["coast"]);
    const otherPost = await seedPost(otherCreatorId, ["coast"]);
    await db.postOverride.createMany({ data: [
      { creatorId, postId: added, addTagIds: ["Coast"], removeTagIds: [] },
      { creatorId, postId: removed, addTagIds: [], removeTagIds: ["coast"] },
      { creatorId: otherCreatorId, postId: foreignDelta, addTagIds: ["coast"] },
      { creatorId, postId: mediaOnly, mediaId: "media-only", addTagIds: ["coast"] },
      { creatorId, postId: restored, addTagIds: ["coast"], removeTagIds: ["coast"] }
    ] });
    // TransactionClient executes the exact same read path as the ordinary Prisma client.
    const first = await db.$transaction((tx) => searchLibraryPosts(tx, creatorId, "COAST", { limit: 2 }));
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(first.complete).toBe(false);
    expect(first.hasMore).toBe(true);
    const last = await searchLibraryPosts(db, creatorId, "COAST", { limit: 2, cursor: first.nextCursor! });
    expect(last.hasMore).toBe(false);
    expect(last.nextCursor).toBeNull();
    const returned = [...first.items, ...last.items];
    expect(returned.map((post) => post.postId).sort()).toEqual([source, added, restored].sort());
    expect(returned.every((post) => post.tags.some((tag) => tag.toLowerCase() === "coast"))).toBe(true);
    expect(returned.some((post) => [removed, historicalOnly, foreignDelta, mediaOnly, otherPost].includes(post.postId))).toBe(false);
    expect(first.matches).toEqual([]); // A tag match never impersonates historical naming evidence.
    await expect(searchLibraryPosts(db, otherCreatorId, "COAST", { cursor: first.nextCursor! })).rejects.toMatchObject({ code: "invalid_cursor" });
  });

  it("searches current descriptions while respecting replaced/cleared Relay overrides and ownership", async () => {
    const source = await seedPost(creatorId, [], "<p>Marshland notes</p>");
    const relay = await seedPost(creatorId);
    const cleared = await seedPost(creatorId, [], "Marshland source");
    const replaced = await seedPost(creatorId, [], "Marshland source");
    await seedPost(creatorId, [], "Neutral current description", [], "Marshland historical notes");
    const foreignOverlay = await seedPost(creatorId);
    await seedPost(otherCreatorId, [], "Marshland private notes");
    await db.postPresentation.createMany({ data: [
      { creatorId, postId: relay, relayDescription: "<p>Marshland artist note</p>" },
      { creatorId, postId: cleared, relayDescription: "" },
      { creatorId, postId: replaced, relayDescription: "Different artist note" }
    ] });
    // The composite ownership FK rejects cross-creator overlays before retrieval can see them.
    await expect(db.postPresentation.create({ data: {
      creatorId: otherCreatorId, postId: foreignOverlay, relayDescription: "Marshland foreign override"
    } })).rejects.toMatchObject({ code: "P2003" });
    const result = await searchLibraryPosts(db, creatorId, "marshland");
    expect(result.total).toBe(2);
    expect(result.complete).toBe(true);
    expect(result.items.map((post) => post.postId).sort()).toEqual([source, relay].sort());
    expect(result.items.every((post) => post.description?.toLowerCase().includes("marshland"))).toBe(true);
    expect(result.matches).toEqual([]);
  });

  it("treats percent and underscore in metadata searches as literal user text", async () => {
    const literal = await seedPost(creatorId, ["coast_100%"]);
    await seedPost(creatorId, ["coastX1000"]);
    await seedPost(otherCreatorId, ["coast_100%"]);
    const result = await searchLibraryPosts(db, creatorId, "coast_100%");
    expect(result.total).toBe(1);
    expect(result.items.map((post) => post.postId)).toEqual([literal]);
  });
});
