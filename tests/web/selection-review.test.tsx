/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommandBox from "@/app/components/studio/command/CommandBox";
import SelectionReviewOverlay from "@/app/components/studio/command/SelectionReviewOverlay";
import {
  dropPostedButtonLabel,
  duplicatePostIds,
  filterVisiblePostIds,
  includedPostedByDestination,
  isActiveSelectionProposalConflict,
  isFrozenSelectionStage,
  selectionReviewChips,
  selectionScopeCopy,
  shouldHideLibraryApply,
  shouldOpenSelectionReview,
  tileFallbackMarker
} from "@/lib/command-selection-review";
import type { CommandSelectionProposalClient, GalleryItem, Lab2HarnessInterpretResult } from "@/lib/relay-api";

afterEach(() => {
  cleanup();
});

const FLAGS_SELECTION = {
  layer_enabled: true,
  apply_enabled: false,
  mcp_enabled: false,
  studio_ux_enabled: false,
  selection_ux_enabled: true,
  schedule_plan_enabled: false
} as const;

const multiPreview: Extract<Lab2HarnessInterpretResult, { kind: "preview" }> = {
  kind: "preview",
  scenario_id: "rc-df-03-exact-hero-academy",
  change_set_id: "cs_sel_test",
  instruction: "Organize Hero Academy into a collection, cover first, in page order.",
  resolved_post_ids: ["p1", "p2", "p3", "p4", "p5"],
  ops: [
    {
      op_id: "op_1",
      capability: "create_or_update_collection",
      risk_class: "execute_undo",
      target_ids: ["col_ha"],
      payload: { collection_id: "col_ha", title: "Hero Academy" }
    }
  ],
  write_layer: "collection",
  warnings: ["Missing page 17 — not invented.", "Duplicate page 8 — both copies kept until you choose."],
  summary: "title_contains=Hero Academy AND numbered_sequence",
  lens_hint: "collections",
  apply_ready: true
};

const watercolorPreview: Extract<Lab2HarnessInterpretResult, { kind: "preview" }> = {
  kind: "preview",
  scenario_id: "rc-df-04-watercolor-organize",
  change_set_id: "cs_wc_sel",
  instruction: "Organize the watercolor landscapes newest first into a collection.",
  resolved_post_ids: ["w1", "w2", "w3"],
  ops: [
    {
      op_id: "op_wc",
      capability: "create_or_update_collection",
      risk_class: "execute_undo",
      target_ids: ["col_wc"],
      payload: { collection_id: "col_wc", title: "Watercolor landscapes" }
    }
  ],
  write_layer: "collection",
  warnings: [],
  summary: "Collection “Watercolor landscapes” — 3 posts.",
  lens_hint: "collections",
  apply_ready: true
};

function proposalFixture(
  postIds: string[],
  overrides: Partial<CommandSelectionProposalClient> = {}
): CommandSelectionProposalClient {
  return {
    proposal_id: "pr_test",
    creator_id: "rcx_pilot_dev_ava",
    stage: "selection_review",
    instruction: multiPreview.instruction,
    snapshot: {
      post_ids: postIds,
      explanation: "title_contains=Hero Academy AND numbered_sequence",
      warnings: multiPreview.warnings,
      revision: "rev_test",
      complete: true,
      creator_id: "rcx_pilot_dev_ava",
      created_at: "2026-08-30T00:00:00.000Z"
    },
    records: postIds.map((id, i) => ({
      post_id: id,
      title: `Hero Academy ${id}`,
      member_label: i === 0 ? "Cover" : `Page ${i}`,
      page_number: i === 0 ? null : i,
      destination_flags: id === "p2" ? { x: true } : {}
    })),
    exclude_post_ids: [],
    frozen_post_ids: [],
    frozen_revision: null,
    ...overrides
  };
}

function galleryItem(postId: string): GalleryItem {
  return {
    media_id: `m_${postId}`,
    post_id: postId,
    title: `Hero Academy ${postId}`,
    published_at: "2026-01-01T00:00:00.000Z",
    tag_ids: [],
    tier_ids: [],
    has_export: true,
    processing_status: "ready",
    export_status: "ready",
    content_url_path: "",
    preview_url_path: "",
    thumb_url_path: "",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: []
  };
}

