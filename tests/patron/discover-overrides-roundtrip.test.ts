import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileGalleryOverridesStore } from "../../src/gallery/overrides-store.js";

/**
 * PE-F (BO-P3-01) — verify the file-backed override store round-trips `discovery_eligible`
 * (set/load/save -> read again). DB-backed parity is enforced by the shared interface +
 * `flattenRoot`/`rootFromRows` helpers; an integration test against Supabase is out of scope
 * for this unit suite.
 */
describe("FileGalleryOverridesStore — discovery_eligible round-trip", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "relay-pef-overrides-"));
    path = join(dir, "gallery_post_overrides.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("setDiscoveryEligible(true) persists the flag and surfaces it on the next load", async () => {
    const store = new FileGalleryOverridesStore(path);
    await store.setDiscoveryEligible("c1", "p1", true);
    const reloaded = await new FileGalleryOverridesStore(path).load();
    expect(reloaded.creators.c1?.posts.p1?.discovery_eligible).toBe(true);
  });

  it("setDiscoveryEligible(false) drops the flag (does not store false explicitly)", async () => {
    const store = new FileGalleryOverridesStore(path);
    await store.setDiscoveryEligible("c1", "p1", true);
    await store.setDiscoveryEligible("c1", "p1", false);
    const reloaded = await new FileGalleryOverridesStore(path).load();
    expect(reloaded.creators.c1?.posts.p1?.discovery_eligible).toBeUndefined();
  });

  it("does not clobber existing tag deltas / visibility on the same post", async () => {
    const store = new FileGalleryOverridesStore(path);
    await store.mergePostTagDelta("c1", "p1", {
      add_tag_ids: ["nature"],
      remove_tag_ids: ["nsfw"]
    });
    await store.setVisibility("c1", ["p1"], "review");
    await store.setDiscoveryEligible("c1", "p1", true);
    const reloaded = await new FileGalleryOverridesStore(path).load();
    const slot = reloaded.creators.c1?.posts.p1;
    expect(slot?.add_tag_ids).toEqual(["nature"]);
    expect(slot?.remove_tag_ids).toEqual(["nsfw"]);
    expect(slot?.visibility).toBe("review");
    expect(slot?.discovery_eligible).toBe(true);
  });
});
