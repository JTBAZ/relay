import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FilePatronFavoritesStore } from "../src/gallery/patron-favorites-store.js";

describe("FilePatronFavoritesStore", () => {
  it("adds, lists, removes; add is idempotent per user/creator/kind/id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-pfav-"));
    const path = join(dir, "favorites.json");
    const store = new FilePatronFavoritesStore(path);

    expect(await store.listForUser("c1", "u1")).toEqual([]);

    const a1 = await store.add({
      user_id: "u1",
      creator_id: "c1",
      target_kind: "media",
      target_id: "m1"
    });
    expect(a1.target_id).toBe("m1");
    expect(a1.created_at).toMatch(/^\d{4}-/);

    const a1b = await store.add({
      user_id: "u1",
      creator_id: "c1",
      target_kind: "media",
      target_id: "m1"
    });
    expect(a1b.created_at).toBe(a1.created_at);

    await store.add({
      user_id: "u1",
      creator_id: "c1",
      target_kind: "post",
      target_id: "p1"
    });

    const list = await store.listForUser("c1", "u1");
    expect(list).toHaveLength(2);
    expect(list.map((x) => `${x.target_kind}:${x.target_id}`).sort()).toEqual([
      "media:m1",
      "post:p1"
    ]);

    const ok = await store.remove("c1", "u1", "media", "m1");
    expect(ok).toBe(true);
    expect((await store.listForUser("c1", "u1")).map((x) => x.target_id)).toEqual(["p1"]);

    expect(await store.remove("c1", "u1", "media", "m1")).toBe(false);
  });

  it("isolates users and creators", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-pfav-"));
    const store = new FilePatronFavoritesStore(join(dir, "f.json"));
    await store.add({
      user_id: "u1",
      creator_id: "c1",
      target_kind: "media",
      target_id: "m1"
    });
    await store.add({
      user_id: "u2",
      creator_id: "c1",
      target_kind: "media",
      target_id: "m1"
    });
    await store.add({
      user_id: "u1",
      creator_id: "c2",
      target_kind: "media",
      target_id: "m1"
    });

    expect(await store.listForUser("c1", "u1")).toHaveLength(1);
    expect(await store.listForUser("c1", "u2")).toHaveLength(1);
    expect(await store.listForUser("c2", "u1")).toHaveLength(1);
  });
});
