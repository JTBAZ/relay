/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandBox from "@/app/components/studio/command/CommandBox";
import {
  LAB3_COMMAND_EXAMPLE_FADE_MS,
  LAB3_COMMAND_EXAMPLE_INTERVAL_MS,
  LAB3_COMMAND_STARTERS,
  Lab3CommandGhost,
  Lab3CommandStarterRail,
  Lab3CommandTeaching
} from "@/app/components/studio/command/Lab3CommandStarters";
import { highestCommandRisk, isStaleChangeSetError } from "@/lib/command-risk";
import { RelayApiError, type Lab2HarnessInterpretResult } from "@/lib/relay-api";
import { LAB2_LAST_APPLIED_KEY } from "@/lib/studio-view-preset";

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
  window.sessionStorage.removeItem(LAB2_LAST_APPLIED_KEY);
});

const executePreview: Extract<Lab2HarnessInterpretResult, { kind: "preview" }> = {
  kind: "preview",
  scenario_id: "rc-df-04-watercolor-organize",
  change_set_id: "cs_box_test",
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

describe("command-risk", () => {
  it("ranks publish_confirm above review and execute_undo", () => {
    expect(highestCommandRisk([{ risk_class: "execute_undo" }])).toBe("execute_undo");
    expect(highestCommandRisk([{ risk_class: "review" }, { risk_class: "execute_undo" }])).toBe(
      "review"
    );
    expect(
      highestCommandRisk([{ risk_class: "review" }, { risk_class: "publish_confirm" }])
    ).toBe("publish_confirm");
  });

  it("detects stale ChangeSet errors", () => {
    expect(isStaleChangeSetError(new RelayApiError("stale", 409, "COMMAND_STALE_SELECTION"))).toBe(
      true
    );
    expect(isStaleChangeSetError(new Error("ok"))).toBe(false);
  });
});

describe("CommandBox (RC-P4-T01)", () => {
  it("starts idle with a labelled command field", () => {
    render(<CommandBox creatorId="rcx_studio_lab2" flags={FLAGS_ON} interpret={vi.fn()} apply={vi.fn()} undo={vi.fn()} />);
    expect(document.querySelector("[data-command-state]")?.getAttribute("data-command-state")).toBe(
      "idle"
    );
    expect(screen.getByLabelText("Command")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("errors on empty Preview and Retry re-runs interpret", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: executePreview });
    render(
      <CommandBox creatorId="rcx_studio_lab2" flags={FLAGS_ON} interpret={interpret} apply={vi.fn()} undo={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Type a command first/);
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: executePreview.instruction } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    expect(interpret).toHaveBeenCalled();
  });

  it("uses Execute + Undo Apply for execute_undo and exposes Undo after apply", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: executePreview });
    const apply = vi.fn().mockResolvedValue({ envelope: { change_set_id: "cs_box_test" } });
    render(
      <CommandBox creatorId="rcx_studio_lab2" flags={FLAGS_ON} interpret={interpret} apply={apply} undo={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: executePreview.instruction } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText(/Safe internal change/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    expect(document.querySelector("[data-command-applied]")).toBeTruthy();
    expect(document.querySelector("[data-command-applied]")?.className).toMatch(/motion-reduce/);
  });

  it("labels Review & apply for compact review risk", async () => {
    const interpret = vi.fn().mockResolvedValue({
      result: {
        ...executePreview,
        ops: [{ ...executePreview.ops[0], risk_class: "review" }]
      }
    });
    render(
      <CommandBox creatorId="rcx_studio_lab2" flags={FLAGS_ON} interpret={interpret} apply={vi.fn()} undo={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "review me" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByRole("button", { name: "Review & apply" }));
    expect(screen.getByText(/Compact review/)).toBeTruthy();
  });

  it("disables Apply for publish_confirm", async () => {
    const interpret = vi.fn().mockResolvedValue({
      result: {
        ...executePreview,
        ops: [{ ...executePreview.ops[0], risk_class: "publish_confirm" }]
      }
    });
    render(
      <CommandBox creatorId="rcx_studio_lab2" flags={FLAGS_ON} interpret={interpret} apply={vi.fn()} undo={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "publish" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByText(/does not publish/));
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review & apply" })).toBeNull();
  });

  it("stale apply keeps Apply disabled until a new Preview", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: executePreview });
    const apply = vi
      .fn()
      .mockRejectedValue(new RelayApiError("stale selection", 409, "COMMAND_STALE_SELECTION"));
    render(
      <CommandBox creatorId="rcx_studio_lab2" flags={FLAGS_ON} interpret={interpret} apply={apply} undo={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: executePreview.instruction } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/stale/i);
    });
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/Preview again before Apply/);
  });

  it("Enter Previews and never Applies; focus stays in the command field after Apply", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: executePreview });
    const apply = vi.fn().mockResolvedValue({ envelope: { change_set_id: "cs_box_test" } });
    render(
      <CommandBox creatorId="rcx_studio_lab2" flags={FLAGS_ON} interpret={interpret} apply={apply} undo={vi.fn()} />
    );
    const field = screen.getByLabelText("Command");
    fireEvent.change(field, { target: { value: executePreview.instruction } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(interpret).toHaveBeenCalledTimes(2));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("Command"));
  });

  it("disables the box with a calm message when the command layer is off", () => {
    render(
      <CommandBox
        creatorId="rcx_studio_lab2"
        flags={{
          layer_enabled: false,
          apply_enabled: false,
          mcp_enabled: false,
          studio_ux_enabled: false,
          selection_ux_enabled: false,
          schedule_plan_enabled: false
        }}
        interpret={vi.fn()}
        apply={vi.fn()}
        undo={vi.fn()}
      />
    );
    expect(screen.getByRole("status").textContent).toMatch(/Command layer is off/);
    expect(screen.getByLabelText("Command")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Preview" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("restores Undo after remount when Lab 2 last-applied is in sessionStorage", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: executePreview });
    const apply = vi.fn().mockResolvedValue({ envelope: { change_set_id: executePreview.change_set_id } });
    const { unmount } = render(
      <CommandBox
        creatorId="rcx_studio_lab2"
        surface="lab2"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={apply}
        undo={vi.fn()}
        label="Lab 2 command"
      />
    );
    fireEvent.change(screen.getByLabelText("Lab 2 command"), {
      target: { value: executePreview.instruction }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    unmount();
    render(
      <CommandBox
        creatorId="rcx_studio_lab2"
        surface="lab2"
        flags={FLAGS_ON}
        interpret={vi.fn()}
        apply={vi.fn()}
        undo={vi.fn()}
        label="Lab 2 command"
      />
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.getByText(/Watercolor landscapes/)).toBeTruthy();
  });
});

describe("CommandBox instrument (Lab 3)", () => {
  it("uses an arrow Preview control and hides Apply until preview", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: executePreview });
    render(
      <CommandBox
        creatorId="test_creator"
        surface="lab3"
        presentation="instrument"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
      />
    );
    expect(document.querySelector("[data-command-presentation]")?.getAttribute("data-command-presentation")).toBe(
      "instrument"
    );
    expect(screen.getByText("Studio Command")).toBeTruthy();
    expect(screen.getByText("Arrange, schedule, or prepare drafts")).toBeTruthy();
    expect(screen.getByLabelText("Studio Command").getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByLabelText("Studio Command").getAttribute("aria-describedby")).toBeTruthy();
    expect(document.querySelector("[data-command-instrument-command-row]")).toBeTruthy();
    expect(document.querySelector("[data-command-instrument-console]")?.className).toContain("max-w-[68rem]");
    expect(document.querySelector("[data-command-instrument-console]")?.className).toContain("mx-auto");
    expect(document.querySelector("[aria-label='Preview command'] .lucide-arrow-right")).toBeTruthy();
    expect(document.querySelector("[data-lab3-command-ghost] span")?.className).toContain(
      "text-[13px]"
    );
    expect(document.querySelector("[data-lab3-command-ghost] span")?.className).toContain(
      "sm:text-[14px]"
    );
    expect(document.querySelector("[data-lab3-command-ghost] span")?.className).toContain(
      "--lab3-text-command,#b8c2bc"
    );
    expect(screen.getByLabelText("Studio Command").className).toContain("text-[13px]");
    expect(screen.getByLabelText("Studio Command").className).toContain("sm:text-[14px]");
    expect(screen.getByLabelText("Studio Command").className).toContain(
      "--lab3-text-command,#b8c2bc"
    );
    expect(document.querySelector("[data-lab3-command-starters-inline]")?.className).toContain("h-11");
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset to baseline" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Studio Command"), { target: { value: executePreview.instruction } });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    expect(interpret).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: "test_creator",
        surface: "lab3"
      })
    );
  });

  it("shows Undo only after Apply and calls onApplied", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: executePreview });
    const apply = vi.fn().mockResolvedValue({ envelope: { change_set_id: "cs_box_test" } });
    const onApplied = vi.fn();
    render(
      <CommandBox
        creatorId="test_creator"
        presentation="instrument"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={apply}
        undo={vi.fn()}
        onApplied={onApplied}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), { target: { value: executePreview.instruction } });
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    expect(onApplied).toHaveBeenCalledWith({
      lens: "collections",
      changeSetId: "cs_box_test"
    });
  });

  it("stays visible but disabled when the command layer is off", () => {
    render(
      <CommandBox
        creatorId="test_creator"
        presentation="instrument"
        flags={{
          layer_enabled: false,
          apply_enabled: false,
          mcp_enabled: false,
          studio_ux_enabled: false,
          selection_ux_enabled: false,
          schedule_plan_enabled: false
        }}
        interpret={vi.fn()}
        apply={vi.fn()}
        undo={vi.fn()}
      />
    );
    expect(screen.getByRole("status").textContent).toMatch(/Command layer is off/);
    expect(screen.getByLabelText("Studio Command")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Preview command" })).toHaveProperty("disabled", true);
    const wrap = document.querySelector("[data-command-presentation='instrument']");
    const consoleEl = document.querySelector("[data-command-instrument-console]");
    expect(document.querySelector("[data-command-instrument-status]")).toBeTruthy();
    expect(wrap?.className).toContain("px-5");
    expect(wrap?.className).toContain("sm:px-6");
    expect(wrap?.className).toContain("pt-5");
    expect(wrap?.className).toContain("sm:pt-10");
    expect(wrap?.className).toContain("sm:pb-4");
    expect(wrap?.className).not.toContain("max-w-[68rem]");
    expect(wrap?.className).not.toContain("mx-auto");
    expect(consoleEl?.className).toContain("w-full");
    expect(consoleEl?.className).toContain("max-w-[68rem]");
    expect(consoleEl?.className).toContain("mx-auto");
    expect(consoleEl?.className).toContain("sm:min-h-[7.5rem]");
    expect(consoleEl?.className).toContain("rounded-2xl");
    expect(consoleEl?.className).toContain("bg-[var(--lab3-instrument,#0f1210)]");
    expect(consoleEl?.className).not.toContain("min-h-[144px]");
    expect(document.querySelector("[data-command-instrument-command-row]")).toBeTruthy();
    expect(screen.getByText("Studio Command")).toBeTruthy();
    expect(screen.getByText("Arrange, schedule, or prepare drafts")).toBeTruthy();
    expect(consoleEl?.contains(document.querySelector("[data-lab3-command-starters-inline]"))).toBe(
      true
    );
    expect(document.querySelector("[data-lab3-command-ghost-disabled]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Organize" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Prepare drafts" })).toHaveProperty("disabled", true);
  });

  it("fills from a ghost example without submitting Preview", () => {
    const interpret = vi.fn();
    render(
      <CommandBox
        creatorId="test_creator"
        presentation="instrument"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
      />
    );
    const ghost = document.querySelector("[data-lab3-command-ghost] span");
    expect(ghost?.textContent).toMatch(/Hero Academy/);
    fireEvent.click(ghost as HTMLButtonElement);
    expect((screen.getByLabelText("Studio Command") as HTMLTextAreaElement).value).toMatch(/Hero Academy/);
    expect(interpret).not.toHaveBeenCalled();
    expect(document.querySelector("[data-lab3-command-ghost]")).toBeNull();
    expect(document.querySelector("[data-lab3-command-starters]")).toBeTruthy();
  });

  it("keeps starter icons while typing and hides them once Preview starts", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: executePreview });
    render(
      <CommandBox
        creatorId="test_creator"
        presentation="instrument"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Studio Command"), {
      target: { value: executePreview.instruction }
    });
    expect(document.querySelector("[data-lab3-command-ghost]")).toBeNull();
    expect(document.querySelector("[data-lab3-command-starters]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => screen.getByRole("button", { name: "Apply" }));
    expect(document.querySelector("[data-lab3-command-ghost]")).toBeNull();
    expect(document.querySelector("[data-lab3-command-starters]")).toBeNull();
  });

  it("runs the visible ghost example when Preview is empty", async () => {
    const interpret = vi.fn().mockResolvedValue({ result: executePreview });
    render(
      <CommandBox
        creatorId="test_creator"
        presentation="instrument"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
      />
    );
    const ghost = document.querySelector("[data-lab3-command-ghost] span")?.textContent ?? "";
    expect(ghost).toMatch(/Hero Academy/);
    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    await waitFor(() => expect(interpret).toHaveBeenCalled());
    expect(interpret.mock.calls[0]?.[0].instruction).toBe(ghost);
    expect((screen.getByLabelText("Studio Command") as HTMLTextAreaElement).value).toBe(ghost);
  });

  it("changes ghost examples from a starter without filling the field", () => {
    const interpret = vi.fn();
    render(
      <CommandBox
        creatorId="test_creator"
        presentation="instrument"
        flags={FLAGS_ON}
        interpret={interpret}
        apply={vi.fn()}
        undo={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.getByRole("button", { name: "Schedule" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toMatch(/weekly X schedule/);
    expect((screen.getByLabelText("Studio Command") as HTMLTextAreaElement).value).toBe("");
    expect(document.querySelector("[data-command-instrument-console]")?.contains(
      document.querySelector("[data-lab3-command-starters-inline]")
    )).toBe(true);
    expect(interpret).not.toHaveBeenCalled();
  });

  it("pauses ghost rotation while the command field is focused", () => {
    vi.useFakeTimers();
    render(
      <CommandBox
        creatorId="test_creator"
        presentation="instrument"
        flags={FLAGS_ON}
        interpret={vi.fn()}
        apply={vi.fn()}
        undo={vi.fn()}
      />
    );
    const first = LAB3_COMMAND_STARTERS[0].examples[0];
    fireEvent.focus(screen.getByLabelText("Studio Command"));
    act(() => {
      vi.advanceTimersByTime(LAB3_COMMAND_EXAMPLE_INTERVAL_MS + LAB3_COMMAND_EXAMPLE_FADE_MS);
    });
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toBe(first);
    vi.useRealTimers();
  });
});

describe("Lab 3 command teaching", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderTeaching(opts?: { paused?: boolean; disabled?: boolean; onFill?: (example: string) => void }) {
    const onFill = opts?.onFill ?? vi.fn();
    render(
      <Lab3CommandTeaching paused={opts?.paused ?? false} disabled={opts?.disabled ?? false} onFill={onFill}>
        <Lab3CommandGhost />
        <Lab3CommandStarterRail />
      </Lab3CommandTeaching>
    );
    return onFill;
  }

  it("rotates the ghost example on the interval and not before", () => {
    renderTeaching();
    const first = LAB3_COMMAND_STARTERS[0].examples[0];
    const second = LAB3_COMMAND_STARTERS[0].examples[1];
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toBe(first);
    act(() => {
      vi.advanceTimersByTime(LAB3_COMMAND_EXAMPLE_INTERVAL_MS - 1);
    });
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toBe(first);
    act(() => {
      vi.advanceTimersByTime(1 + LAB3_COMMAND_EXAMPLE_FADE_MS);
    });
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toBe(second);
  });

  it("pauses rotation while paused, hovered, or reduced-motion is set", () => {
    const { rerender } = render(
      <Lab3CommandTeaching paused disabled={false} onFill={vi.fn()}>
        <Lab3CommandGhost />
        <Lab3CommandStarterRail />
      </Lab3CommandTeaching>
    );
    const first = LAB3_COMMAND_STARTERS[0].examples[0];
    act(() => {
      vi.advanceTimersByTime(LAB3_COMMAND_EXAMPLE_INTERVAL_MS + LAB3_COMMAND_EXAMPLE_FADE_MS);
    });
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toBe(first);

    rerender(
      <Lab3CommandTeaching paused={false} disabled={false} onFill={vi.fn()}>
        <Lab3CommandGhost />
        <Lab3CommandStarterRail />
      </Lab3CommandTeaching>
    );
    fireEvent.mouseEnter(document.querySelector("[data-lab3-command-ghost] span") as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(LAB3_COMMAND_EXAMPLE_INTERVAL_MS + LAB3_COMMAND_EXAMPLE_FADE_MS);
    });
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toBe(first);
  });

  it("switches example sets from a starter without filling or submitting", () => {
    const onFill = renderTeaching();
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.getByRole("button", { name: "Schedule" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toBe(
      LAB3_COMMAND_STARTERS[1].examples[0]
    );
    expect(onFill).not.toHaveBeenCalled();
  });

  it("fills the current example from the ghost and never uses a live region", () => {
    const onFill = renderTeaching();
    fireEvent.click(document.querySelector("[data-lab3-command-ghost] span") as HTMLElement);
    expect(onFill).toHaveBeenCalledWith(LAB3_COMMAND_STARTERS[0].examples[0]);
    expect(document.querySelector("[aria-live]")).toBeNull();
    expect(document.querySelector("[data-lab3-command-ghost]")?.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  it("pauses rotation while the document is hidden", () => {
    renderTeaching();
    const first = LAB3_COMMAND_STARTERS[0].examples[0];
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      vi.advanceTimersByTime(LAB3_COMMAND_EXAMPLE_INTERVAL_MS + LAB3_COMMAND_EXAMPLE_FADE_MS);
    });
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toBe(first);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  it("does not rotate under reduced motion and keeps examples non-actionable when disabled", () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null
    })) as typeof window.matchMedia;
    renderTeaching({ disabled: true });
    const first = LAB3_COMMAND_STARTERS[0].examples[0];
    expect(document.querySelector("[data-lab3-command-ghost-disabled]")).toBeTruthy();
    expect(document.querySelector("[data-lab3-command-ghost] button")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(LAB3_COMMAND_EXAMPLE_INTERVAL_MS + LAB3_COMMAND_EXAMPLE_FADE_MS);
    });
    expect(document.querySelector("[data-lab3-command-ghost]")?.textContent).toBe(first);
    expect(screen.getByRole("button", { name: "Organize" })).toHaveProperty("disabled", true);
  });

  it("clears the rotation timer on unmount", () => {
    const { unmount } = render(
      <Lab3CommandTeaching paused={false} disabled={false} onFill={vi.fn()}>
        <Lab3CommandGhost />
        <Lab3CommandStarterRail />
      </Lab3CommandTeaching>
    );
    unmount();
    act(() => {
      vi.advanceTimersByTime(LAB3_COMMAND_EXAMPLE_INTERVAL_MS + LAB3_COMMAND_EXAMPLE_FADE_MS);
    });
  });
});

