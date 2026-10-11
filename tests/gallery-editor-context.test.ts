import { describe, expect, it, vi } from "vitest";
vi.mock("../src/gallery-editor/naming.js", async (importOriginal) => ({ ...await importOriginal<typeof import("../src/gallery-editor/naming.js")>(), loadPostNaming: vi.fn(async () => ({})) }));
import {
  expandLibraryFamily, LibraryReadBudget, readLibraryCollections, readLibraryCollectionPosts, readLibraryMedia,
  resolveLibraryImageReferences, resolveLibraryPosts, retrieveLibraryThumbnails,
  searchLibraryPosts, type LibraryReadClient
} from "../src/gallery-editor/context.js";

type RecordRow = Record<string, any>;
function fixture() {
  const posts = Array.from({ length: 130 }, (_, i) => ({ id: `p${String(i).padStart(3, "0")}`, creatorId: "alice",
    versions: [{ title: `Current ${i}`, description: "<p>Original</p>", mediaIds: ["m1", "m2"], tagIds: ["original"], versionSeq: 2 },
      { title: i >= 125 ? "Old shared title" : `Previous ${i}`, versionSeq: 1 }], workId: i < 3 ? "work1" : null }));
  posts.push({ id: "secret", creatorId: "bob", versions: [{ title: "Old shared title", versionSeq: 1 }] } as typeof posts[number]);
  const records: Record<string, RecordRow[]> = {
    post: posts, postPresentation: [{ creatorId: "alice", postId: "p000", relayTitle: "Curated", relayDescription: "", mediaOrder: ["m2", "m1"] }],
    postOverride: [{ creatorId: "alice", postId: "p000", mediaId: "", addTagIds: ["added"], removeTagIds: ["original"] }],
    creativeWork: [{ id: "work1", creatorId: "alice" }, { id: "work2", creatorId: "bob" }],
    creativeWorkMember: [{ creatorId: "alice", postId: "p000", creativeWorkId: "work1" }],
    creativeSeries: [{ id: "series1", creatorId: "alice" }, { id: "series2", creatorId: "bob" }], creativeSeriesMember: [],
    libraryCollection: [{ id: "collection", creatorId: "alice", title: "Owned", posts: [{ postId: "p000" }, { postId: "secret" }], _count: { posts: 2 } }],
    collectionPost: [], mediaAsset: [
      { id: "m1", creatorId: "alice", postIds: ["p000", "secret"], primaryPostId: "p000", currentMimeType: "image/png", currentStorageKey: "relay/tenants/alice/media/m1/asset", processingStatus: "READY" },
      { id: "m2", creatorId: "alice", postIds: ["p000"], currentMimeType: "image/png", currentStorageKey: "https://premium.example/private.png", processingStatus: "READY", currentUpstreamUrl: "http://localhost/admin" },
      { id: "m3", creatorId: "alice", postIds: [], currentMimeType: "image/svg+xml", currentStorageKey: "media/m3/asset", processingStatus: "READY" },
      { id: "secret-media", creatorId: "bob", currentMimeType: "image/png", currentStorageKey: "media/secret-media/asset", processingStatus: "READY" }
    ]
  };
  function contains(value: string, filter: RecordRow): boolean { return value.toLowerCase().includes(filter.contains.toLowerCase()); }
  function match(row: RecordRow, where: RecordRow = {}): boolean {
    if (where.creatorId && row.creatorId !== where.creatorId) return false;
    if (where.id && typeof where.id === "string" && row.id !== where.id) return false;
    if (where.id?.in && !where.id.in.includes(row.id)) return false;
    if (where.postId?.in && !where.postId.in.includes(row.postId)) return false;
    if (typeof where.postId === "string" && row.postId !== where.postId) return false;
    if (typeof where.mediaId === "string" && row.mediaId !== where.mediaId) return false;
    if (where.OR && !where.OR.some((q: RecordRow) => q.id?.contains ? contains(row.id, q.id) : q.id?.in ? q.id.in.includes(row.id) : q.versions ? row.versions.some((v: RecordRow) => contains(v.title, q.versions.some.title)) : false)) return false;
    if (where.creativeWorkMember && !where.OR) {
      const filter = where.creativeWorkMember.is;
      if (filter.creativeWorkId?.in && !filter.creativeWorkId.in.includes(row.workId)) return false;
      if (filter.creativeWork?.is?.seriesMember && row.workId !== "work1") return false;
    }
    return true;
  }
  const client = Object.fromEntries(Object.entries(records).map(([name, data]) => [name, {
    findMany: vi.fn(async (args: RecordRow) => {
      const filtered = data.filter((row) => match(row, args.where)).sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
      return filtered.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? filtered.length)).map((row) => {
        if (name === "post" && args.select?.versions) {
          const v = args.select.versions;
          const versions = row.versions.filter((version: RecordRow) => !v.where?.title || contains(version.title, v.where.title)).sort((a: RecordRow, b: RecordRow) => b.versionSeq - a.versionSeq).slice(0, v.take ?? row.versions.length);
          return { ...row, versions };
        }
        return row;
      });
    }), count: vi.fn(async (args: RecordRow) => data.filter((row) => match(row, args.where)).length)
  }]));
  client.$queryRawUnsafe = vi.fn(async (query: string, collectionId: string, creatorId: string, limit?: number, offset?: number) => {
    const collection = records.libraryCollection.find((c) => c.id === collectionId && c.creatorId === creatorId);
    const owned = collection ? collection.posts.map((p: RecordRow) => p.postId).filter((id: string) => records.post.some((p) => p.id === id && p.creatorId === creatorId)) : [];
    return query.includes("COUNT(*)") ? [{ total: BigInt(owned.length) }] : owned.slice(offset ?? 0, (offset ?? 0) + (limit ?? owned.length)).map((postId: string) => ({ postId }));
  });
  return { db: client as unknown as LibraryReadClient, client: client as Record<string, { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }>, records };
}

