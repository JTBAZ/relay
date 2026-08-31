/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlanWorkbench from "@/app/components/studio/command/PlanWorkbench";
import {
  dayKey,
  dueAtOnLocalDay,
  occupancyByDay,
  planSlotConflicts,
  shouldOpenPlanWorkbench,
  unscheduledPostIds
} from "@/lib/command-plan-workbench";
import type { CommandSelectionProposalClient } from "@/lib/relay-api";
import type { ScheduleEvent } from "@/lib/schedule-rail-data";

afterEach(() => {
  cleanup();
});

const PLAN: NonNullable<CommandSelectionProposalClient["plan"]> = {
  version: 1,
  time_zone: "UTC",
  weekday: 4,
  interval_days: 7,
  start_local: "2026-09-03T19:00:00",
  exclude_post_ids: [],
  skip_post_ids: [],
  slot_overrides: {}
};

const SLOTS = [
  { post_id: "p1", due_at: "2026-09-03T19:00:00.000Z" },
  { post_id: "p2", due_at: "2026-09-10T19:00:00.000Z" }
];

const PROPOSAL: CommandSelectionProposalClient = {
  proposal_id: "pr_plan",
  creator_id: "rcx_pilot_dev_ava",
  stage: "plan_shaping",
  instruction: "weekly drops",
  snapshot: {
    post_ids: ["p1", "p2", "p3"],
    explanation: "schedule",
    warnings: [],
    revision: "rev",
    complete: true,
    creator_id: "rcx_pilot_dev_ava",
    created_at: "2026-08-30T00:00:00.000Z"
  },
  records: [
    { post_id: "p1", title: "Cover", member_label: "Cover", page_number: null, destination_flags: {} },
    { post_id: "p2", title: "Page 2", member_label: "Page 2", page_number: 2, destination_flags: {} },
    { post_id: "p3", title: "Page 3", member_label: "Page 3", page_number: 3, destination_flags: {} }
  ],
  exclude_post_ids: [],
  frozen_post_ids: ["p1", "p2", "p3"],
  frozen_revision: "frozen_rev",
  plan: PLAN
};

const OCCUPIED: ScheduleEvent = {
  id: "ev_existing",
  action: "post",
  title: "Already booked",
  destination: "x",
  at: "2026-09-03T15:00:00.000Z",
  notify: false,
  status: "pending",
  post_id: "other"
};

describe("plan workbench helpers (RC-P9-T03)", () => {
  it("opens only on Lab 3 with the schedule-plan flag and a schedule journey", () => {
    expect(
      shouldOpenPlanWorkbench({
        schedulePlanEnabled: true,
        surface: "lab3",
        writeLayer: "schedule_rail",
        lensHint: "schedule"
      })
    ).toBe(true);
    expect(
      shouldOpenPlanWorkbench({
        schedulePlanEnabled: true,
        surface: "lab3",
        writeLayer: "collection",
        lensHint: "collections",
        ops: [{ capability: "create_or_update_collection" }]
      })
    ).toBe(false);
    expect(
      shouldOpenPlanWorkbench({
        schedulePlanEnabled: false,
        surface: "lab3",
        writeLayer: "schedule_rail",
        lensHint: "schedule"
      })
    ).toBe(false);
    expect(
      shouldOpenPlanWorkbench({
        schedulePlanEnabled: true,
        surface: "lab2",
        writeLayer: "schedule_rail"
      })
    ).toBe(false);
  });

  it("keeps local time when moving a UTC slot to another day", () => {
    expect(dueAtOnLocalDay("2026-09-03T19:00:00.000Z", 2026, 9, 4, "UTC")).toBe(
      "2026-09-04T19:00:00.000Z"
    );
    expect(dayKey("2026-09-03T19:00:00.000Z", "UTC")).toBe("2026-09-03");
  });

  it("warns on occupied days without treating the same post as a conflict", () => {
    const conflicts = planSlotConflicts(SLOTS, [OCCUPIED], "UTC");
    expect(conflicts).toEqual([
      expect.objectContaining({ post_id: "p1", day_key: "2026-09-03", event_ids: ["ev_existing"] })
    ]);
    expect(occupancyByDay([OCCUPIED], "UTC")["2026-09-03"]?.[0]?.id).toBe("ev_existing");
    expect(unscheduledPostIds(["p1", "p2", "p3"], SLOTS)).toEqual(["p3"]);
  });
});

describe("PlanWorkbench (RC-P9-T03)", () => {
  it("collapses the confirmed selection and keeps the rail closed while the calendar is open", () => {
    render(
      <PlanWorkbench
        open
        proposal={PROPOSAL}
        plan={PLAN}
        slots={SLOTS}
        occupancy={[OCCUPIED]}
        timeZone="UTC"
        railOpen={false}
        applyEnabled
        onClose={vi.fn()}
        onApprovePlan={vi.fn()}
      />
    );
    expect(document.querySelector("[data-plan-workbench]")).toBeTruthy();
    expect(document.querySelector("[data-plan-calendar-open]")?.getAttribute("data-plan-calendar-open")).toBe(
      "true"
    );
    expect(document.querySelector("[data-lab3-rail-closed]")?.getAttribute("data-lab3-rail-closed")).toBe(
      "true"
    );
    expect(document.querySelector("[data-plan-selection-squash]")?.textContent).toMatch(/Pieces confirmed/);
    expect(document.querySelector("[data-plan-unscheduled]")?.textContent).toMatch(/Page 3/);
    expect(document.querySelector("[data-plan-conflicts]")?.textContent).toMatch(/already have rail events/);
    expect(document.querySelector("[data-plan-day-conflict='true']")).toBeTruthy();
    expect(document.querySelector("[data-plan-occupancy]")?.textContent).toMatch(/Already booked/);
    expect(screen.getByRole("button", { name: "Confirm schedule" })).toBeTruthy();
  });

  it("nests a compact plan composer inside the calendar overlay", () => {
    const onRefine = vi.fn();
    render(
      <PlanWorkbench
        open
        proposal={PROPOSAL}
        plan={PLAN}
        slots={SLOTS}
        occupancy={[]}
        timeZone="UTC"
        onClose={vi.fn()}
        onRefine={onRefine}
      />
    );
    const overlay = document.querySelector("[data-lab3-plan-workbench]");
    expect(overlay?.getAttribute("data-lab3-below-command")).toBeNull();
    expect(document.querySelector("[data-plan-composer]")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Refine schedule"), {
      target: { value: "Change the drops to every Saturday." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview plan change" }));
    expect(onRefine).toHaveBeenCalledWith("Change the drops to every Saturday.");
  });

  it("moves a selected tile through the same day target as drag", () => {
    const onMoveSlot = vi.fn();
    render(
      <PlanWorkbench
        open
        proposal={PROPOSAL}
        plan={PLAN}
        slots={SLOTS}
        occupancy={[]}
        timeZone="UTC"
        onClose={vi.fn()}
        onMoveSlot={onMoveSlot}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Move Cover" }));
    fireEvent.click(document.querySelector("[data-plan-day='2026-09-04']") as HTMLElement);
    expect(onMoveSlot).toHaveBeenCalledWith("p1", "2026-09-04T19:00:00.000Z");
  });
});