describe("selection review helpers (RC-P6-T02)", () => {
  it("opens only on Lab 3 with the selection flag and two or more posts", () => {
    expect(
      shouldOpenSelectionReview({ selectionUxEnabled: true, surface: "lab3", postCount: 20 })
    ).toBe(true);
    expect(
      shouldOpenSelectionReview({ selectionUxEnabled: true, surface: "lab2", postCount: 20 })
    ).toBe(false);
    expect(
      shouldOpenSelectionReview({ selectionUxEnabled: false, surface: "lab3", postCount: 20 })
    ).toBe(false);
    expect(
      shouldOpenSelectionReview({ selectionUxEnabled: true, surface: "lab3", postCount: 1 })
    ).toBe(false);
    expect(shouldHideLibraryApply({ selectionUxEnabled: true, surface: "lab3" })).toBe(true);
    expect(
      shouldHideLibraryApply({
        selectionUxEnabled: true,
        surface: "lab3",
        selectionApproved: true,
        writeLayer: "collection"
      })
    ).toBe(false);
    expect(
      shouldHideLibraryApply({
        selectionUxEnabled: true,
        surface: "lab3",
        selectionApproved: true,
        writeLayer: "schedule_rail"
      })
    ).toBe(true);
    expect(isActiveSelectionProposalConflict("An active selection proposal already exists. Discard it first.")).toBe(
      true
    );
    expect(isActiveSelectionProposalConflict("Type a command first.")).toBe(false);
    expect(shouldHideLibraryApply({ selectionUxEnabled: true, surface: "lab2" })).toBe(false);
    expect(shouldHideLibraryApply({ selectionUxEnabled: false, surface: "lab3" })).toBe(false);
    expect(isFrozenSelectionStage("selection_approved")).toBe(true);
    expect(isFrozenSelectionStage("plan_shaping")).toBe(true);
    expect(isFrozenSelectionStage("selection_review")).toBe(false);
  });

  it("puts count first, then rule chips, then gap/duplicate copy", () => {
    expect(
      selectionReviewChips({
        count: 17,
        excludedCount: 3,
        explanation: "title_contains=Hero Academy AND numbered_sequence",
        warnings: ["Missing page 17 — not invented."]
      })
    ).toEqual([
      "17 items",
      "3 excluded",
      "title_contains=Hero Academy",
      "numbered_sequence",
      "Missing page 17 — not invented."
    ]);
    expect(selectionScopeCopy({ total: 20, selected: 18 })).toBe("18 of 20 selected");
    expect(tileFallbackMarker({ member_label: "Cover", page_number: null, title: "Hero Academy Cover" })).toBe(
      "Cover"
    );
    expect(dropPostedButtonLabel(6, "x")).toBe("Drop 6 already on X");
    const records = [
      { post_id: "a", title: "A", page_number: 8, destination_flags: { x: true } },
      { post_id: "b", title: "B", page_number: 8, destination_flags: {} }
    ];
    expect(duplicatePostIds(records)).toEqual(["a", "b"]);
    expect(includedPostedByDestination(records, new Set()).map((row) => row.dest)).toEqual(["x"]);
    expect(
      filterVisiblePostIds({
        postIds: ["a", "b"],
        excluded: new Set(["b"]),
        filter: "dropped",
        needsReviewIds: new Set(["a", "b"])
      })
    ).toEqual(["b"]);
  });
});

