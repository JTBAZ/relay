/** @vitest-environment happy-dom */

/**
 * AUT-VS7-T02 — Automations create/list/lifecycle/history + approval convergence (AU-02/10/11).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AutomationsPanel } from "../../web/app/components/automations/AutomationsPanel";
import type { AutomationConnectorWire } from "../../web/lib/automation-api";

const listAutomations = vi.fn();
const createAutomation = vi.fn();
const patchAutomation = vi.fn();
const archiveAutomation = vi.fn();
const listAutomationRuns = vi.fn();
const fetchPreviewTemplates = vi.fn();
const fetchConnectedPlatforms = vi.fn();

vi.mock("@/lib/automation-api", () => ({
  listAutomations: (...args: unknown[]) => listAutomations(...args),
  createAutomation: (...args: unknown[]) => createAutomation(...args),
  patchAutomation: (...args: unknown[]) => patchAutomation(...args),
  archiveAutomation: (...args: unknown[]) => archiveAutomation(...args),
  listAutomationRuns: (...args: unknown[]) => listAutomationRuns(...args)
}));

vi.mock("@/lib/relay-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../web/lib/relay-api")>();
  return {
    ...actual,
    fetchPreviewTemplates: (...args: unknown[]) => fetchPreviewTemplates(...args),
    fetchConnectedPlatforms: (...args: unknown[]) => fetchConnectedPlatforms(...args)
  };
});

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const TEMPLATE = {
  template_id: "tpl_1",
  creator_id: "cr_1",
  name: "Blur plug",
  config: {},
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z"
};

function connector(overrides: Partial<AutomationConnectorWire> = {}): AutomationConnectorWire {
  return {
    automation_id: "auto_1",
    creator_id: "cr_1",
    preset_kind: "preview_crosspost",
    status: "active",
    title: "Weekly X",
    source_kind: "patreon_latest",
    trigger_kind: "schedule",
    schedule: {
      cadence: "weekly",
      interval: 1,
      local_time: "09:00",
      timezone: "America/New_York",
      weekdays: [1],
      month_days: []
    },
    offset_days: null,
    target_destinations: ["x"],
    preview_template_id: "tpl_1",
    schedule_series_id: "series_1",
    distribution_rule_id: "rule_1",
    series_materialization_kind: null,
    approval_ttl_hours: 72,
    remind_me: true,
    version: 3,
    next_occurrence_at: "2026-07-27T13:00:00.000Z",
    latest_run_id: null,
    latest_run_status: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

describe("Automations flow (B18)", () => {
  beforeEach(() => {
    listAutomations.mockReset();
    createAutomation.mockReset();
    patchAutomation.mockReset();
    archiveAutomation.mockReset();
    listAutomationRuns.mockReset();
    fetchPreviewTemplates.mockReset();
    fetchConnectedPlatforms.mockReset();

    listAutomations.mockResolvedValue([]);
    fetchPreviewTemplates.mockResolvedValue({ templates: [TEMPLATE] });
    fetchConnectedPlatforms.mockResolvedValue({
      platforms: [{ destination: "x", label: "X", readiness: "available", handoff: "extension" }]
    });
    createAutomation.mockResolvedValue({
      automation: connector(),
      receipt: {
        automation_id: "auto_1",
        version: 1,
        status: "active",
        client_mutation_key: "k",
        schedule_series_id: "s",
        distribution_rule_id: "r",
        created: true
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("creates Preview & crosspost with fixture-shaped body + client_mutation_key (AU-02)", async () => {
    const onOpenApproval = vi.fn();
    render(<AutomationsPanel onOpenApproval={onOpenApproval} />);

    await waitFor(() => expect(screen.getByTestId("automations-list-empty")).toBeTruthy());
    fireEvent.click(screen.getByTestId("automations-preset-preview-crosspost"));
    expect(screen.getByTestId("automations-form-preview-crosspost")).toBeTruthy();

    fireEvent.click(screen.getByTestId("automations-form-continue"));
    fireEvent.click(screen.getByTestId("automations-form-submit"));

    await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));
    const body = createAutomation.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.preset_kind).toBe("preview_crosspost");
    expect(body.preview_template_id).toBe("tpl_1");
    expect(body.client_mutation_key).toMatch(/^auto_mut_/);
    expect(body.schedule).toMatchObject({
      cadence: "weekly",
      interval: 1,
      local_time: "09:00"
    });
    expect(body).not.toHaveProperty("workflow");
  });

  it("creates Delayed public release with offset_days and no schedule (AU-11)", async () => {
    render(<AutomationsPanel onOpenApproval={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("automations-list-empty")).toBeTruthy());

    fireEvent.click(screen.getByTestId("automations-preset-delayed-release"));
    fireEvent.change(screen.getByTestId("automations-offset-days"), { target: { value: "14" } });
    fireEvent.click(screen.getByTestId("automations-form-continue"));
    fireEvent.click(screen.getByTestId("automations-form-submit"));

    await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));
    const body = createAutomation.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.preset_kind).toBe("delayed_public_release");
    expect(body.offset_days).toBe(14);
    expect(body.schedule).toBeUndefined();
  });

  it("blocks Preview & crosspost when no saved templates", async () => {
    fetchPreviewTemplates.mockResolvedValue({ templates: [] });
    render(<AutomationsPanel onOpenApproval={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("automations-list-empty")).toBeTruthy());

    fireEvent.click(screen.getByTestId("automations-preset-preview-crosspost"));
    expect(screen.getByTestId("automations-no-templates")).toBeTruthy();
    expect(
      (screen.getByTestId("automations-form-continue") as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("pauses with version and archives (AU-10)", async () => {
    listAutomations.mockResolvedValue([connector()]);
    patchAutomation.mockResolvedValue({
      automation: connector({ status: "paused", version: 4 }),
      receipt: {
        automation_id: "auto_1",
        version: 4,
        status: "paused",
        client_mutation_key: null,
        schedule_series_id: "s",
        distribution_rule_id: "r",
        created: false
      }
    });
    archiveAutomation.mockResolvedValue({
      automation: connector({ status: "archived", version: 5 }),
      receipt: {
        automation_id: "auto_1",
        version: 5,
        status: "archived",
        client_mutation_key: null,
        schedule_series_id: "s",
        distribution_rule_id: "r",
        created: false
      },
      archived: true
    });

    render(<AutomationsPanel onOpenApproval={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("automations-row-auto_1")).toBeTruthy());

    fireEvent.click(screen.getByTestId("automations-pause-auto_1"));
    await waitFor(() => expect(patchAutomation).toHaveBeenCalled());
    expect(patchAutomation.mock.calls[0]![0]).toBe("auto_1");
    expect(patchAutomation.mock.calls[0]![1]).toMatchObject({ version: 3, status: "paused" });

    listAutomations.mockResolvedValue([connector({ status: "paused", version: 4 })]);
    fireEvent.click(screen.getByTestId("automations-archive-auto_1"));
    await waitFor(() => expect(archiveAutomation).toHaveBeenCalledWith("auto_1"));
  });

  it("history ready run opens approval callback", async () => {
    listAutomations.mockResolvedValue([connector()]);
    listAutomationRuns.mockResolvedValue([
      {
        run_id: "run_1",
        automation_id: "auto_1",
        creator_id: "cr_1",
        status: "awaiting_review",
        source_post_id: "post_1",
        schedule_occurrence_id: null,
        draft_id: "draft_1",
        materialized_event_id: "evt_1",
        plan_id: null,
        due_at: "2026-07-20T12:00:00.000Z",
        expires_at: "2026-07-23T12:00:00.000Z",
        idempotency_key: "ik",
        failure_reason: null,
        created_at: "2026-07-20T12:00:00.000Z",
        updated_at: "2026-07-20T12:00:00.000Z",
        completed_at: null
      }
    ]);

    const onOpenApproval = vi.fn();
    render(<AutomationsPanel onOpenApproval={onOpenApproval} />);
    await waitFor(() => expect(screen.getByTestId("automations-row-auto_1")).toBeTruthy());

    fireEvent.click(screen.getByTestId("automations-history-open-auto_1"));
    await waitFor(() => expect(screen.getByTestId("automations-history")).toBeTruthy());
    fireEvent.click(screen.getByTestId("automations-run-open-approval-run_1"));
    expect(onOpenApproval).toHaveBeenCalledWith({
      automationId: "auto_1",
      runId: "run_1",
      draftId: "draft_1"
    });
  });

  it("does not show generic workflow jargon in overview copy", async () => {
    render(<AutomationsPanel onOpenApproval={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("automations-overview")).toBeTruthy());
    const text = screen.getByTestId("automations-overview").textContent ?? "";
    expect(text.toLowerCase()).not.toMatch(/workflow step|materialization|occurrence reconciler/);
  });

  it("host mounts one approval adapter; modal does not embed overlay", () => {
    const modal = readFileSync(
      join(repoRoot, "web/app/components/automations/ScheduleRailAutomationsModal.tsx"),
      "utf8"
    );
    expect(modal).toMatch(/AutomationsPanel/);
    expect(modal).toMatch(/onOpenApproval/);
    expect(modal).not.toMatch(/from ["']@\/app\/components\/automations\/AutomationApprovalOverlay["']/);

    const host = readFileSync(
      join(repoRoot, "web/app/components/schedule-rail/StudioScheduleRail.tsx"),
      "utf8"
    );
    expect(host).toMatch(/AutomationApprovalOverlay/);
    expect(host).toMatch(/automation_id/);
    expect(host).toMatch(/automation_run_id/);

    const popover = readFileSync(
      join(repoRoot, "web/app/components/schedule-rail/EventPopover.tsx"),
      "utf8"
    );
    expect(popover).toMatch(/event-open-automation-approval/);
    expect(popover).toMatch(/onOpenAutomationApproval/);
  });
});
