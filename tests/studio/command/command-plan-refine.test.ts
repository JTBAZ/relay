import { describe, expect, it } from "vitest";
import type { AiGenerateStructuredResult } from "../../../src/ai/types.js";
import type { GalleryItem } from "../../../src/gallery/types.js";
import {
  parsePlanRefineInstruction,
  PLAN_REFINE_NEW_SELECTION_MESSAGE,
  PLAN_REFINE_UNAVAILABLE,
  refineCommandPlan,
  summarizePlanRefine
} from "../../../src/studio/command/command-plan-refine.js";
import { applyPlanPatch } from "../../../src/studio/command/proposal-patch.js";
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
      tier: "cheap",
      usage: { input_tokens: 8, output_tokens: 8 }
    }) satisfies AiGenerateStructuredResult;
}

function seedShapedPlan(store = createSelectionProposalStore()) {
  const items = [item({ post_id: "a", media_id: "ma" }), item({ post_id: "b", media_id: "mb" })];
  const created = upsertSelectionProposalFromPreview(
    items,
    { creator_id: "cr_plan", instruction: "weekly drops", post_ids: ["a", "b"] },
    store
  );
  patchSelectionProposal(
    { creator_id: "cr_plan", proposal_id: created.proposal_id, op: "approve" },
    store
  );
  const shaped = applyPlanPatch(
    {
      creator_id: "cr_plan",
      proposal_id: created.proposal_id,
      op: "set_start",
      start_local: "2026-09-03T19:00:00",
      time_zone: "UTC",
      weekday: 4
    },
    store
  );
  return { store, items, shaped };
}

describe("command plan refine (RC-P9 conversational)", () => {
  it("parses weekday, interval, and start phrases", () => {
    expect(parsePlanRefineInstruction("Change the drops to every Saturday.")).toEqual({
      op: "set_weekday",
      weekday: 6
    });
    expect(parsePlanRefineInstruction("every 3 days")).toEqual({
      op: "set_interval_days",
      interval_days: 3
    });
    expect(parsePlanRefineInstruction("start 2026-10-04", "2026-09-03T19:00:00")).toEqual({
      op: "set_start",
      start_local: "2026-10-04T19:00:00"
    });
    expect(parsePlanRefineInstruction("Use the weekend opener.")).toBeNull();
  });

  it("applies a Saturday phrase to the proposal only", async () => {
    const { store, items, shaped } = seedShapedPlan();
    const beforeWeekday = shaped.plan.weekday;
    const refined = await refineCommandPlan({
      creatorId: "cr_plan",
      proposalId: shaped.proposal.proposal_id,
      instruction: "Change the drops to every Saturday.",
      items,
      plannerEnabled: false,
      store
    });
    expect(beforeWeekday).not.toBe(6);
    expect(refined.op).toBe("set_weekday");
    expect(refined.plan.weekday).toBe(6);
    expect(refined.summary).toBe(summarizePlanRefine({ op: "set_weekday", plan: refined.plan }));
    expect(refined.proposal.frozen_post_ids).toEqual(["a", "b"]);
    expect(refined.proposal.stage).toBe("plan_shaping");
    expect(refined.slots).toHaveLength(2);
    expect(refined.proposal.plan?.weekday).toBe(6);
  });

  it("applies interval and start phrases without a planner", async () => {
    const { store, items, shaped } = seedShapedPlan();
    const interval = await refineCommandPlan({
      creatorId: "cr_plan",
      proposalId: shaped.proposal.proposal_id,
      instruction: "every 3 days",
      items,
      plannerEnabled: false,
      store
    });
    expect(interval.op).toBe("set_interval_days");
    expect(interval.plan.interval_days).toBe(3);

    const start = await refineCommandPlan({
      creatorId: "cr_plan",
      proposalId: shaped.proposal.proposal_id,
      instruction: "start 2026-10-04",
      items,
      plannerEnabled: false,
      store
    });
    expect(start.op).toBe("set_start");
    expect(start.plan.start_local).toMatch(/^2026-10-04T/);
  });

  it("maps a planner plan_patch and refuses a new selection", async () => {
    const { store, items, shaped } = seedShapedPlan();
    const patched = await refineCommandPlan({
      creatorId: "cr_plan",
      proposalId: shaped.proposal.proposal_id,
      instruction: "Use the weekend opener.",
      items,
      generate: stubGenerate({
        kind: "plan_patch",
        op: "set_weekday",
        weekday: "saturday"
      }),
      store
    });
    expect(patched.op).toBe("set_weekday");
    expect(patched.plan.weekday).toBe(6);

    await expect(
      refineCommandPlan({
        creatorId: "cr_plan",
        proposalId: shaped.proposal.proposal_id,
        instruction: "Put Hero Academy in a collection ordered by page, cover first.",
        items,
        generate: stubGenerate({
          kind: "selection_intent",
          query: { title_contains: "Hero Academy", numbered_sequence: true },
          collection_title: "Hero Academy"
        }),
        store
      })
    ).rejects.toMatchObject({ message: PLAN_REFINE_NEW_SELECTION_MESSAGE });

    await expect(
      refineCommandPlan({
        creatorId: "cr_plan",
        proposalId: shaped.proposal.proposal_id,
        instruction: "Use the weekend opener.",
        items,
        plannerEnabled: false,
        store
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "COMMAND_VALIDATION",
        message: PLAN_REFINE_UNAVAILABLE
      })
    );
  });
});
