/**
 * Gate F regression (PILOT-012) — hidden-post overrides must survive concurrent writes.
 *
 * Root cause: `DbGalleryOverridesStore` mutators used full-table read-modify-write
 * (`load()` → mutate → `save()` = global `deleteMany({})` + recreate). Two concurrent
 * override writes raced and the loser's rows — including `visibility=hidden` — were
 * silently dropped, so a creator-hidden post reappeared in the patron feed.
 * The store now performs row-scoped, field-scoped atomic upserts; this test fires
 * mixed concurrent writes and asserts no row or field is ever lost.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { GalleryVisibility } from "@prisma/client";
import { DbGalleryOverridesStore } from "../src/gallery/overrides-store-db.js";
import { prisma } from "../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const CREATOR_ID = `gatef_race_${randomUUID().slice(0, 8)}`;

describe.skipIf(!hasDatabaseUrl)("DbGalleryOverridesStore — concurrent write safety (Gate F)", () => {
  afterAll(async () => {
    await prisma.postOverride.deleteMany({ where: { creatorId: CREATOR_ID } });
  });

  it("hide override survives concurrent tag merges and other visibility writes", async () => {
    const store = new DbGalleryOverridesStore(prisma);

    for (let round = 0; round < 3; round++) {
      const p = (n: number) => `gatef_post_${round}_${n}`;
      const m = (n: number) => `gatef_media_${round}_${n}`;

      await store.setVisibility(CREATOR_ID, [p(1)], "hidden");

      // Old implementation: each of these rewrote the whole table from a
      // pre-concurrency snapshot — the hide row from above (or each other's
      // rows) got dropped. New implementation: row-scoped upserts, no loss.
      await Promise.all([
        store.mergePostTagDelta(CREATOR_ID, p(2), { add_tag_ids: ["alpha"], remove_tag_ids: [] }),
        store.setVisibility(CREATOR_ID, [p(3)], "hidden"),
        store.mergeBulkMediaTagDelta(
          CREATOR_ID,
          [{ post_id: p(4), media_id: m(1) }],
          { add_tag_ids: ["beta"], remove_tag_ids: [] }
        ),
        store.setMediaVisibility(CREATOR_ID, [
          { post_id: p(5), media_id: m(2), visibility: "hidden" }
        ])
      ]);

      const rows = await prisma.postOverride.findMany({ where: { creatorId: CREATOR_ID } });
      const byKey = new Map(rows.map((r) => [`${r.postId}\0${r.mediaId}`, r]));

      expect(byKey.get(`${p(1)}\0`)?.visibility).toBe(GalleryVisibility.hidden);
      expect(byKey.get(`${p(3)}\0`)?.visibility).toBe(GalleryVisibility.hidden);
      expect(byKey.get(`${p(2)}\0`)?.addTagIds).toContain("alpha");
      expect(byKey.get(`${p(4)}\0${m(1)}`)?.addTagIds).toContain("beta");
      expect(byKey.get(`${p(5)}\0${m(2)}`)?.visibility).toBe(GalleryVisibility.hidden);
    }
  }, 60_000);

  it("tag merge on a hidden post's own row does not clear its visibility", async () => {
    const store = new DbGalleryOverridesStore(prisma);
    const postId = "gatef_field_isolation_post";

    await store.setVisibility(CREATOR_ID, [postId], "hidden");
    await store.mergePostTagDelta(CREATOR_ID, postId, {
      add_tag_ids: ["gamma"],
      remove_tag_ids: []
    });

    const row = await prisma.postOverride.findUnique({
      where: { creatorId_postId_mediaId: { creatorId: CREATOR_ID, postId, mediaId: "" } }
    });
    expect(row?.visibility).toBe(GalleryVisibility.hidden);
    expect(row?.addTagIds).toContain("gamma");

    // And the reverse: re-hiding does not clobber tags.
    await store.setVisibility(CREATOR_ID, [postId], "visible");
    const after = await prisma.postOverride.findUnique({
      where: { creatorId_postId_mediaId: { creatorId: CREATOR_ID, postId, mediaId: "" } }
    });
    expect(after?.visibility).toBe(GalleryVisibility.visible);
    expect(after?.addTagIds).toContain("gamma");
  }, 30_000);
});
