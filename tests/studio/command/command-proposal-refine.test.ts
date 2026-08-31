import { describe, expect, it } from "vitest";
import type { AiGenerateStructuredResult } from "../../../src/ai/types.js";
import type { GalleryItem } from "../../../src/gallery/types.js";
import {
  nonePostedOnDestinationMessage,
  parsePostedCleanupInstruction,
  refineSelectionProposal,
  SELECTION_REFINE_NEW_SELECTION_MESSAGE,
  SELECTION_REFINE_PLANNER_UNAVAILABLE,
  summarizeSelectionMembershipChange
} from "../../../src/studio/command/command-proposal-refine.js";
import { CommandContractError } from "../../../src/studio/command/contracts.js";
import {
  createSelectionProposalStore,
  patchSelectionProposal,
  upsertSelectionProposalFromPreview
} from "../../../src/studio/command/proposal-types.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";
import type { CommandPlannerGenerateFn } from "../../../src/studio/command/command-semantic-planner.js";

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
    collection_theme_tag_ids: [],
    distribution_summary: overrides.distribution_summary
  };
  return { ...base, ...overrides };
}

function stubGenerate(payload: unknown): CommandPlannerGenerateFn {
  return async () =>
    ({
      ok: true,
      parsed: payload,
      text: JSON.stringify(payload),
      tool_calls: [{ name: "command_planner_result", input: payload as Record<string, unknown> }],
      provider: "stub",
      model: "stub",
      tier: "cheap"
    }) satisfies AiGenerateStructuredResult;
}

describe("selection proposal refine (workbench)", () => {
  it("summarizes a posted drop", () => {
    expect(
      summarizeSelectionMembershipChange({
        beforeExclude: [],
        afterExclude: ["p2"],
        records: [
          {
            post_id: "p2",
            title: "Page 2",
            tag_ids: [],
            published_at: "2026-01-01T00:00:00.000Z",
            visibility: "visible",
            source: "PATREON",
            collection_ids: [],
            page_number: 2,
            destination_flags: { x: true },
            member_label: "Page 2"
          }
        ]
      }).summary
    ).toBe("Dropped 1 already on X.");
  });

  it("excludes snapshot IDs and refuses a new selection intent", async () => {
    const store = createSelectionProposalStore();
    const items = [
      item({ post_id: "a", media_id: "ma" }),
      item({
        post_id: "b",
        media_id: "mb",
        distribution_summary: {
          post_id: "b",
          destinations: [
            {
              destination: "x",
              variant_status: null,
              attempt_status: "posted",
              attempt_id: null,
              external_url: "https://x.com/p/1",
              external_id: null
            }
          ]
        }
      })
    ];
    const created = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_refine", instruction: "select", post_ids: ["a", "b"] },
      store
    );

    const dropped = await refineSelectionProposal({
      creatorId: "cr_refine",
      proposalId: created.proposal_id,
      instruction: "drop the ones already on X",
      items,
      generate: stubGenerate({
        kind: "proposal_patch",
        op: "exclude",
        already_posted: true,
        post_ids: []
      }),
      store
    });
    expect(dropped.op).toBe("exclude");
    expect(dropped.proposal.exclude_post_ids).toEqual(["b"]);

    await expect(
      refineSelectionProposal({
        creatorId: "cr_refine",
        proposalId: created.proposal_id,
        instruction: "organize watercolor landscapes",
        items,
        generate: stubGenerate({
          kind: "selection_intent",
          query: { title_contains: "Watercolor" },
          collection_title: "Watercolor"
        }),
        store
      })
    ).rejects.toMatchObject({ message: SELECTION_REFINE_NEW_SELECTION_MESSAGE });

    await expect(
      refineSelectionProposal({
        creatorId: "stranger",
        proposalId: created.proposal_id,
        instruction: "drop page 2",
        items,
        generate: stubGenerate({ kind: "proposal_patch", op: "exclude", post_ids: ["a"] }),
        store
      })
    ).rejects.toBeInstanceOf(CommandContractError);

    await expect(
      refineSelectionProposal({
        creatorId: "cr_refine",
        proposalId: created.proposal_id,
        instruction: "drop page 2",
        items,
        plannerEnabled: false,
        store
      })
    ).rejects.toMatchObject({ message: SELECTION_REFINE_PLANNER_UNAVAILABLE });
  });

  it("drops already-on-X without the planner and explains a miss", async () => {
    expect(parsePostedCleanupInstruction("Remove anything already on X.")).toBe("x");
    expect(parsePostedCleanupInstruction("Remove those already on X")).toBe("x");
    expect(parsePostedCleanupInstruction("drop page 2")).toBeNull();

    const store = createSelectionProposalStore();
    const items = [
      item({ post_id: "a", media_id: "ma" }),
      item({
        post_id: "b",
        media_id: "mb",
        distribution_summary: {
          post_id: "b",
          destinations: [
            {
              destination: "x",
              variant_status: null,
              attempt_status: "posted",
              attempt_id: null,
              external_url: "https://x.com/p/1",
              external_id: null
            }
          ]
        }
      })
    ];
    const created = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_posted", instruction: "select", post_ids: ["a", "b"] },
      store
    );
    const dropped = await refineSelectionProposal({
      creatorId: "cr_posted",
      proposalId: created.proposal_id,
      instruction: "Remove anything already on X.",
      items,
      plannerEnabled: false,
      store
    });
    expect(dropped.proposal.exclude_post_ids).toEqual(["b"]);
    expect(dropped.summary).toBe("Dropped 1 already on X.");

    const watercolor = upsertSelectionProposalFromPreview(
      [item({ post_id: "w1", media_id: "mw1" })],
      { creator_id: "cr_wc", instruction: "watercolor", post_ids: ["w1"] },
      store
    );
    const miss = await refineSelectionProposal({
      creatorId: "cr_wc",
      proposalId: watercolor.proposal_id,
      instruction: "Remove anything already on X.",
      items: [item({ post_id: "w1", media_id: "mw1" })],
      plannerEnabled: false,
      store
    });
    expect(miss.post_ids).toEqual([]);
    expect(miss.summary).toBe(nonePostedOnDestinationMessage("x"));
  });

  it("does not expand a frozen set with new library hits", async () => {
    const store = createSelectionProposalStore();
    const items = [
      item({ post_id: "a", media_id: "ma" }),
      item({ post_id: "b", media_id: "mb" }),
      item({ post_id: "extra", media_id: "mx" })
    ];
    const created = upsertSelectionProposalFromPreview(
      items,
      { creator_id: "cr_frozen", instruction: "select", post_ids: ["a", "b"] },
      store
    );
    patchSelectionProposal(
      { creator_id: "cr_frozen", proposal_id: created.proposal_id, op: "approve" },
      store
    );
    await expect(
      refineSelectionProposal({
        creatorId: "cr_frozen",
        proposalId: created.proposal_id,
        instruction: "add extra",
        items,
        generate: stubGenerate({
          kind: "proposal_patch",
          op: "restore",
          post_ids: ["extra"]
        }),
        store
      })
    ).rejects.toBeInstanceOf(CommandContractError);
  });
});
