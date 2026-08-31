/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommandBox from "@/app/components/studio/command/CommandBox";
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

describe("Command journey states (RC-DF-02 / RC-DF-03)", () => {
  it("RC-DF-02: a typed sentence can Preview without MCP", async () => {
    const interpret = vi.fn().mockResolvedValue({
      result: {
        kind: "preview",
        scenario_id: "rc-df-03-exact-hero-academy",
        change_set_id: "cs_journey",
        instruction: "Organize Hero Academy into a collection, cover first, in page order.",
        resolved_post_ids: ["sl2_ha_cover"],
        ops: [
          {
            op_id: "op_1",
            capability: "create_or_update_collection",
            risk_class: "execute_undo",
            target_ids: ["sl2_col_hero_academy"],
            payload: {}
          }
        ],
        write_layer: "collection",
        warnings: ["Missing page 17 — not invented."],
        summary: "Collection “Hero Academy” — 20 posts.",
        lens_hint: "collections",
        apply_ready: true
      } satisfies Extract<Lab2HarnessInterpretResult, { kind: "preview" }>
    });
    render(
      <CommandBox
        creatorId="rcx_studio_lab2"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
        label="Lab 2 command"
      />
    );
    fireEvent.change(screen.getByLabelText("Lab 2 command"), {
      target: { value: "Organize Hero Academy into a collection, cover first, in page order." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => {
      expect(screen.getByText(/Hero Academy/)).toBeTruthy();
    });
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
  });

  it("RC-DF-03: ambiguous Academy asks once and blocks Apply until Continue", async () => {
    const interpret = vi.fn().mockResolvedValue({
      result: {
        kind: "clarification",
        scenario_id: "rc-df-03-ambiguous-academy",
        prompt: "Which Academy series?",
        candidate_labels: ["Academy Studies", "Hero Academy"]
      }
    });
    render(
      <CommandBox
        creatorId="rcx_studio_lab2"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
        label="Lab 2 command"
      />
    );
    fireEvent.change(screen.getByLabelText("Lab 2 command"), {
      target: { value: "Organize Academy into a collection." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByText("Which Academy series?"));
    expect(screen.getByRole("radio", { name: "Hero Academy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("RC-DF-16 wiring: organize → weekly X → watercolor revise → undo (happy-dom, not HUMAN-UX-JOURNEY)", async () => {
    const interpret = vi.fn()
      .mockResolvedValueOnce({
        result: {
          kind: "preview",
          scenario_id: "rc-df-03-exact-hero-academy",
          change_set_id: "cs_ha",
          instruction: "Organize Hero Academy into a collection, cover first, in page order.",
          resolved_post_ids: ["sl2_ha_cover"],
          ops: [
            {
              op_id: "op_ha",
              capability: "create_or_update_collection",
              risk_class: "execute_undo",
              target_ids: ["sl2_col_hero_academy"],
              payload: {}
            }
          ],
          write_layer: "collection",
          warnings: ["Missing page 17 — not invented.", "Duplicate page 8 — both copies kept until you choose."],
          summary: "Collection “Hero Academy” — 20 posts.",
          lens_hint: "collections",
          apply_ready: true
        } satisfies Extract<Lab2HarnessInterpretResult, { kind: "preview" }>
      })
      .mockResolvedValueOnce({
        result: {
          kind: "preview",
          scenario_id: "rc-df-07-skip-posted-on-x",
          change_set_id: "cs_x",
          instruction: "Plan a weekly X schedule for Hero Academy, skipping pages already posted on X.",
          resolved_post_ids: ["sl2_ha_p07"],
          ops: [
            {
              op_id: "op_x",
              capability: "materialize_schedule",
              risk_class: "execute_undo",
              target_ids: ["sl2_ha_p07"],
              payload: {}
            }
          ],
          write_layer: "schedule_rail",
          warnings: [
            "Skipping 6 posts already posted on X.",
            "Lab 2 fact pack shows a Tuesday-evening timing cluster for cited posts."
          ],
          summary: "Weekly X plan for 13 posts (already-posted skipped).",
          lens_hint: "schedule",
          apply_ready: true
        } satisfies Extract<Lab2HarnessInterpretResult, { kind: "preview" }>
      })
      .mockResolvedValueOnce({
        result: {
          kind: "preview",
          scenario_id: "rc-df-04-watercolor-organize",
          change_set_id: "cs_wc",
          instruction: "Organize the watercolor landscapes newest first into a collection.",
          resolved_post_ids: ["sl2_wc_18"],
          ops: [
            {
              op_id: "op_wc",
              capability: "create_or_update_collection",
              risk_class: "execute_undo",
              target_ids: ["sl2_col_watercolor"],
              payload: {}
            }
          ],
          write_layer: "collection",
          warnings: [],
          summary: "Collection “Watercolor landscapes” — 18 posts.",
          lens_hint: "collections",
          apply_ready: true
        } satisfies Extract<Lab2HarnessInterpretResult, { kind: "preview" }>
      });
    const apply = vi.fn().mockResolvedValue({ change_set_id: "applied" });
    const undo = vi.fn().mockResolvedValue({ undone: true });
    render(
      <CommandBox
        creatorId="rcx_studio_lab2"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={apply}
        undo={undo}
        label="Lab 2 command"
      />
    );
    const field = screen.getByLabelText("Lab 2 command");

    fireEvent.change(field, {
      target: { value: "Organize Hero Academy into a collection, cover first, in page order." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByText(/Missing page 17/));
    expect(screen.getByText(/Duplicate page 8/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));

    fireEvent.change(field, {
      target: {
        value: "Plan a weekly X schedule for Hero Academy, skipping pages already posted on X."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByText(/Skipping 6 posts already posted on X/));
    expect(screen.getByText(/Tuesday-evening timing cluster/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => screen.getByText(/Schedule slices are on the rail/));

    fireEvent.change(field, {
      target: { value: "Organize the watercolor landscapes newest first into a collection." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByText(/Watercolor landscapes/));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => screen.getByText(/Undone/));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(3);
  });
});