describe("SelectionReviewOverlay", () => {
  it("pages the view (not the id list) and shows already-posted plus no-preview at 390px and desktop grids", () => {
    const proposal = proposalFixture(["p1", "p2", "p3", "p4", "p5"]);
    const { rerender } = render(
      <div style={{ width: 390 }}>
        <SelectionReviewOverlay
          open
          proposal={proposal}
          items={["p1", "p2", "p3", "p4", "p5"].map(galleryItem)}
          onClose={vi.fn()}
          onExclude={vi.fn()}
          onRestore={vi.fn()}
          onApprove={vi.fn()}
          pageSize={3}
        />
      </div>
    );
    expect(document.querySelector("[data-lab3-selection-review]")).toBeTruthy();
    expect(document.querySelector("[data-selection-review-scope]")?.textContent).toMatch(/5 of 5 selected/);
    expect(document.querySelector("[data-selection-review-composer]")).toBeTruthy();
    expect(document.querySelector("[data-selection-review-actions]")).toBeTruthy();
    expect(document.querySelectorAll("[data-selection-review-tile]")).toHaveLength(3);
    expect(document.querySelector("[data-selection-review-posted]")?.textContent).toMatch(/Already on X/);
    expect(document.querySelector("[data-gallery-thumb-fallback]")).toBeTruthy();
    expect(document.querySelector("[data-gallery-thumb-fallback]")?.textContent).toMatch(/Cover|Page/);
    expect(document.querySelector("[data-selection-review-grid]")?.className).toMatch(/grid-cols-3/);
    expect(document.querySelector("[data-selection-review-grid]")?.className).toMatch(/sm:grid-cols-4/);
    expect(document.querySelector("[data-selection-review-grid]")?.className).toMatch(/motion-reduce/);
    expect(document.querySelector("[data-selection-review-included]")).toBeTruthy();
    expect(document.querySelector("[data-selection-review-check]")).toBeTruthy();
    expect(document.querySelector("[data-selection-review-actions] [data-selection-review-pager]")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Back to previous page" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(document.querySelector("[data-selection-review-page]")?.getAttribute("data-selection-review-page")).toBe(
      "1"
    );
    expect(document.querySelectorAll("[data-selection-review-tile]")).toHaveLength(2);
    expect((screen.getByRole("button", { name: "Back to previous page" }) as HTMLButtonElement).disabled).toBe(
      false
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to previous page" }));
    expect(document.querySelector("[data-selection-review-page]")?.getAttribute("data-selection-review-page")).toBe(
      "0"
    );

    rerender(
      <div style={{ width: 1280 }}>
        <SelectionReviewOverlay
          open
          proposal={proposal}
          items={["p1", "p2", "p3", "p4", "p5"].map(galleryItem)}
          onClose={vi.fn()}
          onExclude={vi.fn()}
          onRestore={vi.fn()}
          onApprove={vi.fn()}
          pageSize={3}
        />
      </div>
    );
    expect(document.querySelector("[data-selection-review-grid]")?.className).toMatch(/md:grid-cols-5/);
  });

  it("keeps excluded tiles listed until restore", () => {
    const excluded = proposalFixture(["p1", "p2", "p3"], { exclude_post_ids: ["p2"] });
    const onRestore = vi.fn();
    render(
      <SelectionReviewOverlay
        open
        proposal={excluded}
        items={["p1", "p2", "p3"].map(galleryItem)}
        onClose={vi.fn()}
        onExclude={vi.fn()}
        onRestore={onRestore}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    expect(document.querySelector("[data-selection-review-excluded]")).toBeTruthy();
    expect(document.querySelector("[data-selection-review-dropped-badge]")?.textContent).toMatch(/Dropped/);
    expect(document.querySelector("[data-selection-review-scope]")?.textContent).toMatch(/2 of 3 selected/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Restore Hero Academy p2" }));
    expect(onRestore).toHaveBeenCalledWith(["p2"]);
  });

  it("disables Approve when none remain", () => {
    render(
      <SelectionReviewOverlay
        open
        proposal={proposalFixture(["p1", "p2"], { exclude_post_ids: ["p1", "p2"] })}
        items={["p1", "p2"].map(galleryItem)}
        onClose={vi.fn()}
        onExclude={vi.fn()}
        onRestore={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    expect((screen.getByRole("button", { name: "Use 0 selected" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a frozen note and no exclude controls after approve", () => {
    render(
      <SelectionReviewOverlay
        open
        proposal={proposalFixture(["p1", "p2"], {
          stage: "selection_approved",
          frozen_post_ids: ["p1", "p2"],
          frozen_revision: "abc"
        })}
        items={["p1", "p2"].map(galleryItem)}
        onClose={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    expect(document.querySelector("[data-selection-review-frozen-note]")?.textContent).toMatch(
      /Apply to library is not available yet/
    );
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Use \d+ selected/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Drop Hero Academy p1" })).toBeNull();
  });

  it("shows Apply in the sticky footer after freeze when onApply is provided", () => {
    const onApply = vi.fn();
    render(
      <SelectionReviewOverlay
        open
        proposal={proposalFixture(["p1", "p2"], {
          stage: "selection_approved",
          frozen_post_ids: ["p1", "p2"],
          frozen_revision: "abc"
        })}
        items={["p1", "p2"].map(galleryItem)}
        onClose={vi.fn()}
        onApply={onApply}
      />
    );
    expect(document.querySelector("[data-selection-review-frozen-note]")?.textContent).toMatch(
      /until you apply/
    );
    expect(document.querySelector("[data-selection-review-actions]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalled();
  });

  it("drops already-posted pieces in bulk and filters to duplicate copies without choosing a winner", () => {
    const onExclude = vi.fn();
    const onClose = vi.fn();
    const proposal = proposalFixture(["p1", "p2", "p3", "p8a", "p8b"], {
      records: [
        { post_id: "p1", title: "Hero Academy p1", member_label: "Cover", page_number: null, destination_flags: {} },
        { post_id: "p2", title: "Hero Academy p2", member_label: "Page 2", page_number: 2, destination_flags: { x: true } },
        { post_id: "p3", title: "Hero Academy p3", member_label: "Page 3", page_number: 3, destination_flags: {} },
        { post_id: "p8a", title: "Hero Academy Page 8", member_label: "Page 8", page_number: 8, destination_flags: {} },
        { post_id: "p8b", title: "Hero Academy Page 8 copy", member_label: "Page 8", page_number: 8, destination_flags: {} }
      ]
    });
    render(
      <SelectionReviewOverlay
        open
        proposal={proposal}
        items={["p1", "p2", "p3", "p8a", "p8b"].map(galleryItem)}
        onClose={onClose}
        onExclude={onExclude}
        onRestore={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
        onApprove={vi.fn()}
        onRefine={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Drop 1 already on X" }));
    expect(onExclude).toHaveBeenCalledWith(["p2"]);
    expect(document.querySelector("[data-selection-review-duplicates]")?.textContent).toMatch(/2 duplicates/);
    expect(screen.queryByRole("button", { name: "Review 2 duplicates" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "All" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Drop Hero Academy Page 8" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Drop Hero Academy Page 8 copy" })).toBeTruthy();
    expect(document.querySelectorAll("[data-selection-review-tile]")).toHaveLength(5);
    expect(screen.getByPlaceholderText("Remove anything already on X.")).toBeTruthy();
    expect(screen.queryByText(/None of these are marked as already posted/)).toBeNull();
    expect(screen.queryByText(/Cleanup applies to the whole selection/)).toBeNull();
    expect(document.querySelector("[data-selection-review-composer]")?.className).toMatch(/sticky/);
    expect(document.querySelector("[data-selection-review-actions]")?.className).toMatch(/sticky/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("says when nothing in the set is marked as already posted", () => {
    render(
      <SelectionReviewOverlay
        open
        proposal={proposalFixture(["w1", "w2"], {
          instruction: "Organize the watercolor landscapes newest first into a collection.",
          records: [
            { post_id: "w1", title: "Watercolor 1", member_label: null, page_number: null, destination_flags: {} },
            { post_id: "w2", title: "Watercolor 2", member_label: null, page_number: null, destination_flags: {} }
          ]
        })}
        items={["w1", "w2"].map(galleryItem)}
        onClose={vi.fn()}
        onExclude={vi.fn()}
        onRestore={vi.fn()}
        onApprove={vi.fn()}
        onRefine={vi.fn()}
      />
    );
    expect(document.querySelector("[data-selection-review-posted-empty]")).toBeNull();
    expect(screen.queryByText(/None of these are marked as already posted/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Drop \d+ already on/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: "All" })).toBeNull();
    expect(screen.getByPlaceholderText("Remove anything already on X.")).toBeTruthy();
  });

  it("toggles a focused tile from the keyboard and keeps dropped state labeled", () => {
    const onExclude = vi.fn();
    render(
      <SelectionReviewOverlay
        open
        proposal={proposalFixture(["p1", "p2"])}
        items={["p1", "p2"].map(galleryItem)}
        onClose={vi.fn()}
        onExclude={onExclude}
        onRestore={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    const tile = screen.getByRole("checkbox", { name: "Drop Hero Academy p1" });
    expect(tile.getAttribute("aria-checked")).toBe("true");
    expect((tile as HTMLButtonElement).disabled).toBe(false);
    tile.focus();
    expect(document.activeElement).toBe(tile);
    fireEvent.keyDown(tile, { key: " " });
    fireEvent.click(tile);
    expect(onExclude).toHaveBeenCalledWith(["p1"]);
    expect(document.querySelector("[data-selection-review-check]")).toBeTruthy();
    expect(document.querySelector("[data-selection-review-dropped-badge]")).toBeNull();
  });

  it("submits a refinement from the composer on Enter", () => {
    const onRefine = vi.fn();
    render(
      <SelectionReviewOverlay
        open
        proposal={proposalFixture(["p1", "p2"])}
        items={["p1", "p2"].map(galleryItem)}
        onClose={vi.fn()}
        onExclude={vi.fn()}
        onRestore={vi.fn()}
        onApprove={vi.fn()}
        onRefine={onRefine}
      />
    );
    const field = screen.getByLabelText("Refine selection");
    fireEvent.change(field, { target: { value: "Remove anything already on X." } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onRefine).toHaveBeenCalledWith("Remove anything already on X.");
  });
});

describe("CommandBox selection review (Lab 3)", () => {
  it("opens the overlay instead of the compact preview paragraph", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: multiPreview });
    const createProposal = vi.fn().mockResolvedValue({ proposal: proposalFixture(multiPreview.resolved_post_ids) });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={FLAGS_SELECTION}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
        createProposal={createProposal}
        cancelProposal={vi.fn()}
        libraryItems={multiPreview.resolved_post_ids.map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: multiPreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() =>
      expect(document.querySelector("[data-command-state]")?.getAttribute("data-command-state")).toBe(
        "selection_review"
      )
    );
    expect(createProposal).toHaveBeenCalled();
    expect(document.querySelector("[data-lab3-selection-review]")).toBeTruthy();
    expect(document.querySelector("[data-lab3-selection-review]")?.getAttribute("data-lab3-below-command")).toBeNull();
    expect(document.querySelector("[data-command-above-overlay]")).toBeNull();
    expect(document.querySelector("[data-command-review-covered]")).toBeTruthy();
    expect(document.querySelector("[data-command-summary]")).toBeNull();
    expect(screen.queryByText(/Safe internal change/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("shows Apply after freeze for collection Organize when the apply flag is on", async () => {
    let current = proposalFixture(multiPreview.resolved_post_ids);
    const apply = vi.fn().mockResolvedValue({ envelope: { change_set_id: "cs_sel_test" } });
    const cancelProposal = vi.fn().mockResolvedValue({ cancelled: true, proposal_id: current.proposal_id });
    const patchProposal = vi.fn().mockImplementation(
      async (body: { op: string; post_ids?: string[] }) => {
        if (body.op === "exclude") {
          current = {
            ...current,
            exclude_post_ids: [...new Set([...current.exclude_post_ids, ...(body.post_ids ?? [])])]
          };
        }
        if (body.op === "approve") {
          const excluded = new Set(current.exclude_post_ids);
          current = {
            ...current,
            stage: "selection_approved",
            frozen_post_ids: current.snapshot.post_ids.filter((id) => !excluded.has(id)),
            frozen_revision: "frozen_rev"
          };
        }
        return { proposal: current };
      }
    );
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={{ ...FLAGS_SELECTION, apply_enabled: true }}
        interpret={vi.fn().mockResolvedValue({ result: multiPreview })}
        apply={apply}
        undo={vi.fn()}
        createProposal={vi.fn().mockResolvedValue({ proposal: current })}
        cancelProposal={cancelProposal}
        patchProposal={patchProposal}
        libraryItems={multiPreview.resolved_post_ids.map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: multiPreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Use 5 selected" }));
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Drop Hero Academy p3" }));
    await waitFor(() => expect(document.querySelector("[data-selection-review-excluded]")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Use 4 selected" }));
    await waitFor(() =>
      expect(document.querySelector("[data-command-state]")?.getAttribute("data-command-state")).toBe(
        "selection_approved"
      )
    );
    expect(apply).not.toHaveBeenCalled();
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    expect(document.querySelector("[data-selection-review-frozen-note]")?.textContent).toMatch(
      /until you apply/
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      proposal_id: current.proposal_id,
      expected_revision: "frozen_rev",
      operation_kind: "create_or_update_collection",
      collection_title: "Hero Academy"
    });
    expect(apply.mock.calls[0]?.[0].ops).toBeUndefined();
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    expect(cancelProposal).toHaveBeenCalled();
  });

  it("keeps Apply hidden after freeze for schedule write_layer", async () => {
    const schedulePreview: Extract<Lab2HarnessInterpretResult, { kind: "preview" }> = {
      ...multiPreview,
      write_layer: "schedule_rail",
      lens_hint: "schedule",
      ops: [
        {
          op_id: "op_plan",
          capability: "create_release_plan",
          risk_class: "execute_undo",
          target_ids: ["plan_1"],
          payload: {}
        }
      ]
    };
    let current = proposalFixture(schedulePreview.resolved_post_ids);
    const apply = vi.fn();
    const patchProposal = vi.fn().mockImplementation(async (body: { op: string }) => {
      if (body.op === "approve") {
        current = {
          ...current,
          stage: "selection_approved",
          frozen_post_ids: current.snapshot.post_ids,
          frozen_revision: "frozen_rev"
        };
      }
      return { proposal: current };
    });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={{ ...FLAGS_SELECTION, apply_enabled: true }}
        interpret={vi.fn().mockResolvedValue({ result: schedulePreview })}
        apply={apply}
        undo={vi.fn()}
        createProposal={vi.fn().mockResolvedValue({ proposal: current })}
        cancelProposal={vi.fn()}
        patchProposal={patchProposal}
        libraryItems={schedulePreview.resolved_post_ids.map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: schedulePreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Use 5 selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Use 5 selected" }));
    await waitFor(() =>
      expect(document.querySelector("[data-command-state]")?.getAttribute("data-command-state")).toBe(
        "selection_approved"
      )
    );
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(document.querySelector("[data-selection-review-frozen-note]")?.textContent).toMatch(
      /Apply to library is not available yet/
    );
  });

  it("prompts before replacing an open proposal with a new command", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const cancelProposal = vi.fn();
    const interpret = vi.fn().mockResolvedValue({ result: multiPreview });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={FLAGS_SELECTION}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
        createProposal={vi.fn().mockResolvedValue({ proposal: proposalFixture(multiPreview.resolved_post_ids) })}
        cancelProposal={cancelProposal}
        libraryItems={multiPreview.resolved_post_ids.map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: multiPreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Use 5 selected" }));
    interpret.mockClear();
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: "Organize the watercolor landscapes newest first into a collection." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    expect(confirm).toHaveBeenCalled();
    expect(cancelProposal).not.toHaveBeenCalled();
    expect(interpret).not.toHaveBeenCalled();
    expect(document.querySelector("[data-command-state]")?.getAttribute("data-command-state")).toBe(
      "selection_review"
    );
    confirm.mockRestore();
  });

  it("reopens a dismissed overlay for the same command without a new interpret", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: multiPreview });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={FLAGS_SELECTION}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
        createProposal={vi.fn().mockResolvedValue({ proposal: proposalFixture(multiPreview.resolved_post_ids) })}
        cancelProposal={vi.fn()}
        libraryItems={multiPreview.resolved_post_ids.map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: multiPreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Use 5 selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.querySelector("[data-lab3-selection-review]")).toBeNull());
    interpret.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    expect(interpret).not.toHaveBeenCalled();
    expect(document.querySelector("[data-lab3-selection-review]")).toBeTruthy();
    expect(document.querySelector("[data-command-state]")?.getAttribute("data-command-state")).toBe(
      "selection_review"
    );
  });

  it("shows an error when the proposal cannot be created", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: multiPreview });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={FLAGS_SELECTION}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
        createProposal={vi.fn().mockRejectedValue(new Error("Selection includes posts that are not in this creator’s catalog."))}
        cancelProposal={vi.fn()}
        libraryItems={multiPreview.resolved_post_ids.map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: multiPreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/not in this creator/)
    );
    expect(document.querySelector("[data-lab3-selection-review]")).toBeNull();
    expect(document.querySelector("[data-command-state]")?.getAttribute("data-command-state")).toBe("error");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review existing selection" })).toBeNull();
  });

  it("offers review or discard when an active proposal already exists", async () => {
    const existing = proposalFixture(multiPreview.resolved_post_ids);
    const interpret = vi.fn().mockResolvedValue({ result: watercolorPreview });
    const fetchActiveProposal = vi.fn().mockResolvedValue({ proposal: existing });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={FLAGS_SELECTION}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
        createProposal={vi.fn().mockRejectedValue(
          new Error("An active selection proposal already exists. Discard it first.")
        )}
        cancelProposal={vi.fn()}
        fetchActiveProposal={fetchActiveProposal}
        libraryItems={[...multiPreview.resolved_post_ids, ...watercolorPreview.resolved_post_ids].map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: watercolorPreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/active selection proposal already exists/)
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(document.querySelector("[data-command-proposal-conflict]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review existing selection" }));
    await waitFor(() =>
      expect(document.querySelector("[data-lab3-selection-review]")).toBeTruthy()
    );
    expect(fetchActiveProposal).toHaveBeenCalledWith({ creator_id: "rcx_pilot_dev_ava" });
    expect(screen.getByRole("button", { name: "Use 5 selected" })).toBeTruthy();
    expect(document.querySelector("[data-selection-review-scope]")?.textContent).toMatch(/5 of 5 selected/);
  });

  it("discards the existing proposal and opens the new selection", async () => {
    const existing = proposalFixture(multiPreview.resolved_post_ids);
    const nextProposal = proposalFixture(watercolorPreview.resolved_post_ids, {
      proposal_id: "pr_wc",
      instruction: watercolorPreview.instruction
    });
    const interpret = vi.fn().mockResolvedValue({ result: watercolorPreview });
    const createProposal = vi
      .fn()
      .mockRejectedValueOnce(new Error("An active selection proposal already exists. Discard it first."))
      .mockResolvedValueOnce({ proposal: nextProposal });
    const cancelProposal = vi.fn().mockResolvedValue({ cancelled: true, proposal_id: existing.proposal_id });
    const fetchActiveProposal = vi.fn().mockResolvedValue({ proposal: existing });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={FLAGS_SELECTION}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
        createProposal={createProposal}
        cancelProposal={cancelProposal}
        fetchActiveProposal={fetchActiveProposal}
        libraryItems={[...multiPreview.resolved_post_ids, ...watercolorPreview.resolved_post_ids].map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: watercolorPreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Discard and start this command" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and start this command" }));
    await waitFor(() =>
      expect(document.querySelector("[data-lab3-selection-review]")).toBeTruthy()
    );
    expect(cancelProposal).toHaveBeenCalledWith({
      creator_id: "rcx_pilot_dev_ava",
      proposal_id: existing.proposal_id
    });
    expect(createProposal).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Use 3 selected" })).toBeTruthy();
    expect(document.querySelector("[data-selection-review-scope]")?.textContent).toMatch(/3 of 3 selected/);
    expect(interpret).toHaveBeenCalledTimes(1);
  });

  it("refines the open proposal from the overlay composer without discarding it", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const interpret = vi.fn().mockResolvedValue({ result: multiPreview });
    const current = proposalFixture(multiPreview.resolved_post_ids);
    const patchProposal = vi.fn().mockResolvedValue({
      proposal: { ...current, exclude_post_ids: [] }
    });
    const refineProposal = vi.fn().mockResolvedValue({
      proposal: { ...current, exclude_post_ids: ["p2"] },
      summary: "Dropped 1 already on X.",
      op: "exclude",
      post_ids: ["p2"]
    });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={FLAGS_SELECTION}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
        createProposal={vi.fn().mockResolvedValue({ proposal: current })}
        cancelProposal={vi.fn()}
        patchProposal={patchProposal}
        refineProposal={refineProposal}
        libraryItems={multiPreview.resolved_post_ids.map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: multiPreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByPlaceholderText("Remove anything already on X."));
    fireEvent.change(screen.getByLabelText("Refine selection"), {
      target: { value: "Remove anything already on X." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview refinement" }));
    await waitFor(() =>
      expect(document.querySelector("[data-selection-review-refine-summary]")?.textContent).toMatch(
        /Dropped 1 already on X/
      )
    );
    expect(refineProposal).toHaveBeenCalledWith({
      creator_id: "rcx_pilot_dev_ava",
      proposal_id: "pr_test",
      instruction: "Remove anything already on X."
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(interpret).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(patchProposal).toHaveBeenCalledWith({
        creator_id: "rcx_pilot_dev_ava",
        proposal_id: "pr_test",
        op: "restore",
        post_ids: ["p2"]
      })
    );
    confirm.mockRestore();
  });

  it("does not open the plan calendar for collection Organize when the schedule-plan flag is on", async () => {
    let current = proposalFixture(multiPreview.resolved_post_ids);
    const fetchPlan = vi.fn();
    const patchProposal = vi.fn().mockImplementation(async (body: { op: string }) => {
      if (body.op === "approve") {
        current = {
          ...current,
          stage: "selection_approved",
          frozen_post_ids: current.snapshot.post_ids,
          frozen_revision: "frozen_rev"
        };
      }
      return { proposal: current };
    });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={{ ...FLAGS_SELECTION, apply_enabled: true, schedule_plan_enabled: true }}
        interpret={vi.fn().mockResolvedValue({ result: multiPreview })}
        apply={vi.fn()}
        undo={vi.fn()}
        createProposal={vi.fn().mockResolvedValue({ proposal: current })}
        cancelProposal={vi.fn()}
        patchProposal={patchProposal}
        fetchPlan={fetchPlan}
        libraryItems={multiPreview.resolved_post_ids.map(galleryItem)}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: multiPreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Use 5 selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Use 5 selected" }));
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    expect(fetchPlan).not.toHaveBeenCalled();
    expect(document.querySelector("[data-plan-workbench]")).toBeNull();
    expect(document.querySelector("[data-lab3-selection-review]")).toBeTruthy();
  });

  it("opens the plan workbench after freeze on a schedule journey and confirms with one materialize apply", async () => {
    const schedulePreview: Extract<Lab2HarnessInterpretResult, { kind: "preview" }> = {
      ...multiPreview,
      write_layer: "schedule_rail",
      lens_hint: "schedule",
      ops: [
        {
          op_id: "op_plan",
          capability: "create_release_plan",
          risk_class: "execute_undo",
          target_ids: ["plan_1"],
          payload: {}
        }
      ]
    };
    const plan = {
      version: 1,
      time_zone: "UTC",
      weekday: 4,
      interval_days: 7,
      start_local: "2026-09-03T19:00:00",
      exclude_post_ids: [] as string[],
      skip_post_ids: [] as string[],
      slot_overrides: {} as Record<string, string>
    };
    const slots = schedulePreview.resolved_post_ids.map((id, i) => ({
      post_id: id,
      due_at: new Date(Date.UTC(2026, 8, 3 + i * 7, 19, 0, 0)).toISOString()
    }));
    let current = proposalFixture(schedulePreview.resolved_post_ids);
    const createProposal = vi.fn().mockImplementation(async () => {
      current = proposalFixture(schedulePreview.resolved_post_ids, {
        proposal_id: `pr_${createProposal.mock.calls.length}`
      });
      return { proposal: current };
    });
    const refinePlan = vi.fn().mockImplementation(async () => {
      current = {
        ...current,
        stage: "plan_shaping",
        plan: { ...plan, weekday: 6, version: (current.plan?.version ?? plan.version) + 1 }
      };
      return {
        proposal: current,
        plan: current.plan,
        slots,
        summary: "Drops now land every saturday.",
        op: "set_weekday"
      };
    });
    const apply = vi.fn().mockResolvedValue({ envelope: { change_set_id: "cs_sel_test" } });
    const undo = vi.fn().mockResolvedValue({ undo: { change_set_id: "cs_plan_pr_test" } });
    const onApplied = vi.fn();
    const fetchPlan = vi.fn().mockImplementation(async () => ({
      proposal_id: current.proposal_id,
      stage: "selection_approved",
      persisted: false,
      plan,
      slots
    }));
    const patchPlan = vi.fn().mockImplementation(async () => {
      current = { ...current, stage: "plan_shaping", plan };
      return { proposal: current, plan, slots };
    });
    const patchProposal = vi.fn().mockImplementation(async (body: { op: string }) => {
      if (body.op === "approve") {
        current = {
          ...current,
          stage: "selection_approved",
          frozen_post_ids: current.snapshot.post_ids,
          frozen_revision: "frozen_rev"
        };
      }
      return { proposal: current };
    });
    render(
      <CommandBox
        creatorId="rcx_pilot_dev_ava"
        surface="lab3"
        presentation="instrument"
        flags={{ ...FLAGS_SELECTION, apply_enabled: true, schedule_plan_enabled: true }}
        interpret={vi.fn().mockResolvedValue({ result: schedulePreview })}
        apply={apply}
        undo={undo}
        createProposal={createProposal}
        cancelProposal={vi.fn()}
        patchProposal={patchProposal}
        fetchPlan={fetchPlan}
        patchPlan={patchPlan}
        refinePlan={refinePlan}
        loadOccupancy={vi.fn().mockResolvedValue([])}
        libraryItems={schedulePreview.resolved_post_ids.map(galleryItem)}
        onApplied={onApplied}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: schedulePreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Use 5 selected" }));
    expect(document.querySelector("[data-command-review-covered]")).toBeTruthy();
    expect(screen.getByLabelText("Refine selection")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use 5 selected" }));
    await waitFor(() => document.querySelector("[data-plan-workbench]"));
    expect(document.querySelector("[data-command-plan-covered]")).toBeTruthy();
    expect(document.querySelector("[data-command-above-overlay]")).toBeNull();
    expect(document.querySelector("[data-command-review-covered]")).toBeNull();
    expect(document.querySelector("[data-lab3-selection-review]")).toBeNull();
    expect(screen.getByLabelText("Refine schedule")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(fetchPlan).toHaveBeenCalled();
    expect(patchPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        op: "set_start",
        start_local: plan.start_local,
        time_zone: plan.time_zone,
        weekday: plan.weekday
      })
    );
    expect(patchPlan.mock.calls[0]?.[0].start_local).not.toMatch(/2026-08-27/);
    fireEvent.change(screen.getByLabelText("Refine schedule"), {
      target: { value: "Change the drops to every Saturday." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview plan change" }));
    await waitFor(() => expect(refinePlan).toHaveBeenCalledWith({
      creator_id: "rcx_pilot_dev_ava",
      proposal_id: current.proposal_id,
      instruction: "Change the drops to every Saturday."
    }));
    expect(document.querySelector("[data-plan-refine-summary]")?.textContent).toMatch(/saturday/i);
    const appliedProposalId = current.proposal_id;
    fireEvent.click(screen.getByRole("button", { name: "Confirm schedule" }));
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      proposal_id: appliedProposalId,
      expected_revision: "frozen_rev",
      operation_kind: "materialize_schedule",
      change_set_id: `cs_plan_${appliedProposalId}`
    });
    expect(apply.mock.calls[0]?.[0].ops).toBeUndefined();
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith({
      lens: "schedule",
      changeSetId: `cs_plan_${appliedProposalId}`,
      focusMonth: "2026-09"
    }));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(undo).toHaveBeenCalledWith({
      creator_id: "rcx_pilot_dev_ava",
      change_set_id: `cs_plan_${appliedProposalId}`
    }));
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Use 5 selected" }));
    expect(document.querySelector("[data-lab3-selection-review]")).toBeTruthy();
    expect(document.querySelector("[data-plan-workbench]")).toBeNull();
    expect(document.querySelector("[data-command-state]")?.getAttribute("data-command-state")).toBe(
      "selection_review"
    );
  });
});
