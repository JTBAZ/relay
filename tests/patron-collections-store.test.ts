import { mkdir, mkdtemp, readFile, rename, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePatronCollectionsStore } from "../src/gallery/patron-collections-store.js";

describe("FilePatronCollectionsStore", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["create", "edit", "delete", "remove"] as const)(
    "does not save after failed reads during %s, and preserves other patrons on recovery", async (operation) => {
      const dir = await mkdtemp(join(tmpdir(), "relay-pcol-mutate-read-"));
      const path = join(dir, "pc.json");
      const store = new FilePatronCollectionsStore(path);
      const mine = await store.createCollection("c1", "u1", "Mine");
      const theirs = await store.createCollection("c2", "u2", "Theirs");
      await store.addEntry("c1", "u1", mine.collection_id, "p1", "m1");
      await store.addEntry("c2", "u2", theirs.collection_id, "p2", "m2");
      const original = await readFile(path, "utf8");
      const originalRoot = await store.load({ strict: true });
      const mutate = {
        create: () => store.createCollection("c1", "u1", "New"),
        edit: () => store.updateCollection("c1", "u1", mine.collection_id, { title: "Edited" }),
        delete: () => store.deleteCollection("c1", "u1", mine.collection_id),
        remove: () => store.removeEntry("c1", "u1", mine.collection_id, "p1", "m1")
      }[operation];
      const save = vi.spyOn(store, "save");
      for (const contents of ["not-json", '{"collections":[],"entries":null}', '{"collections":[{}],"entries":[]}']) {
        await writeFile(path, contents);
        await expect(mutate()).rejects.toThrow();
        expect(save).not.toHaveBeenCalled();
        expect(await readFile(path, "utf8")).toBe(contents);
        await writeFile(path, original);
        expect(await store.load({ strict: true })).toEqual(originalRoot);
      }
      const backup = join(dir, "original.json");
      await rename(path, backup);
      await mkdir(path);
      try {
        await expect(mutate()).rejects.toThrow();
        expect(save).not.toHaveBeenCalled();
        expect(await readFile(backup, "utf8")).toBe(original);
      } finally {
        await rmdir(path);
        await rename(backup, path);
      }
      expect(await readFile(path, "utf8")).toBe(original);
      expect(await mutate()).toBeTruthy();
      expect(save).toHaveBeenCalledTimes(1);
      const recovered = await store.load({ strict: true });
      expect(recovered.collections.find(c => c.collection_id === theirs.collection_id))
        .toEqual(originalRoot.collections.find(c => c.collection_id === theirs.collection_id));
      expect(recovered.entries.filter(e => e.user_id === "u2")).toEqual(originalRoot.entries.filter(e => e.user_id === "u2"));
    }
  );

  it.each(["not-json", '{"collections":[],"entries":null}', '{"collections":[{}],"entries":[]}'])(
    "rejects corrupt collection data in reconciliation reads (%s)", async (contents) => {
      const dir = await mkdtemp(join(tmpdir(), "relay-pcol-corrupt-"));
      const path = join(dir, "pc.json");
      const store = new FilePatronCollectionsStore(path);
      await writeFile(path, contents);
      await expect(store.getCollectionWithEntriesForUser("u1", "col1")).rejects.toThrow();
      await expect(store.addEntry("c1", "u1", "col1", "p1", "m1")).rejects.toThrow();
    }
  );

  it("propagates unreadable storage in save/detail paths while preserving legacy reads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-pcol-unreadable-"));
    const path = join(dir, "pc.json");
    await mkdir(path);
    const store = new FilePatronCollectionsStore(path);
    await expect(store.getCollectionWithEntriesForUser("u1", "col1")).rejects.toThrow();
    await expect(store.addEntry("c1", "u1", "col1", "p1", "m1")).rejects.toThrow();
    await expect(store.load()).resolves.toEqual({ collections: [], entries: [] });
  });

  it("returns null for a missing collection file or a collection outside the caller scope", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-pcol-absent-"));
    const store = new FilePatronCollectionsStore(join(dir, "pc.json"));
    expect(await store.getCollectionWithEntriesForUser("u1", "missing")).toBeNull();
    expect(await store.addEntry("c1", "u1", "missing", "p1", "m1")).toBeNull();
    const col = await store.createCollection("c1", "u1", "Mine");
    expect(await store.addEntry("c1", "u2", col.collection_id, "p1", "m1")).toBeNull();
    expect(await store.addEntry("c2", "u1", col.collection_id, "p1", "m1")).toBeNull();
    expect((await store.load()).entries).toHaveLength(0);
  });

  it("creates collections, adds entries, dedupes same media in same collection, allows same media in two collections", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-pcol-"));
    const store = new FilePatronCollectionsStore(join(dir, "pc.json"));

    const a = await store.createCollection("c1", "u1", "Characters");
    const b = await store.createCollection("c1", "u1", "Landscapes");
    expect(a.title).toBe("Characters");

    const e1 = await store.addEntry("c1", "u1", a.collection_id, "p1", "m1");
    expect(e1?.media_id).toBe("m1");
    const e1b = await store.addEntry("c1", "u1", a.collection_id, "p1", "m1");
    expect(e1b?.entry_id).toBe(e1?.entry_id);

    await store.addEntry("c1", "u1", b.collection_id, "p1", "m1");

    const listed = await store.listCollectionsWithEntries("c1", "u1");
    expect(listed).toHaveLength(2);
    const chars = listed.find((x) => x.title === "Characters")!;
    expect(chars.entries).toHaveLength(1);

    const snipped = await store.listSnippedMediaIds("c1", "u1");
    expect(snipped.has("m1")).toBe(true);

    const ok = await store.removeEntry("c1", "u1", a.collection_id, "p1", "m1");
    expect(ok).toBe(true);
    const listed2 = await store.listCollectionsWithEntries("c1", "u1");
    const chars2 = listed2.find((x) => x.title === "Characters")!;
    expect(chars2.entries).toHaveLength(0);
  });

  it("deleteCollection removes entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-pcol-"));
    const store = new FilePatronCollectionsStore(join(dir, "pc.json"));
    const col = await store.createCollection("c1", "u1", "X");
    await store.addEntry("c1", "u1", col.collection_id, "p1", "m1");
    expect(await store.deleteCollection("c1", "u1", col.collection_id)).toBe(true);
    expect(await store.listCollectionsWithEntries("c1", "u1")).toHaveLength(0);
  });

  it("listAllCollectionsWithEntries returns every collection for a membership across creators", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-pcol-"));
    const store = new FilePatronCollectionsStore(join(dir, "pc.json"));
    const a = await store.createCollection("creator-a", "u1", "A set");
    const b = await store.createCollection("creator-b", "u1", "B set");
    await store.addEntry("creator-a", "u1", a.collection_id, "p1", "m1");
    await store.createCollection("creator-a", "u2", "Other patron");

    const all = await store.listAllCollectionsWithEntries("u1");
    expect(all.map((c) => c.title).sort()).toEqual(["A set", "B set"]);
    expect(all.find((c) => c.collection_id === a.collection_id)?.entries).toHaveLength(1);
  });

  it("getCollectionWithEntriesForUser scopes by owner membership", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-pcol-"));
    const store = new FilePatronCollectionsStore(join(dir, "pc.json"));
    const col = await store.createCollection("c1", "u1", "Mine");
    await store.addEntry("c1", "u1", col.collection_id, "p1", "m1");
    await store.createCollection("c1", "u2", "Theirs");

    const owned = await store.getCollectionWithEntriesForUser("u1", col.collection_id);
    expect(owned?.title).toBe("Mine");
    expect(owned?.entries).toHaveLength(1);

    expect(await store.getCollectionWithEntriesForUser("u2", col.collection_id)).toBeNull();
    expect(await store.getCollectionWithEntriesForUser("u1", "missing")).toBeNull();
  });
});
