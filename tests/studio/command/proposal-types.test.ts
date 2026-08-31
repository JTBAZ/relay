import { describe, expect, it } from "vitest";
import type { GalleryItem } from "../../../src/gallery/types.js";
import { selectionChecksum } from "../../../src/studio/command/selection-snapshot.js";
import {
  ACTIVE_SELECTION_PROPOSAL_EXISTS,
  assertNoFrozenExpansion,
  buildSelectionProposalFromPreview,
  createSelectionProposalStore,
  patchSelectionProposal,
  pendingProposalPostIds,
  upsertSelectionProposalFromPreview,
  validateFrozenSelection
} from "../../../src/studio/command/proposal-types.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";
import { commandLibraryItemsFromLab2Corpus } from "../../../src/studio/eval/library-items-from-corpus.js";
import { loadStudioLab2Corpus } from "../../../src/studio/lab2/corpus-spec.js";

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
    content_url_path: "",
    preview_url_path: "",
    thumb_url_path: "",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: []
  };
  return { ...base, ...overrides };
}

describe("selection proposal (RC-P6-T01)", () => {
  it("builds a complete in-memory proposal from interpret preview ids", () => {
    const lab2 = commandLibraryItemsFromLab2Corpus(loadStudioLab2Corpus());
    const postIds = ["sl2_ha_cover", "sl2_ha_p01", "sl2_ha_p02"];
    const proposal = buildSelectionProposalFromPreview(lab2, {
      creator_id: "rcx_studio_lab2",
      instruction: "Organize Hero Academy into a collection, cover first, in page order.",
      post_ids: postIds,
      warnings: ["Missing page 17 — not invented."],
      explanation: "title_contains=Hero Academy AND numbered_sequence"
    });
    expect(proposal.stage).toBe("selection_review");
    expect(proposal.snapshot.complete).toBe(true);
    expect(proposal.snapshot.post_ids).toEqual(postIds);
    expect(proposal.records.map((r) => r.post_id)).toEqual(postIds);
    expect(proposal.exclude_post_ids).toEqual([]);
    expect(proposal.frozen_post_ids).toEqual([]);
    expect(proposal.records[0]?.title).toContain("Hero Academy");
    expect(JSON.stringify(proposal.records[0])).not.toMatch(/content_url_path/);
  });

  it("rejects foreign post ids and incomplete freeze", () => {
    const items = [item({ post_id: "mine", media_id: "m1" })];
    expect(() =>
      buildSelectionProposalFromPreview(items, {
        creator_id: "rcx_pilot_dev_ava",
        instruction: "select",
        post_ids: ["sl2_ha_cover"]
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));

    const proposal = buildSelectionProposalFromPreview(items, {
      creator_id: "rcx_pilot_dev_ava",
      instruction: "select",
      post_ids: ["mine"]
    });
    proposal.frozen_post_ids = ["stranger"];
    expect(() => validateFrozenSelection(proposal)).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
    proposal.exclude_post_ids = ["mine"];
    proposal.frozen_post_ids = ["mine"];
    expect(() => validateFrozenSelection(proposal)).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
    proposal.exclude_post_ids = [];
    proposal.frozen_post_ids = ["mine"];
    expect(validateFrozenSelection(proposal)).toEqual(["mine"]);
    expect(pendingProposalPostIds({ ...proposal, exclude_post_ids: ["mine"] })).toEqual([]);
  });

  it("returns the same proposal id for the same creator revision", () => {
    const store = createSelectionProposalStore();
    const items = [item({ post_id: "a", media_id: "ma" }), item({ post_id: "b", media_id: "mb" })];
    const first = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_a", instruction: "one", post_ids: ["b", "a"] },
      store
    );
    const second = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_a", instruction: "one again", post_ids: ["b", "a"] },
      store
    );
    expect(second.proposal_id).toBe(first.proposal_id);
    expect(store.cancel(first.proposal_id, "cr_a").proposal_id).toBe(first.proposal_id);
    expect(() => store.cancel(first.proposal_id, "cr_a")).toThrow(
      expect.objectContaining({ code: "COMMAND_NOT_FOUND" })
    );
  });
});

