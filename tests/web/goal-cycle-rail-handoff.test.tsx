/** @vitest-environment happy-dom */

/**
 * VS7-T04 / T06 — rail handoff helpers + Dream receipt wiring characterization.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  GoalCycleMaterializationReceipt,
  GoalCyclePlan
} from "../../web/lib/goal-cycle-types";
import {
  collectMissingMediaSlots,
  collectRailEventIds,
  railHighlightTimings
} from "../../web/app/components/goal-cycle/goal-cycle-rail-handoff";

const root = join(process.cwd());

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function sampleReceipt(
  patch: Partial<GoalCycleMaterializationReceipt> = {}
): GoalCycleMaterializationReceipt {
  return {
    cycle_id: "cyc_1",
    approval_key: "appr_1",
    status: "materialized",
    materialized_at: "2026-07-17T20:00:00.000Z",
    slots: [
      {
        slot_id: "slot_1",
        post_id: "relay_p_1",
        distribution_plan_id: "plan_1",
        variant_ids: ["var_1"],
        task_ids: ["task_1"],
        rail_event_ids: ["task_1"],
        mode: "new_post"
      },
      {
        slot_id: "slot_2",
        post_id: "relay_p_2",
        distribution_plan_id: "plan_2",
        variant_ids: ["var_2"],
        task_ids: ["task_2"],
        rail_event_ids: ["task_2"],
        mode: "new_post"
      }
    ],
    ...patch
  };
}

function samplePlan(): GoalCyclePlan {
  return {
    version: 1,
    rationale: "r",
    slots: [
      {
        id: "slot_1",
        intent: "hook",
        format: "image_post",
        title: "Warm-up",
        draft_body: "b",
        destination_ids: ["patreon"],
        scheduled_local: "2026-07-20T19:00:00",
        scheduled_utc: "2026-07-20T23:00:00.000Z",
        time_zone: "America/New_York",
        media_state: "missing",
        evidence_refs: []
      },
      {
        id: "slot_2",
        intent: "hook",
        format: "image_post",
        title: "Ready piece",
        draft_body: "b",
        destination_ids: ["patreon"],
        scheduled_local: "2026-07-21T19:00:00",
        scheduled_utc: "2026-07-21T23:00:00.000Z",
        time_zone: "America/New_York",
        media_state: "ready",
        evidence_refs: []
      }
    ],
    questions_asked: [],
    ai_revision_count: 0,
    evidence_summary: "",
    warnings: [],
    logistics: {
      time_zone: "America/New_York",
      linked_destination_ids: ["patreon"],
      notes: null
    }
  };
}

describe("VS7-T04 rail handoff helpers", () => {
  it("collects unique rail event ids in order", () => {
    expect(collectRailEventIds(sampleReceipt())).toEqual(["task_1", "task_2"]);
    expect(collectRailEventIds(sampleReceipt({ slots: [] }))).toEqual([]);
  });

  it("exposes missing-media slots for VS8 without inventing ready ones", () => {
    const missing = collectMissingMediaSlots(sampleReceipt(), samplePlan());
    expect(missing).toEqual([
      {
        slot_id: "slot_1",
        title: "Warm-up",
        post_id: "relay_p_1",
        media_state: "missing"
      }
    ]);
  });

  it("collapses choreography when reduced motion is preferred", () => {
    expect(railHighlightTimings(true)).toEqual({
      paintMs: 0,
      openPopoverMs: 0,
      clearMs: 400,
      smoothScroll: false
    });
    expect(railHighlightTimings(false).smoothScroll).toBe(true);
  });

  it("never focuses the rail without event ids (silence / empty)", () => {
    const ids = collectRailEventIds(sampleReceipt({ slots: [] }));
    expect(ids[0] ?? null).toBeNull();
  });
});

describe("VS7-T04/T06 wiring characterization", () => {
  it("StudioScheduleRail exposes refreshAndHighlight imperative handle", () => {
    const src = readSrc("web/app/components/schedule-rail/StudioScheduleRail.tsx");
    expect(src).toMatch(/refreshAndHighlight/);
    expect(src).toMatch(/highlightEventIds/);
    expect(src).toMatch(/forwardRef/);
  });

  it("ScheduleRail highlights batch ids with reduced-motion timings", () => {
    const src = readSrc("web/app/components/schedule-rail/ScheduleRail.tsx");
    expect(src).toMatch(/highlightEventIds/);
    expect(src).toMatch(/prefers-reduced-motion/);
    expect(src).toMatch(/data-highlighted/);
  });

  it("Gallery wires GoalCycleLauncher onMaterialized to the rail", () => {
    const src = readSrc("web/app/studio/GalleryView.tsx");
    expect(src).toMatch(/onMaterialized/);
    expect(src).toMatch(/collectRailEventIds/);
    expect(src).toMatch(/scheduleRailRef/);
    expect(src).toMatch(/refreshAndHighlight/);
  });

  it("Launcher calls approveCreatorGoalCycle before announcing success", () => {
    const src = readSrc("web/app/components/goal-cycle/GoalCycleLauncher.tsx");
    expect(src).toMatch(/approveCreatorGoalCycle/);
    expect(src).toMatch(/onMaterialized/);
    expect(src).not.toMatch(/materialization comes in a later release/);
  });

  it("Flow shows ReceiptSummary and keeps approval on failure", () => {
    const src = readSrc("web/app/components/goal-cycle/GoalCycleFlow.tsx");
    expect(src).toMatch(/ReceiptSummary/);
    expect(src).toMatch(/Stay on approval/);
    expect(src).toMatch(/approving/);
  });
});

describe("VS7-T06 receipt summary component contract", () => {
  it("exports ReceiptSummary with missing-media test id", () => {
    const src = readSrc("web/app/components/goal-cycle/ReceiptSummary.tsx");
    expect(src).toMatch(/data-testid="goal-cycle-receipt-summary"/);
    expect(src).toMatch(/data-testid="receipt-missing-media"/);
    expect(src).toMatch(/collectMissingMediaSlots/);
  });
});

// silence unused vi import if characterization-only
void vi;
