/** @vitest-environment happy-dom */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LogisticsStep } from "../../web/app/components/goal-cycle/LogisticsStep";
import type { GoalCyclePlan } from "../../web/lib/goal-cycle-types";

const plan: GoalCyclePlan = {
  version: 1,
  rationale: "test",
  questions_asked: [],
  ai_revision_count: 0,
  evidence_summary: "",
  warnings: [],
  logistics: {
    time_zone: "America/New_York",
    linked_destination_ids: ["patreon"],
    notes: null
  },
  slots: [
    {
      id: "slot_1",
      intent: "active_rest",
      format: "journal",
      title: "Low-energy WIP update",
      draft_body: "",
      destination_ids: ["patreon"],
      scheduled_local: "2026-07-22T15:00:00",
      scheduled_utc: "2026-07-22T19:00:00.000Z",
      time_zone: "America/New_York",
      media_state: "not_required",
      evidence_refs: []
    }
  ]
};

describe("LogisticsStep schedule edit", () => {
  it("updates scheduled_utc when datetime-local changes", () => {
    const onSlotChange = vi.fn();
    render(
      <LogisticsStep
        plan={plan}
        linkedDestinationIds={["patreon"]}
        onSlotChange={onSlotChange}
        onLogisticsNotesChange={() => {}}
        onBack={() => {}}
        onContinue={() => {}}
      />
    );

    const input = screen.getByTestId("logistics-local-slot_1");
    fireEvent.change(input, { target: { value: "2026-07-25T10:00" } });

    expect(onSlotChange).toHaveBeenCalledWith(
      "slot_1",
      expect.objectContaining({
        scheduled_local: "2026-07-25T10:00:00",
        scheduled_utc: "2026-07-25T14:00:00.000Z"
      })
    );
  });
});