describe("selection proposal exclude / freeze (RC-P6-T03)", () => {
  it("excludes then approves with a frozen checksum; second approve is idempotent", () => {
    const store = createSelectionProposalStore();
    const items = [
      item({ post_id: "a", media_id: "ma" }),
      item({ post_id: "b", media_id: "mb" }),
      item({ post_id: "c", media_id: "mc" })
    ];
    const created = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_freeze", instruction: "select", post_ids: ["a", "b", "c"] },
      store
    );
    const excluded = patchSelectionProposal(
      { creator_id: "cr_freeze", proposal_id: created.proposal_id, op: "exclude", post_ids: ["b"] },
      store
    );
    expect(excluded.exclude_post_ids).toEqual(["b"]);
    expect(pendingProposalPostIds(excluded)).toEqual(["a", "c"]);
    expect(excluded.snapshot.post_ids).toEqual(["a", "b", "c"]);

    const approved = patchSelectionProposal(
      { creator_id: "cr_freeze", proposal_id: created.proposal_id, op: "approve" },
      store
    );
    expect(approved.stage).toBe("selection_approved");
    expect(approved.frozen_post_ids).toEqual(["a", "c"]);
    expect(approved.frozen_revision).toBe(selectionChecksum(["a", "c"]));
    expect(approved.proposal_id).toBe(created.proposal_id);

    const again = patchSelectionProposal(
      { creator_id: "cr_freeze", proposal_id: created.proposal_id, op: "approve" },
      store
    );
    expect(again.proposal_id).toBe(created.proposal_id);
    expect(again.frozen_post_ids).toEqual(["a", "c"]);
    expect(again.frozen_revision).toBe(approved.frozen_revision);

    expect(() =>
      upsertSelectionProposalFromPreview(
        items,
        { creator_id: "cr_freeze", instruction: "select again", post_ids: ["a", "b", "c"] },
        store
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION", message: ACTIVE_SELECTION_PROPOSAL_EXISTS }));
  });

  it("lets a cancelled frozen proposal start a fresh selection_review for the same posts", () => {
    const store = createSelectionProposalStore();
    const items = [item({ post_id: "a", media_id: "ma" }), item({ post_id: "b", media_id: "mb" })];
    const created = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_repeat", instruction: "weekly drops", post_ids: ["a", "b"] },
      store
    );
    patchSelectionProposal(
      { creator_id: "cr_repeat", proposal_id: created.proposal_id, op: "approve" },
      store
    );
    store.cancel(created.proposal_id, "cr_repeat");
    const next = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_repeat", instruction: "weekly drops", post_ids: ["a", "b"] },
      store
    );
    expect(next.stage).toBe("selection_review");
    expect(next.proposal_id).not.toBe(created.proposal_id);
    expect(next.frozen_post_ids).toEqual([]);
  });

  it("select all / none stay inside the proposal and restore returns an excluded tile", () => {
    const store = createSelectionProposalStore();
    const items = [item({ post_id: "a", media_id: "ma" }), item({ post_id: "b", media_id: "mb" })];
    const created = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_sel", instruction: "select", post_ids: ["a", "b"] },
      store
    );
    const none = patchSelectionProposal(
      { creator_id: "cr_sel", proposal_id: created.proposal_id, op: "select_none" },
      store
    );
    expect(none.exclude_post_ids).toEqual(["a", "b"]);
    expect(pendingProposalPostIds(none)).toEqual([]);
    expect(() =>
      patchSelectionProposal(
        { creator_id: "cr_sel", proposal_id: created.proposal_id, op: "approve" },
        store
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));

    const restored = patchSelectionProposal(
      { creator_id: "cr_sel", proposal_id: created.proposal_id, op: "restore", post_ids: ["a"] },
      store
    );
    expect(restored.exclude_post_ids).toEqual(["b"]);
    const all = patchSelectionProposal(
      { creator_id: "cr_sel", proposal_id: created.proposal_id, op: "select_all" },
      store
    );
    expect(all.exclude_post_ids).toEqual([]);
  });

  it("refuses exclude after freeze and new library hits on the frozen set", () => {
    const store = createSelectionProposalStore();
    const items = [
      item({ post_id: "a", media_id: "ma" }),
      item({ post_id: "b", media_id: "mb" }),
      item({ post_id: "extra", media_id: "mx" })
    ];
    const created = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_closed", instruction: "select", post_ids: ["a", "b"] },
      store
    );
    patchSelectionProposal(
      { creator_id: "cr_closed", proposal_id: created.proposal_id, op: "exclude", post_ids: ["b"] },
      store
    );
    const approved = patchSelectionProposal(
      { creator_id: "cr_closed", proposal_id: created.proposal_id, op: "approve" },
      store
    );
    expect(() =>
      patchSelectionProposal(
        { creator_id: "cr_closed", proposal_id: created.proposal_id, op: "exclude", post_ids: ["a"] },
        store
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
    expect(() => assertNoFrozenExpansion(approved, ["a", "extra"])).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
    expect(() => assertNoFrozenExpansion(approved, ["b"])).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
    expect(() => assertNoFrozenExpansion(approved, ["a"])).not.toThrow();
    expect(() =>
      upsertSelectionProposalFromPreview(
        items,
        { creator_id: "cr_closed", instruction: "different set", post_ids: ["a", "extra"] },
        store
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION", message: ACTIVE_SELECTION_PROPOSAL_EXISTS }));
  });
});
