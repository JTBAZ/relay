/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Lab3ScheduleRailFrame } from "@/app/components/studio-lab3/Lab3ScheduleRailFrame";
import { ScheduleRail } from "@/app/components/schedule-rail/ScheduleRail";
import PlanWorkbench from "@/app/components/studio/command/PlanWorkbench";
import type { CommandSelectionProposalClient } from "@/lib/relay-api";
import {
  lab3RailTransition,
  SCHEDULE_RAIL_LAB3_WIDTH_PX
} from "@/app/components/studio-lab3/lab3-constants";
import type { ScheduleData } from "@/lib/schedule-rail-data";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
}));

const SAMPLE: ScheduleData = {
  month: "2026-07",
  timezone: "America/New_York",
  remind_me_global: true,
  cadence: { posted: 1, target: 4 },
  postbot: { done: 0, total: 0 },
  ready: [],
  events: [
    {
      id: "ev_1",
      action: "post",
      title: "Publish character drop",
      destination: "x",
      at: "2026-07-22T15:00:00.000Z",
      notify: true,
      status: "pending",
      post_id: "post_1"
    }
  ]
};

function mockMatchMedia(opts: { lg: boolean; reduce: boolean }) {
  window.matchMedia = ((query: string) => {
    const matches = query.includes("min-width: 1024px")
      ? opts.lg
      : query.includes("prefers-reduced-motion")
        ? opts.reduce
        : false;
    return {
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null
    };
  }) as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
});

