import { describe, expect, it } from "vitest";
import { resolveCreatorCommandContext } from "../../../src/studio/command/creator-context.js";
import { loadCommandLibraryItemsFromDb } from "../../../src/studio/command/library-items-from-db.js";
import { searchLibrary, type CommandLibraryItem } from "../../../src/studio/command/selection.js";
import { assertSelectionRevision } from "../../../src/studio/command/selection-snapshot.js";
import { PILOT_DEV_AVA_CREATOR_ID, uniquePostIds } from "../../../src/studio/eval/command-selection-probe.js";
import { commandLibraryItemsFromLab2Corpus } from "../../../src/studio/eval/library-items-from-corpus.js";
import { STUDIO_LAB2_CREATOR_ID, loadStudioLab2Corpus } from "../../../src/studio/lab2/corpus-spec.js";
import { prisma } from "../../../src/lib/db.js";
import type { PrismaClient } from "@prisma/client";
import type { GalleryItem } from "../../../src/gallery/types.js";

function item(overrides: Partial<CommandLibraryItem> = {}): CommandLibraryItem {
  const base: GalleryItem = {
    media_id: overrides.media_id ?? "media_1",
    post_id: overrides.post_id ?? "post_1",
    title: overrides.title ?? "Standalone study",
    published_at: overrides.published_at ?? "2026-03-01T00:00:00.000Z",
    tag_ids: overrides.tag_ids ?? [],
    tier_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "/x",
    preview_url_path: "/p",
    thumb_url_path: "/t",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: []
  };
  return { ...base, ...overrides };
}

describe("P5 exit selection tests (RC-P5-T06)", () => {
  it("Lab 2 destination-absent X skips already-posted Hero Academy pages", () => {
    const items = commandLibraryItemsFromLab2Corpus(loadStudioLab2Corpus());
    const { selection } = searchLibrary(items, {
      title_contains: "Hero Academy",
      destination_absent: ["x"]
    });
    expect(selection.complete).toBe(true);
    expect(selection.post_ids.length).toBeGreaterThan(0);
    const posted = searchLibrary(items, {
      title_contains: "Hero Academy",
      destination_present: ["x"]
    });
    for (const id of posted.selection.post_ids) {
      expect(selection.post_ids).not.toContain(id);
    }
  });

  it("stale snapshot compare fails closed with COMMAND_STALE_SELECTION", () => {
    const { selection } = searchLibrary(
      [
        item({ post_id: "a", media_id: "ma", published_at: "2026-04-01T00:00:00.000Z" }),
        item({ post_id: "b", media_id: "mb", published_at: "2026-03-01T00:00:00.000Z" })
      ],
      {},
      { creator_id: "cr_a" }
    );
    expect(selection.complete).toBe(true);
    expect(() => assertSelectionRevision(selection.revision, selection.post_ids)).not.toThrow();
    expect(() => assertSelectionRevision(selection.revision, ["a"])).toThrow(
      expect.objectContaining({ code: "COMMAND_STALE_SELECTION" })
    );
  });

  it("foreign creator_id mismatch is 403; Ava catalog never returns Lab 2 ids", async () => {
    const mine = item({ post_id: "ava_1", media_id: "ava_m1", title: "Ava post" });
    const { selection } = searchLibrary([mine], { q: "Hero Academy" }, { creator_id: "rcx_pilot_dev_ava" });
    expect(selection.complete).toBe(true);
    expect(selection.post_ids).toEqual([]);

    await expect(
      resolveCreatorCommandContext({
        prisma: {} as PrismaClient,
        account: { accountId: "acc_ava", primaryRelayCreatorId: "rcx_pilot_dev_ava" },
        requestedCreatorId: "rcx_studio_lab2"
      })
    ).rejects.toMatchObject({
      code: "COMMAND_FORBIDDEN"
    });
  });
});

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabaseUrl)("P5 tenant isolation (seeded DB)", () => {
  it("Lab 2 and Dev Ava loaders return disjoint post ids", async () => {
    const lab2 = await loadCommandLibraryItemsFromDb(prisma, STUDIO_LAB2_CREATOR_ID);
    const ava = await loadCommandLibraryItemsFromDb(prisma, PILOT_DEV_AVA_CREATOR_ID);
    const lab2Ids = new Set(uniquePostIds(lab2));
    const avaIds = uniquePostIds(ava);
    expect(lab2Ids.size).toBeGreaterThan(100);
    expect(avaIds.some((id) => lab2Ids.has(id))).toBe(false);
    expect(lab2.some((it) => it.post_id.startsWith("sl2_"))).toBe(true);
    expect(ava.some((it) => it.post_id.startsWith("sl2_"))).toBe(false);
  });
});
