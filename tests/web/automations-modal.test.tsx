/** @vitest-environment happy-dom */

/**
 * AUT-VS7-T01/T02 — Automations modal shell: gate, portal/z-index, close/focus return.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScheduleRailAutomationsModal } from "../../web/app/components/automations/ScheduleRailAutomationsModal";
import type { CreatorCapabilityWire } from "../../web/lib/relay-api";

vi.mock("@/app/components/autopost/PostingRoutinesSection", () => ({
  PostingRoutinesSection: () => <div data-testid="routines-list">routines</div>
}));

vi.mock("@/app/components/autopost/DistributionRulesSection", () => ({
  DistributionRulesSection: () => <div data-testid="rules-panel">rules</div>
}));

vi.mock("@/lib/automation-api", () => ({
  listAutomations: vi.fn(async () => []),
  createAutomation: vi.fn(),
  patchAutomation: vi.fn(),
  archiveAutomation: vi.fn(),
  listAutomationRuns: vi.fn(async () => [])
}));

vi.mock("@/lib/relay-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../web/lib/relay-api")>();
  return {
    ...actual,
    fetchPreviewTemplates: vi.fn(async () => ({ templates: [] })),
    fetchConnectedPlatforms: vi.fn(async () => ({ platforms: [] }))
  };
});

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const LOCKED: CreatorCapabilityWire = {
  allowed: false,
  required_plan: "autopost",
  reason: "plan_required"
};

const ALLOWED: CreatorCapabilityWire = {
  allowed: true,
  required_plan: "autopost",
  reason: "operator_grant"
};

describe("ScheduleRailAutomationsModal (B17–B18 / AU-01)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("portals at z-[110] below Previewizer z-[120]", () => {
    render(
      <ScheduleRailAutomationsModal
        open
        onClose={() => {}}
        autopostCapability={ALLOWED}
        onOpenApproval={() => {}}
      />
    );
    const modal = screen.getByTestId("schedule-rail-automations-modal");
    expect(modal.className).toMatch(/z-\[110\]/);
    expect(document.body.contains(modal)).toBe(true);

    const previewizer = readFileSync(
      join(repoRoot, "web/app/components/distribution/PreviewizerOverlay.tsx"),
      "utf8"
    );
    expect(previewizer).toMatch(/z-\[120\]/);
  });

  it("shows Autopost gate while keeping overview visible (AU-01)", async () => {
    render(
      <ScheduleRailAutomationsModal
        open
        onClose={() => {}}
        autopostCapability={LOCKED}
        onOpenApproval={() => {}}
      />
    );
    expect(screen.getByTestId("automations-modal-plan-gate-wall")).toBeTruthy();
    const cta = screen.getByTestId("automations-modal-plan-gate-cta") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/studio/settings/billing?feature=autopost");
    await waitFor(() => {
      expect(screen.getByTestId("automations-overview")).toBeTruthy();
    });
    expect(screen.getByTestId("automations-overview").getAttribute("data-locked")).toBe("true");
    expect(
      (screen.getByTestId("automations-preset-preview-crosspost") as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("renders unlocked overview when autopost allowed", async () => {
    render(
      <ScheduleRailAutomationsModal
        open
        onClose={() => {}}
        autopostCapability={ALLOWED}
        onOpenApproval={() => {}}
      />
    );
    expect(screen.queryByTestId("automations-modal-plan-gate-wall")).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId("automations-preset-preview-crosspost")).toBeTruthy();
    });
    expect(
      (screen.getByTestId("automations-preset-preview-crosspost") as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("shows feature-disabled empty when flag/API disabled", () => {
    render(
      <ScheduleRailAutomationsModal
        open
        onClose={() => {}}
        autopostCapability={ALLOWED}
        automationsFeatureEnabled={false}
        onOpenApproval={() => {}}
      />
    );
    expect(screen.getByTestId("automations-feature-disabled")).toBeTruthy();
  });

  it("closes on Escape and restores focus to the opener", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open Automations";
    document.body.appendChild(opener);
    opener.focus();

    const onClose = vi.fn();
    const { rerender } = render(
      <ScheduleRailAutomationsModal
        open
        onClose={onClose}
        autopostCapability={ALLOWED}
        onOpenApproval={() => {}}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <ScheduleRailAutomationsModal
        open={false}
        onClose={onClose}
        autopostCapability={ALLOWED}
        onOpenApproval={() => {}}
      />
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
    opener.remove();
  });

  it("closes on backdrop mousedown", () => {
    const onClose = vi.fn();
    render(
      <ScheduleRailAutomationsModal
        open
        onClose={onClose}
        autopostCapability={ALLOWED}
        onOpenApproval={() => {}}
      />
    );
    fireEvent.mouseDown(screen.getByTestId("schedule-rail-automations-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("rail Automations trigger wiring (source contract)", () => {
  it("ScheduleRail exposes dumb onOpenAutomations without extending PopoverTarget", () => {
    const rail = readFileSync(
      join(repoRoot, "web/app/components/schedule-rail/ScheduleRail.tsx"),
      "utf8"
    );
    expect(rail).toMatch(/onOpenAutomations\?:/);
    expect(rail).toMatch(/data-testid="schedule-rail-automations-open"/);
    expect(rail).not.toMatch(/kind:\s*"automations"/);

    const host = readFileSync(
      join(repoRoot, "web/app/components/schedule-rail/StudioScheduleRail.tsx"),
      "utf8"
    );
    expect(host).toMatch(/ScheduleRailAutomationsModal/);
    expect(host).toMatch(/AutomationApprovalOverlay/);
    expect(host).toMatch(/onOpenAutomations=\{/);
    expect(host).toMatch(/setAutomationsOpen/);
    expect(host).toMatch(/autopostCapability/);
  });

  it("routines page still hosts extracted panels", () => {
    const panel = readFileSync(
      join(repoRoot, "web/app/components/autopost/AutopostRoutinesPanel.tsx"),
      "utf8"
    );
    expect(panel).toMatch(/PostingRoutinesSection/);
    expect(panel).toMatch(/DistributionRulesSection/);
  });
});
