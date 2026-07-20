/** @vitest-environment happy-dom */

/**
 * VS11-T02 — Goal Cycle web accessibility / performance gate.
 * Verification only — no product behavior changes.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalCycleLauncher } from "../../web/app/components/goal-cycle/GoalCycleLauncher";
import type { GoalCycleFlowApi } from "../../web/app/components/goal-cycle/GoalCycleFlow";
import { GoalCycleErrorState } from "../../web/app/components/goal-cycle/GoalCycleErrorState";
import { ResearchStep } from "../../web/app/components/goal-cycle/ResearchStep";
import {
  prefersReducedMotion,
  railHighlightTimings
} from "../../web/app/components/goal-cycle/goal-cycle-rail-handoff";
import { GoalsAuditView } from "../../web/app/studio/goals/GoalsAuditView";
import { GOAL_CYCLE_RESUME_DETAIL_FIXTURE } from "../../web/lib/goal-cycle-api-fixtures";
import { GOAL_CYCLE_AUDIT_FIXTURES } from "../../web/lib/goal-cycle-audit-fixtures";
import type { GoalCycleDetail } from "../../web/lib/goal-cycle-types";
import { RelayApiError } from "../../web/lib/relay-api";

const root = join(process.cwd());

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function baseCycle(patch: Partial<GoalCycleDetail> = {}): GoalCycleDetail {
  return {
    ...GOAL_CYCLE_RESUME_DETAIL_FIXTURE,
    state: "draft",
    phase: "goal",
    version: 1,
    plan: null,
    progress: [],
    evidence: [],
    ...patch
  };
}

function createApi(overrides: Partial<GoalCycleFlowApi> = {}): GoalCycleFlowApi {
  return {
    startCycle: vi.fn(async ({ goal_kind, break_mode }) => ({
      cycle: baseCycle({ goal_kind, break_mode: break_mode ?? null })
    })),
    patchCheckpoint: vi.fn(async (_id, body) => ({
      cycle: baseCycle({
        phase: body.phase ?? "context",
        version: (body.expected_version ?? 1) + 1,
        context: (body.context as Record<string, unknown>) ?? {},
        credit: GOAL_CYCLE_RESUME_DETAIL_FIXTURE.credit
      })
    })),
    startResearch: vi.fn(async () => ({
      cycle: baseCycle({ phase: "research", state: "researching" })
    })),
    suggestPlan: vi.fn(async () => ({
      cycle: baseCycle({ phase: "plan", state: "draft" })
    })),
    approvePlan: vi.fn(async () => ({
      receipt: {
        cycle_id: "cyc_1",
        approval_key: "appr_1",
        status: "materialized" as const,
        materialized_at: "2026-07-17T20:00:00.000Z",
        slots: []
      },
      cycle: baseCycle({ phase: "active", state: "active" })
    })),
    cancelCycle: vi.fn(async () => ({ cycle: null })),
    completeCycle: vi.fn(async () => ({
      cycle: baseCycle({ phase: "learning", state: "completed" })
    })),
    ...overrides
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VS11-T02 keyboard / screen reader semantics", () => {
  it("launcher CTA exposes dialog popup semantics and polite live region", async () => {
    const hydrate = vi.fn(async () => ({ cycle: null }));
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));

    const cta = screen.getByTestId("goal-cycle-entry-cta");
    expect(cta.getAttribute("aria-haspopup")).toBe("dialog");
    expect(cta.getAttribute("aria-expanded")).toBe("false");
    expect(cta.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByTestId("goal-cycle-announce").getAttribute("aria-live")).toBe(
      "polite"
    );

    fireEvent.click(cta);
    await waitFor(() => screen.getByTestId("goal-cycle-drawer"));
    expect(cta.getAttribute("aria-expanded")).toBe("true");

    const dialog = screen.getByTestId("goal-cycle-flow");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: /Plan this month/i })).toBeTruthy();

    const backdrop = screen.getByTestId("goal-cycle-drawer-backdrop");
    expect(backdrop.getAttribute("aria-label")).toMatch(/Close Plan drawer/i);
  });

  it("Escape closes drawer and restores focus to the entry CTA", async () => {
    const hydrate = vi.fn(async () => ({ cycle: null }));
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    const cta = screen.getByTestId("goal-cycle-entry-cta");
    fireEvent.click(cta);
    await waitFor(() => screen.getByTestId("goal-cycle-drawer"));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("goal-cycle-drawer")).toBeNull());
    expect(document.activeElement).toBe(cta);
    expect(screen.getByTestId("goal-cycle-announce").textContent).toMatch(/closed/i);
  });

  it("goal kind choices are pressable buttons with accessible names", async () => {
    const hydrate = vi.fn(async () => ({ cycle: null }));
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    fireEvent.click(screen.getByTestId("goal-cycle-entry-cta"));
    await waitFor(() => screen.getByTestId("goal-cycle-goal-step"));

    const engagement = screen.getByTestId("goal-kind-engagement");
    expect(engagement.tagName).toBe("BUTTON");
    expect(engagement.getAttribute("aria-pressed")).toBe("false");
    expect(engagement.textContent).toMatch(/engagement/i);
  });

  it("error state is an alert with a named Retry control", () => {
    const onRetry = vi.fn();
    render(
      <GoalCycleErrorState
        message="Network timeout — try again."
        retryable
        onRetry={onRetry}
      />
    );
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-testid")).toBe("goal-cycle-error-state");
    const retry = screen.getByRole("button", { name: /^Retry$/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("goals audit lists history with pressed cards and alert on error", () => {
    const records = [
      GOAL_CYCLE_AUDIT_FIXTURES.active,
      ...GOAL_CYCLE_AUDIT_FIXTURES.history
    ];
    const { rerender } = render(
      <GoalsAuditView
        records={records}
        activeCycleId={GOAL_CYCLE_AUDIT_FIXTURES.active.cycle.cycle_id}
        selectedCycleId={GOAL_CYCLE_AUDIT_FIXTURES.active.cycle.cycle_id}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: /Goal history/i })).toBeTruthy();
    expect(screen.getByRole("list", { name: /Goal Cycle history/i })).toBeTruthy();
    const card = screen.getByTestId(
      `goals-audit-card-${GOAL_CYCLE_AUDIT_FIXTURES.active.cycle.cycle_id}`
    );
    expect(card.getAttribute("aria-pressed")).toBe("true");

    rerender(
      <GoalsAuditView
        records={[]}
        activeCycleId={null}
        selectedCycleId={null}
        onSelect={vi.fn()}
        loading
        error="Failed to load cycles"
      />
    );
    expect(screen.getByRole("alert").textContent).toMatch(/Failed to load/i);
    expect(screen.getByTestId("goals-audit-loading").textContent).toMatch(/Loading/i);
  });
});

describe("VS11-T02 reduced motion + layout", () => {
  it("CSS disables transitions under prefers-reduced-motion and animates only when allowed", () => {
    const css = readSrc("web/app/components/goal-cycle/goal-cycle.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/transition:\s*none/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*no-preference\)/);
    expect(css).toMatch(/animation:\s*goal-cycle-panel-in/);
  });

  it("rail highlight timings collapse when reduced motion is preferred", () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    expect(prefersReducedMotion()).toBe(true);
    const reduced = railHighlightTimings(true);
    expect(reduced.paintMs).toBe(0);
    expect(reduced.openPopoverMs).toBe(0);
    expect(reduced.smoothScroll).toBe(false);

    const full = railHighlightTimings(false);
    expect(full.paintMs).toBeGreaterThan(0);
    expect(full.openPopoverMs).toBeGreaterThan(0);
    expect(full.smoothScroll).toBe(true);
  });

  it("drawer CSS covers narrow and wide breakpoints", () => {
    const css = readSrc("web/app/components/goal-cycle/goal-cycle.css");
    expect(css).toMatch(/@media \(max-width:\s*640px\)/);
    expect(css).toMatch(/@media \(min-width:\s*1024px\)/);
    expect(css).toMatch(/\.goal-cycle-drawer-panel/);
  });
});

describe("VS11-T02 loading / retry / no hidden chain-of-thought", () => {
  it("loading CTA announces Loading… and stays focusable as a button", async () => {
    let resolveHydrate: (v: { cycle: null }) => void = () => undefined;
    const hydrate = vi.fn(
      () =>
        new Promise<{ cycle: null }>((resolve) => {
          resolveHydrate = resolve;
        })
    );
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    const cta = screen.getByTestId("goal-cycle-entry-cta");
    expect(cta).toHaveProperty("disabled", true);
    expect(cta.textContent).toMatch(/Loading/i);
    resolveHydrate({ cycle: null });
    await waitFor(() => expect(cta).toHaveProperty("disabled", false));
  });

  it("retryable API failure surfaces alert + Retry without leaking internals", async () => {
    const api = createApi({
      startCycle: vi.fn(async () => {
        throw new RelayApiError("upstream timeout", 504, "GOAL_CYCLE_UPSTREAM_TIMEOUT");
      })
    });
    const hydrate = vi.fn(async () => ({ cycle: null }));
    render(<GoalCycleLauncher api={api} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    fireEvent.click(screen.getByTestId("goal-cycle-entry-cta"));
    await waitFor(() => screen.getByTestId("goal-cycle-goal-step"));
    fireEvent.click(screen.getByTestId("goal-kind-engagement"));
    await waitFor(() => screen.getByTestId("goal-cycle-error-state"));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toMatch(/chain.of.thought|reasoning|system prompt/i);
    expect(screen.getByTestId("goal-cycle-error-retry")).toBeTruthy();
  });

  it("research step copy forbids chain-of-thought and progress UI stays operational", () => {
    render(
      <ResearchStep
        silence={false}
        credit={GOAL_CYCLE_RESUME_DETAIL_FIXTURE.credit}
        progress={[
          {
            at: "2026-07-17T12:00:00.000Z",
            code: "research_started",
            message: "Gathering evidence"
          }
        ]}
        evidence={[]}
        researching
        onStartResearch={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    const step = screen.getByTestId("goal-cycle-research-step");
    expect(step.textContent).toMatch(/no chain-of-thought/i);
    expect(step.textContent).not.toMatch(/hidden.?thought|internal.?monologue/i);

    const progressSrc = readSrc("web/app/components/coach/CoachProgressList.tsx");
    expect(progressSrc).toMatch(/no chain-of-thought/i);
  });
});

describe("VS11-T02 performance budgets (static + hydrate latency)", () => {
  it("goal-cycle CSS stays under a modest size budget", () => {
    const cssPath = join(root, "web/app/components/goal-cycle/goal-cycle.css");
    const bytes = statSync(cssPath).size;
    // Soft regression guard — drawer CSS should stay lean (~15–25KB today).
    expect(bytes).toBeLessThan(48_000);
  });

  it("hydrate completes within the client latency budget under fixture timing", async () => {
    const hydrate = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { cycle: null };
    });
    const started = performance.now();
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-entry-cta")).toHaveProperty("disabled", false);
    });
    const elapsed = performance.now() - started;
    // Fixture path budget (not network). Real API SLOs verified in ops (VS11-T05).
    expect(elapsed).toBeLessThan(1500);
    expect(hydrate).toHaveBeenCalled();
  });

  it("goal-cycle component sources do not embed large inline SVG blobs", () => {
    const files = [
      "web/app/components/goal-cycle/GoalCycleLauncher.tsx",
      "web/app/components/goal-cycle/GoalCycleFlow.tsx",
      "web/app/studio/goals/GoalsAuditView.tsx"
    ];
    for (const rel of files) {
      const src = readSrc(rel);
      expect(src.length).toBeLessThan(120_000);
      expect(src).not.toMatch(/data:image\/svg\+xml;base64,[A-Za-z0-9+/]{2000,}/);
    }
  });
});
