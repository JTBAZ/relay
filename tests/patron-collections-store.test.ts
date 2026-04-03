import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FilePatronCollectionsStore } from "../src/gallery/patron-collections-store.js";

describe("FilePatronCollectionsStore", () => {
  it("creates collections, adds entries, dedupes same media in same collection, allows same media in two collections", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-pcol-"));
    const store = new FilePatronCollectionsStore(join(dir, "pc.json"));

    const a = await store.createCollection("c1", "u1", "Characters");
    const b = await store.createCollection("c1", "u1", "Landscapes");
    expect(a.title).toBe("Characters");

    const e1 = await store.addEntry("c1", "u1", a.collection_id, "p1", "m1");
    expect(e1.media_id).toBe("m1");
    const e1b = await store.addEntry("c1", "u1", a.collection_id, "p1", "m1");
    expect(e1b.entry_id).toBe(e1.entry_id);

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
});