describe("Library context retrieval", () => {
  it("paginates beyond the UI first page with scoped totals and cursor binding", async () => {
    const { db, client } = fixture();
    const first = await searchLibraryPosts(db, "alice", "", { limit: 100 });
    expect(first.total).toBe(130);
    expect(first.items).toHaveLength(100);
    expect(first.complete).toBe(false);
    const second = await searchLibraryPosts(db, "alice", "", { cursor: first.nextCursor! });
    expect(second.items.map((p) => p.postId)).toContain("p129");
    expect(second.hasMore).toBe(false);
    expect(second.complete).toBe(false);
    expect(second.items).toHaveLength(30);
    await expect(searchLibraryPosts(db, "bob", "", { cursor: first.nextCursor! })).rejects.toMatchObject({ code: "invalid_cursor" });
    await expect(searchLibraryPosts(db, "alice", "changed", { cursor: first.nextCursor! })).rejects.toMatchObject({ code: "invalid_cursor" });
    expect(client.post.count).toHaveBeenCalledWith({ where: { creatorId: "alice" } });
  });

  it("resolves latest source, merged descriptions/order/tags, naming provenance and missing scope", async () => {
    const { db } = fixture();
    const result = await resolveLibraryPosts(db, "alice", ["p000", "secret", "absent"], { resolveNaming: async () => ({ p000: { mode: "inherit_work", effectiveTitle: "Series: Part One", sourceTitle: "Current 0", workId: "work1", seriesId: "series1", exception: false } }) });
    expect(result.resolvedPosts).toEqual([expect.objectContaining({ postId: "p000", title: "Series: Part One", description: null, mediaIds: ["m2", "m1"], tags: ["added"], naming: expect.objectContaining({ mode: "inherit_work" }) })]);
    expect(result.missingPostIds).toEqual(["secret", "absent"]);
  });

  it("finds historical titles across the whole catalog and reports ambiguity", async () => {
    const { db } = fixture();
    const history = { search: vi.fn(async () => [{ postId: "p002", matchedTitle: "Old shared title", provenance: "historical" as const }, { postId: "secret", matchedTitle: "Old shared title", provenance: "historical" as const }]) };
    const result = await searchLibraryPosts(db, "alice", "Old shared title", { history });
    expect(result.total).toBe(6);
    expect(result.ambiguous).toBe(true);
    expect(result.items.map((p) => p.postId)).toEqual(["p002", "p125", "p126", "p127", "p128", "p129"]);
    expect(result.matches).toContainEqual({ postId: "p125", matchedTitle: "Old shared title", provenance: "historical" });
    expect(result.matches.some((m) => m.postId === "secret")).toBe(false);
    expect(history.search).toHaveBeenCalledWith("alice", "Old shared title");
    expect(result.historicalRelayTitlesAvailable).toBe(true);
    expect((await searchLibraryPosts(db, "alice", "Old shared title")).historicalRelayTitlesAvailable).toBe(false);
  });

  it("expands exact owned work families and rejects cross-creator target IDs", async () => {
    const { db, client, records } = fixture();
    const family = await expandLibraryFamily(db, "alice", { kind: "work", id: "work1" }, { limit: 2 });
    expect(family.total).toBe(3);
    expect(family.items.map((p) => p.postId)).toEqual(["p000", "p001"]);
    expect(family.complete).toBe(false);
    expect((await expandLibraryFamily(db, "alice", { kind: "work", id: "work1" }, { cursor: family.nextCursor! })).items.map((p) => p.postId)).toEqual(["p002"]);
    await expect(expandLibraryFamily(db, "alice", { kind: "work", id: "work2" })).rejects.toMatchObject({ code: "not_found" });
    await expect(expandLibraryFamily(db, "alice", { kind: "series", id: "series2" })).rejects.toMatchObject({ code: "not_found" });
    await expect(expandLibraryFamily(db, "alice", { kind: "post", id: "secret" })).rejects.toMatchObject({ code: "not_found" });
    records.creativeSeriesMember.push({ creatorId: "alice", creativeWorkId: "work1", creativeSeriesId: "series1" });
    const series = await expandLibraryFamily(db, "alice", { kind: "post", id: "p000" });
    expect(series.seriesId).toBe("series1");
    expect(client.post.count).toHaveBeenLastCalledWith({ where: expect.objectContaining({ creatorId: "alice", creativeWorkMember: { is: expect.objectContaining({ creatorId: "alice", creativeWork: { is: expect.objectContaining({ creatorId: "alice", seriesMember: { is: expect.objectContaining({ creativeSeries: { is: { id: "series1", creatorId: "alice" } } }) } }) } }) } }) });
  });

  it("rechecks ownership on collection and media links", async () => {
    const { db } = fixture();
    const collections = await readLibraryCollections(db, "alice");
    expect(collections.items[0].postIds).toEqual(["p000"]);
    expect(collections.items[0].membershipComplete).toBe(false);
    const media = await readLibraryMedia(db, "alice", ["m1", "secret-media"]);
    expect(media.items[0].postIds).toEqual(["p000"]);
    expect(media.missingMediaIds).toEqual(["secret-media"]);
  });

  it("pages exact owned collection membership with bound SQL parameters", async () => {
    const { db, client, records } = fixture();
    records.libraryCollection[0].posts.push({ postId: "p001" });
    const first = await readLibraryCollectionPosts(db, "alice", "collection", { limit: 1 });
    expect(first.total).toBe(2);
    expect(first.items.map((p) => p.postId)).toEqual(["p000"]);
    const second = await readLibraryCollectionPosts(db, "alice", "collection", { limit: 1, cursor: first.nextCursor! });
    expect(second.items.map((p) => p.postId)).toEqual(["p001"]);
    expect(second.hasMore).toBe(false);
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("p.creator_id = $2 AND c.creator_id = $2"), "collection", "alice", 1, 1);
    await expect(readLibraryCollectionPosts(db, "bob", "collection")).rejects.toMatchObject({ code: "not_found" });
  });

  it("limits every turn cumulatively and rejects oversized requests", async () => {
    const { db } = fixture();
    const budget = new LibraryReadBudget();
    await searchLibraryPosts(db, "alice", "", { limit: 100, budget });
    await expect(resolveLibraryPosts(db, "alice", ["p000"], { budget })).rejects.toMatchObject({ code: "context_limit" });
    await expect(searchLibraryPosts(db, "alice", "", { limit: 101 })).rejects.toMatchObject({ code: "invalid_limit" });
    await expect(resolveLibraryImageReferences(db, "alice", Array.from({ length: 25 }, (_, i) => `m${i}`))).rejects.toMatchObject({ code: "context_limit" });
    const imageBudget = new LibraryReadBudget();
    for (let i = 0; i < 24; i++) await resolveLibraryImageReferences(db, "alice", ["m1"], { budget: imageBudget });
    await expect(resolveLibraryImageReferences(db, "alice", ["m1"], { budget: imageBudget })).rejects.toMatchObject({ code: "image_limit" });
  });

  it("reports unsafe/external and unsupported images without fetching any URL", async () => {
    const { db } = fixture();
    const result = await resolveLibraryImageReferences(db, "alice", ["m1", "m2", "m3", "secret-media", "http://localhost/private"]);
    expect(result.images).toEqual([{ mediaId: "m1", thumbnailPath: "/api/v1/export/media/alice/m1/thumb" }]);
    expect(result.unsupported).toEqual(expect.arrayContaining([{ mediaId: "m2", reason: "owned_storage_unavailable" }, { mediaId: "m3", reason: "unsupported_image_type" }, { mediaId: "secret-media", reason: "not_found" }]));
    const reader = vi.fn(async () => Buffer.from("invalid image"));
    await retrieveLibraryThumbnails(db, "alice", ["m2", "secret-media"], reader);
    expect(reader).not.toHaveBeenCalled();
    const bytes = await retrieveLibraryThumbnails(db, "alice", ["m1"], reader);
    expect(reader).toHaveBeenCalledWith({ creatorId: "alice", mediaId: "m1", storageKey: "relay/tenants/alice/media/m1/asset", maxBytes: 40 * 1024 * 1024 });
    expect(bytes.unsupported).toContainEqual({ mediaId: "m1", reason: "unsupported_image_bytes" });
  });
});
