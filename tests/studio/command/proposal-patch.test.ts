import { describe, expect, it } from "vitest";
import { selectionChecksum } from "../../../src/studio/command/selection-snapshot.js";
import { applyPlanPatch, compileFinitePlanChangeSet, previewFinitePlan } from "../../../src/studio/command/proposal-patch.js";
import {
  buildSelectionProposalFromPreview,
  createSelectionProposalStore,
  patchSelectionProposal
} from "../../../src/studio/command/proposal-types.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";

function items(): CommandLibraryItem[] {
  return ["a", "b", "c"].map((id, index) => ({
    media_id: `m_${id}`,
    post_id: id,
    title: `Hero Academy Page ${index + 1}`,
    published_at: `2026-03-0${index + 1}T00:00:00.000Z`,
    tag_ids: [],
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
  }));
}

function approvedStore() {
  const store = createSelectionProposalStore();
  const built = buildSelectionProposalFromPreview(items(), {
    creator_id: "creator_1",
    instruction: "Hero Academy weekly drops",
    post_ids: ["a", "b", "c"]
  });
  store.put(built);
  const approved = patchSelectionProposal(
    { creator_id: "creator_1", proposal_id: built.proposal_id, op: "approve" },
    store
  );
  return { store, proposal: approved };
}

describe("plan ProposalPatch (RC-P9-T02)", () => {
  it("GET-shaped preview does not persist and uses query start without writing", () => {
    const { store, proposal } = approvedStore();
    const preview = previewFinitePlan(proposal, {
      time_zone: "UTC",
      weekday: 4,
      start_local: "2026-08-27T19:00:00"
    });
    expect(preview.persisted).toBe(false);
    expect(preview.plan.version).toBe(0);
    expect(preview.slots).toHaveLength(3);
    expect(store.get(proposal.proposal_id)?.plan).toBeUndefined();
    expect(store.get(proposal.proposal_id)?.stage).toBe("selection_approved");
    expect(preview.slots[0]?.due_at).toBe("2026-08-27T19:00:00.000Z");
  });

  it("set_weekday bumps version, snaps slots, and rejects add-from-library", () => {
    const { store, proposal } = approvedStore();
    const first = applyPlanPatch(
      {
        creator_id: "creator_1",
        proposal_id: proposal.proposal_id,
        op: "set_start",
        start_local: "2026-08-27T19:00:00",
        time_zone: "UTC"
      },
      store
    );
    expect(first.proposal.stage).toBe("plan_shaping");
    expect(first.plan.version).toBe(1);
    const saturday = applyPlanPatch(
      {
        creator_id: "creator_1",
        proposal_id: proposal.proposal_id,
        op: "set_weekday",
        weekday: "saturday",
        expected_version: 1
      },
      store
    );
    expect(saturday.plan.version).toBe(2);
    expect(saturday.plan.weekday).toBe(6);
    expect(saturday.slots[0]?.due_at).toBe("2026-08-29T19:00:00.000Z");
    expect(() =>
      applyPlanPatch(
        {
          creator_id: "creator_1",
          proposal_id: proposal.proposal_id,
          op: "add_post_id",
          post_id: "library_new"
        },
        store
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_FORBIDDEN" }));
    expect(() =>
      applyPlanPatch(
        {
          creator_id: "creator_1",
          proposal_id: proposal.proposal_id,
          op: "exclude_post_id",
          post_id: "not_in_frozen"
        },
        store
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
  });

  it("move_slot and exclude/restore keep frozen IDs; stale version fails closed", () => {
    const { store, proposal } = approvedStore();
    applyPlanPatch(
      {
        creator_id: "creator_1",
        proposal_id: proposal.proposal_id,
        op: "set_start",
        start_local: "2026-08-27T19:00:00",
        time_zone: "UTC"
      },
      store
    );
    const moved = applyPlanPatch(
      {
        creator_id: "creator_1",
        proposal_id: proposal.proposal_id,
        op: "move_slot",
        post_id: "b",
        due_at: "2026-09-10T15:00:00.000Z",
        expected_version: 1
      },
      store
    );
    expect(moved.slots.find((s) => s.post_id === "b")?.due_at).toBe("2026-09-10T15:00:00.000Z");
    expect(moved.slots.find((s) => s.post_id === "a")?.due_at).toBe("2026-08-27T19:00:00.000Z");
    const excluded = applyPlanPatch(
      {
        creator_id: "creator_1",
        proposal_id: proposal.proposal_id,
        op: "exclude_post_id",
        post_id: "b"
      },
      store
    );
    expect(excluded.slots.map((s) => s.post_id)).toEqual(["a", "c"]);
    expect(excluded.proposal.frozen_post_ids).toEqual(["a", "b", "c"]);
    expect(excluded.proposal.frozen_revision).toBe(selectionChecksum(["a", "b", "c"]));
    const restored = applyPlanPatch(
      {
        creator_id: "creator_1",
        proposal_id: proposal.proposal_id,
        op: "restore_post_id",
        post_id: "b"
      },
      store
    );
    expect(restored.slots.map((s) => s.post_id)).toEqual(["a", "b", "c"]);
    expect(() =>
      applyPlanPatch(
        {
          creator_id: "creator_1",
          proposal_id: proposal.proposal_id,
          op: "set_interval_days",
          interval_days: 14,
          expected_version: 1
        },
        store
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_STALE_SELECTION" }));
  });

  it("compiles a shaped plan into one materialize_schedule op with due_ats", () => {
    const { store, proposal } = approvedStore();
    expect(() => compileFinitePlanChangeSet(proposal)).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
    const shaped = applyPlanPatch(
      {
        creator_id: "creator_1",
        proposal_id: proposal.proposal_id,
        op: "set_start",
        start_local: "2026-08-27T19:00:00",
        time_zone: "UTC"
      },
      store
    );
    const compiled = compileFinitePlanChangeSet(shaped.proposal);
    expect(compiled.write_layer).toBe("schedule_rail");
    expect(compiled.ops).toHaveLength(1);
    expect(compiled.ops[0]?.capability).toBe("materialize_schedule");
    expect(compiled.ops[0]?.payload.due_ats).toEqual(shaped.slots.map((s) => s.due_at));
    expect(compiled.resolved_post_ids).toEqual(["a", "b", "c"]);
  });
});
