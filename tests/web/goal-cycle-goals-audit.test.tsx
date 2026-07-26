/** @vitest-environment happy-dom */

/**
 * VS9-T04 — `/studio/goals` quiet audit UI from fixtures.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GoalsAuditClient } from "../../web/app/studio/goals/GoalsAuditClient";
import { GOAL_CYCLE_AUDIT_FIXTURES } from "../../web/lib/goal-cycle-audit-fixtures";

afterEach(() => {
  cleanup();
});

describe("Goals audit UI (VS9-T04)", () => {
  const fixtureRecords = [
    GOAL_CYCLE_AUDIT_FIXTURES.active,
    ...GOAL_CYCLE_AUDIT_FIXTURES.history
  ];

  it("renders compact history with active resume affordance", () => {
    render(
      <GoalsAuditClient
        fixtureRecords={fixtureRecords}
        fixtureActiveCycleId={GOAL_CYCLE_AUDIT_FIXTURES.active.cycle.cycle_id}
        initialSelectedCycleId={GOAL_CYCLE_AUDIT_FIXTURES.active.cycle.cycle_id}
      />
    );

    expect(screen.getByTestId("goals-audit-view")).toBeTruthy();
    expect(screen.getByTestId("goals-audit-active-hint")).toBeTruthy();
    expect(screen.getByTestId("goals-audit-resume-link").getAttribute("href")).toBe("/studio");
    expect(screen.getAllByText("Views ≥ 1000").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/420 views/i).length).toBeGreaterThan(0);
  });

  it("shows target/actual, confidence, reflection, and accepted learning", () => {
    const completed = GOAL_CYCLE_AUDIT_FIXTURES.history[0]!;
    render(
      <GoalsAuditClient
        fixtureRecords={fixtureRecords}
        fixtureActiveCycleId={GOAL_CYCLE_AUDIT_FIXTURES.active.cycle.cycle_id}
        initialSelectedCycleId={completed.cycle.cycle_id}
      />
    );

    const detail = screen.getByTestId("goals-audit-detail");
    expect(within(detail).getByText("Engagement ≥ 100")).toBeTruthy();
    expect(within(detail).getByText("128 engagements")).toBeTruthy();
    expect(within(detail).getByText("medium")).toBeTruthy();
    expect(screen.getByTestId("goals-audit-reflection").textContent).toMatch(
      /Midweek evenings worked/
    );
    expect(screen.getByTestId("goals-audit-learning").textContent).toMatch(/accepted/);
    expect(screen.getByTestId("goals-audit-learning-accepted-note")).toBeTruthy();
    expect(screen.getByTestId("goals-audit-analytics-link").getAttribute("href")).toBe(
      "/studio/analytics"
    );
  });

  it("shows rejected learning with no-preference note and paid analytics deep link", () => {
    const rejected = GOAL_CYCLE_AUDIT_FIXTURES.history[1]!;
    render(
      <GoalsAuditClient
        fixtureRecords={[rejected]}
        fixtureActiveCycleId={null}
        initialSelectedCycleId={rejected.cycle.cycle_id}
      />
    );

    expect(screen.getByTestId("goals-audit-learning-rejected-note").textContent).toMatch(
      /no preference change/i
    );
    expect(screen.getByTestId("goals-audit-analytics-link").getAttribute("href")).toContain(
      "focus=paid_support"
    );
    expect(screen.queryByTestId("goals-audit-active-hint")).toBeNull();
  });

  it("selects another history card", () => {
    render(
      <GoalsAuditClient
        fixtureRecords={fixtureRecords}
        fixtureActiveCycleId={GOAL_CYCLE_AUDIT_FIXTURES.active.cycle.cycle_id}
        initialSelectedCycleId={GOAL_CYCLE_AUDIT_FIXTURES.active.cycle.cycle_id}
      />
    );

    fireEvent.click(
      screen.getByTestId(`goals-audit-card-${GOAL_CYCLE_AUDIT_FIXTURES.history[0]!.cycle.cycle_id}`)
    );
    expect(screen.getByTestId("goals-audit-reflection")).toBeTruthy();
    expect(screen.getByTestId("goals-audit-detail").textContent).toMatch(/Engagement/);
  });

  it("renders empty state", () => {
    render(<GoalsAuditClient fixtureRecords={[]} fixtureActiveCycleId={null} />);
    expect(screen.getByTestId("goals-audit-empty")).toBeTruthy();
  });
});
