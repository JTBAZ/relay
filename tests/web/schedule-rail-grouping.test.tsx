/** @vitest-environment happy-dom */

/**
 * Schedule Rail visual grouping — EventPopover multi-dest Dismiss uses child task id.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventPopover } from "../../web/app/components/schedule-rail/EventPopover";
import type { ScheduleEvent } from "../../web/lib/schedule-rail-data";
import { railItemMatchesId } from "../../web/lib/schedule-rail-data";

const groupedEvent: ScheduleEvent = {
  id: "grp_p1_2026-07-20T15:00_post",
  task_id: "task_x",
  variant_id: "var_x",
  post_id: "p1",
  action: "post",
  title: "July drop",
  rationale: "Ship both",
  destination: "x",
  at: "2026-07-20T15:00:00.000Z",
  notify: true,
  status: "pending",
  needs_media: false,
  media_count: 1,
  destinations: [
    {
      destination: "patreon",
      task_id: "task_patreon",
      variant_id: "var_patreon",
      status: "pending",
    },
    {
      destination: "x",
      task_id: "task_x",
      variant_id: "var_x",
      status: "pending",
    },
  ],
};

describe("railItemMatchesId", () => {
  it("matches group id, primary task, or child task", () => {
    expect(railItemMatchesId(groupedEvent, groupedEvent.id)).toBe(true);
    expect(railItemMatchesId(groupedEvent, "task_x")).toBe(true);
    expect(railItemMatchesId(groupedEvent, "task_patreon")).toBe(true);
    expect(railItemMatchesId(groupedEvent, "task_other")).toBe(false);
  });
});

describe("EventPopover multi-destination", () => {
  it("renders destination chips and Dismiss calls through with child task id", () => {
    const onDelete = vi.fn();
    render(
      <EventPopover
        event={groupedEvent}
        onDelete={onDelete}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/Patreon/)).toBeTruthy();
    expect(screen.getByText(/X ·/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();

    const dismissButtons = screen.getAllByRole("button", { name: "Dismiss" });
    expect(dismissButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(dismissButtons[0]!);
    expect(onDelete).toHaveBeenCalledWith("task_patreon");
  });
});
