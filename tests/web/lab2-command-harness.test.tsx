/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Lab2CommandHarness from "@/app/components/studio-lab2/Lab2CommandHarness";
import type { Lab2HarnessInterpretResult } from "@/lib/relay-api";

const FLAGS_ON = {
  layer_enabled: true,
  apply_enabled: true,
  mcp_enabled: false,
  studio_ux_enabled: false,
  selection_ux_enabled: false,
  schedule_plan_enabled: false
} as const;

afterEach(() => {
  cleanup();
  window.sessionStorage.removeItem("relay.lab2.last-applied-command");
});

const previewResult: Extract<Lab2HarnessInterpretResult, { kind: "preview" }> = {
  kind: "preview",
  scenario_id: "rc-df-04-watercolor-organize",
  change_set_id: "cs_harness_test",
  instruction: "Organize the watercolor landscapes newest first into a collection.",
  resolved_post_ids: ["sl2_wc_18"],
  ops: [
    {
      op_id: "op_1",
      capability: "create_or_update_collection",
      risk_class: "execute_undo",
      target_ids: ["sl2_col_watercolor"],
      payload: { collection_id: "sl2_col_watercolor", title: "Watercolor landscapes" }
    }
  ],
  write_layer: "collection",
  warnings: [],
  summary: "Collection “Watercolor landscapes” — 1 posts.",
  lens_hint: "collections",
  apply_ready: true
};

describe("Lab2CommandHarness (RC-P3-T06)", () => {
  it("starts idle with a labelled textbox and Preview that does not publish", () => {
    render(
      <Lab2CommandHarness
        creatorId="rcx_studio_lab2"
        flags={FLAGS_ON}
        interpret={vi.fn()}
        apply={vi.fn()}
        undo={vi.fn()}
      />
    );
    const root = document.querySelector("[data-lab2-command-harness]");
    expect(root?.getAttribute("data-lab2-command-state")).toBe("idle");
    expect(screen.getByLabelText("Lab 2 command")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset to baseline" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("moves through interpreting → preview → applying → applied and exposes Undo", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: previewResult });
    const apply = vi.fn().mockResolvedValue({ envelope: { change_set_id: "cs_harness_test" } });
    const onApplied = vi.fn();
    render(
      <Lab2CommandHarness
        creatorId="rcx_studio_lab2"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={apply}
        undo={vi.fn()}
        onApplied={onApplied}
      />
    );
    fireEvent.change(screen.getByLabelText("Lab 2 command"), {
      target: { value: previewResult.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(document.querySelector("[data-lab2-command-state]")?.getAttribute("data-lab2-command-state")).toBe(
      "interpreting"
    );
    await waitFor(() => {
      expect(screen.getByText(previewResult.summary)).toBeTruthy();
    });
    expect(document.querySelector("[data-lab2-command-state]")?.getAttribute("data-lab2-command-state")).toBe(
      "preview"
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => {
      expect(screen.getByText(/Applied/)).toBeTruthy();
    });
    expect(onApplied).toHaveBeenCalledWith({
      lens: "collections",
      changeSetId: "cs_harness_test"
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("asks one clarification and focuses the options", async () => {
    const interpret = vi.fn().mockResolvedValue({
      result: {
        kind: "clarification",
        scenario_id: "rc-df-03-ambiguous-academy",
        prompt: "Which Academy series?",
        candidate_labels: ["Academy Studies", "Hero Academy"]
      }
    });
    render(
      <Lab2CommandHarness creatorId="rcx_studio_lab2" flags={FLAGS_ON} interpret={interpret} apply={vi.fn()} undo={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText("Lab 2 command"), {
      target: { value: "Organize Academy into a collection." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => {
      expect(screen.getByText("Which Academy series?")).toBeTruthy();
    });
    expect(screen.getByRole("radio", { name: "Hero Academy" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Academy Studies" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Academy Studies" }));
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("shows schedule hint after a rail apply and error / undone states", async () => {
    const interpret = vi.fn().mockResolvedValue({
      result: { ...previewResult, lens_hint: "schedule", summary: "Weekly X plan for 13 posts." }
    });
    const apply = vi.fn().mockResolvedValue({ envelope: { change_set_id: "cs_harness_test" } });
    const undo = vi.fn().mockResolvedValue({ undo: { change_set_id: "cs_harness_test" } });
    render(
      <Lab2CommandHarness
        creatorId="rcx_studio_lab2"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={apply}
        undo={undo}
      />
    );
    fireEvent.change(screen.getByLabelText("Lab 2 command"), { target: { value: "plan x" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText(/Schedule slices are on the rail/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(screen.getByText(/Undone/)).toBeTruthy();
    });
    expect(document.querySelector("[data-lab2-command-state]")?.getAttribute("data-lab2-command-state")).toBe(
      "undone"
    );
  });

  it("shows error without publishing when interpret fails", async () => {
    const interpret = vi.fn().mockRejectedValue(new Error("Command layer is disabled."));
    render(
      <Lab2CommandHarness creatorId="rcx_studio_lab2" flags={FLAGS_ON} interpret={interpret} apply={vi.fn()} undo={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText("Lab 2 command"), { target: { value: "anything" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/disabled/);
    });
    expect(document.querySelector("[data-lab2-command-state]")?.getAttribute("data-lab2-command-state")).toBe(
      "error"
    );
  });

  it("Reset to baseline confirms, calls reset, and returns to idle", async () => {
    const resetBaseline = vi.fn().mockResolvedValue({
      restored: { creator_id: "rcx_studio_lab2", collection_count: 1, removed_collection_ids: ["sl2_col_hero_academy"] }
    });
    const onResetBaseline = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <Lab2CommandHarness
        creatorId="rcx_studio_lab2"
        flags={FLAGS_ON}
        interpret={vi.fn()}
        apply={vi.fn()}
        undo={vi.fn()}
        resetBaseline={resetBaseline}
        onResetBaseline={onResetBaseline}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset to baseline" }));
    await waitFor(() => {
      expect(resetBaseline).toHaveBeenCalledWith({ creator_id: "rcx_studio_lab2" });
    });
    expect(onResetBaseline).toHaveBeenCalled();
    expect(document.querySelector("[data-lab2-command-state]")?.getAttribute("data-lab2-command-state")).toBe(
      "idle"
    );
  });
});