describe("Lab 3 schedule rail frame", () => {
  beforeEach(() => {
    mockMatchMedia({ lg: true, reduce: true });
  });

  it("defaults closed with an accessible handle and inert panel", () => {
    const onOpenChange = vi.fn();
    render(
      <Lab3ScheduleRailFrame open={false} onOpenChange={onOpenChange} widthPx={SCHEDULE_RAIL_LAB3_WIDTH_PX}>
        <div>Rail body</div>
      </Lab3ScheduleRailFrame>
    );
    const openHandle = screen.getByRole("button", { name: "Open schedule" });
    expect(openHandle).toBeTruthy();
    expect(openHandle.className).toContain("top-1/2");
    expect(openHandle.className).toContain("h-14");
    expect(openHandle.className).toContain("w-10");
    expect(openHandle.className).toContain("rounded-l-lg");
    expect(openHandle.className).toContain("border-0");
    expect(openHandle.className).not.toContain("border-[#9bf0c4]");
    expect(openHandle.querySelector(".lucide-calendar-days")).toBeTruthy();
    expect(openHandle.textContent).not.toMatch(/Schedule/);
    expect(document.querySelector("[data-lab3-rail-edge]")).toBeTruthy();
    const panel = document.querySelector("[data-lab3-rail-panel]");
    expect(panel?.getAttribute("data-lab3-rail-open")).toBe("false");
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
    expect(panel?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByText("Rail body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open schedule" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("disables interpolation under reduced motion", () => {
    expect(lab3RailTransition(true)).toEqual({ duration: 0 });
    expect(lab3RailTransition(false).duration).toBeGreaterThan(0);
  });

  it("opens in-flow at 312px on desktop", () => {
    render(
      <Lab3ScheduleRailFrame open onOpenChange={vi.fn()} widthPx={SCHEDULE_RAIL_LAB3_WIDTH_PX}>
        <div>Rail body</div>
      </Lab3ScheduleRailFrame>
    );
    expect(document.querySelector("[data-lab3-rail-layout]")?.getAttribute("data-lab3-rail-layout")).toBe(
      "flow"
    );
    const closeHandle = screen.getByRole("button", { name: "Close schedule" });
    expect(closeHandle.className).toContain("top-1/2");
    expect(closeHandle.className).toContain("border-0");
    expect(closeHandle.className).not.toContain("border-[#9bf0c4]");
    expect(closeHandle.querySelector(".lucide-calendar-days")).toBeTruthy();
    expect(closeHandle.getAttribute("data-lab3-rail-handle-open")).toBe("true");
    expect(document.querySelector("[data-lab3-rail-edge]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open schedule" })).toBeNull();
    const panel = document.querySelector("[data-lab3-rail-panel]") as HTMLElement;
    expect(panel.style.width).toBe("312px");
    expect(panel.getAttribute("data-lab3-rail-open")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(false);
  });

  it("uses an overlay sheet below lg", async () => {
    mockMatchMedia({ lg: false, reduce: true });
    render(
      <Lab3ScheduleRailFrame open onOpenChange={vi.fn()} widthPx={SCHEDULE_RAIL_LAB3_WIDTH_PX}>
        <div>Rail body</div>
      </Lab3ScheduleRailFrame>
    );
    await waitFor(() =>
      expect(document.querySelector("[data-lab3-rail-layout]")?.getAttribute("data-lab3-rail-layout")).toBe(
        "sheet"
      )
    );
    expect(document.querySelector("[data-lab3-rail-sheet-backdrop]")).toBeTruthy();
    expect(document.querySelector("[data-lab3-rail-handle]")).toBeNull();
  });

  it("does not render a floating handle below lg when closed", async () => {
    mockMatchMedia({ lg: false, reduce: true });
    render(
      <Lab3ScheduleRailFrame open={false} onOpenChange={vi.fn()} widthPx={SCHEDULE_RAIL_LAB3_WIDTH_PX}>
        <div>Rail body</div>
      </Lab3ScheduleRailFrame>
    );
    await waitFor(() =>
      expect(document.querySelector("[data-lab3-rail-layout]")?.getAttribute("data-lab3-rail-layout")).toBe(
        "sheet"
      )
    );
    expect(screen.queryByRole("button", { name: "Open schedule" })).toBeNull();
    expect(document.querySelector("[data-lab3-rail-handle]")).toBeNull();
  });

  it("returns focus to the seam toggle after collapse", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Lab3ScheduleRailFrame open onOpenChange={onOpenChange} widthPx={SCHEDULE_RAIL_LAB3_WIDTH_PX}>
        <div>Rail body</div>
      </Lab3ScheduleRailFrame>
    );
    fireEvent.click(screen.getByRole("button", { name: "Close schedule" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(
      <Lab3ScheduleRailFrame open={false} onOpenChange={onOpenChange} widthPx={SCHEDULE_RAIL_LAB3_WIDTH_PX}>
        <div>Rail body</div>
      </Lab3ScheduleRailFrame>
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open schedule" }));
  });
});

describe("Lab 3 inspect schedule chrome", () => {
  it("hides import, automations, and add; shows calendar; collapse is not in the header", () => {
    const onOpenCalendar = vi.fn();
    render(
      <ScheduleRail
        data={SAMPLE}
        onDataChange={vi.fn()}
        remindersGlobal
        onRemindersToggle={vi.fn()}
        chrome="inspect"
        dayPresentation="adaptive"
        onOpenCalendar={onOpenCalendar}
        widthPx={SCHEDULE_RAIL_LAB3_WIDTH_PX}
      />
    );
    expect(screen.getByRole("button", { name: "Open calendar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Collapse schedule" })).toBeNull();
    expect(screen.queryByLabelText("Add scheduled post")).toBeNull();
    expect(screen.queryByLabelText("Open Automations")).toBeNull();
    expect(screen.queryByText("Monthly Goal")).toBeNull();
    expect(screen.queryByText("Drag to Schedule")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    expect(onOpenCalendar).toHaveBeenCalled();
  });
});

describe("Lab 3 plan calendar vs rail (RC-P9-T03)", () => {
  it("keeps the production rail closed while the plan calendar is open", () => {
    const plan: NonNullable<CommandSelectionProposalClient["plan"]> = {
      version: 1,
      time_zone: "UTC",
      weekday: 4,
      interval_days: 7,
      start_local: "2026-09-03T19:00:00",
      exclude_post_ids: [],
      skip_post_ids: [],
      slot_overrides: {}
    };
    const proposal: CommandSelectionProposalClient = {
      proposal_id: "pr_rail",
      creator_id: "rcx_pilot_dev_ava",
      stage: "plan_shaping",
      instruction: "weekly drops",
      snapshot: {
        post_ids: ["p1"],
        explanation: "",
        warnings: [],
        revision: "rev",
        complete: true,
        creator_id: "rcx_pilot_dev_ava",
        created_at: "2026-08-30T00:00:00.000Z"
      },
      records: [
        { post_id: "p1", title: "Cover", member_label: "Cover", page_number: null, destination_flags: {} }
      ],
      exclude_post_ids: [],
      frozen_post_ids: ["p1"],
      frozen_revision: "frozen",
      plan
    };
    render(
      <>
        <Lab3ScheduleRailFrame open={false} onOpenChange={vi.fn()} widthPx={SCHEDULE_RAIL_LAB3_WIDTH_PX}>
          <div>Rail body</div>
        </Lab3ScheduleRailFrame>
        <PlanWorkbench
          open
          proposal={proposal}
          plan={plan}
          slots={[{ post_id: "p1", due_at: "2026-09-03T19:00:00.000Z" }]}
          railOpen={false}
          onClose={vi.fn()}
        />
      </>
    );
    expect(document.querySelector("[data-lab3-rail-panel]")?.getAttribute("data-lab3-rail-open")).toBe(
      "false"
    );
    expect(screen.queryByText("Rail body")).toBeNull();
    expect(document.querySelector("[data-plan-calendar-open]")?.getAttribute("data-plan-calendar-open")).toBe(
      "true"
    );
    expect(document.querySelector("[data-lab3-rail-closed]")?.getAttribute("data-lab3-rail-closed")).toBe(
      "true"
    );
  });
});
