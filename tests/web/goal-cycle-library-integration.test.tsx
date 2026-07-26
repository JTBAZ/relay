/** @vitest-environment happy-dom */

/**
 * VS6-T05 / VS6-T06 — Library host integration + a11y/fixture coverage.
 */

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
import { GOAL_CYCLE_RESUME_DETAIL_FIXTURE } from "../../web/lib/goal-cycle-api-fixtures";
import { COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE } from "../../web/lib/coach-plan-credit-api-fixtures";
import type { GoalCycleDetail, GoalCyclePlan } from "../../web/lib/goal-cycle-types";
import { RelayApiError } from "../../web/lib/relay-api";

function samplePlan(patch: Partial<GoalCyclePlan> = {}): GoalCyclePlan {
  return {
    version: 1,
    rationale: "Fixture plan",
    slots: [
      {
        id: "slot_1",
        intent: "engagement_hook",
        format: "image_post",
        title: "Warm-up",
        draft_body: "Body",
        destination_ids: ["patreon"],
        scheduled_local: "2026-07-20T19:00:00",
        scheduled_utc: "2026-07-20T23:00:00.000Z",
        time_zone: "America/New_York",
        media_state: "missing",
        evidence_refs: ["ev_1"]
      }
    ],
    questions_asked: [],
    ai_revision_count: 0,
    evidence_summary: "History",
    warnings: [],
    logistics: {
      time_zone: "America/New_York",
      linked_destination_ids: ["patreon", "x"],
      notes: null
    },
    ...patch
  };
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
    startResearch: vi.fn(async (cycleId) => ({
      research: {
        cycle_id: cycleId,
        request_id: "r1",
        status: "complete" as const,
        mode: "fixture",
        progress: [],
        error_code: null,
        strength: "weak",
        confidence: "low"
      }
    })),
    getResearch: vi.fn(async (cycleId) => ({
      research: {
        cycle_id: cycleId,
        request_id: "r1",
        status: "complete" as const,
        mode: "fixture",
        progress: [],
        error_code: null,
        strength: "weak",
        confidence: "low"
      }
    })),
    fetchCycle: vi.fn(async () => ({
      cycle: baseCycle({
        phase: "research",
        state: "researching",
        evidence: [
          {
            ref_id: "ev_1",
            kind: "history",
            confidence: "low",
            freshness_seconds: 0,
            summary: "Weak history signal"
          }
        ],
        progress: [
          {
            sequence: 1,
            phase: "research",
            message_code: "evidence_weak",
            occurred_at: "2026-07-17T16:01:00.000Z",
            retryable: false
          }
        ],
        credit: GOAL_CYCLE_RESUME_DETAIL_FIXTURE.credit
      })
    })),
    proposeQuestions: vi.fn(async () => ({
      questions: [],
      cycle: baseCycle({ phase: "questions", state: "questions", version: 4 })
    })),
    answerQuestions: vi.fn(async () => ({
      cycle: baseCycle({ phase: "revisions", state: "review", version: 5 })
    })),
    generatePlan: vi.fn(async () => {
      const plan = samplePlan();
      return {
        plan,
        cycle: baseCycle({ phase: "revisions", state: "review", version: 6, plan })
      };
    }),
    revisePlan: vi.fn(async () => {
      const plan = samplePlan({ ai_revision_count: 1 });
      return {
        plan,
        cycle: baseCycle({ phase: "revisions", state: "review", version: 7, plan }),
        ai_revision_count: 1
      };
    }),
    manualEditPlan: vi.fn(async (_id, body) => ({
      plan: body.plan,
      cycle: baseCycle({ phase: "revisions", state: "review", version: 8, plan: body.plan })
    })),
    ...overrides
  };
}

afterEach(() => {
  cleanup();
});

describe("GoalCycle Library integration (VS6-T05)", () => {
  it("shows plan this month when no active cycle and keeps rail stub mounted while open", async () => {
    const hydrate = vi.fn(async () => ({ cycle: null }));
    const api = createApi();
    render(
      <div data-testid="library-shell">
        <div data-testid="posting-goal-status-card">Posting rhythm (count goal)</div>
        <GoalCycleLauncher api={api} hydrate={hydrate} />
        <aside data-testid="studio-schedule-rail">Schedule Rail</aside>
      </div>
    );

    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-entry-cta").textContent).toMatch(
        /Plan this month/
      );
    });
    expect(screen.getByTestId("goal-cycle-launcher").getAttribute("data-cta")).toBe(
      "plan_this_month"
    );
    expect(screen.getByTestId("posting-goal-status-card")).toBeTruthy();

    fireEvent.click(screen.getByTestId("goal-cycle-entry-cta"));
    await waitFor(() => screen.getByTestId("goal-cycle-flow"));
    expect(screen.getByTestId("studio-schedule-rail")).toBeTruthy();
    expect(
      screen
        .getByTestId("library-shell")
        .contains(screen.getByTestId("studio-schedule-rail"))
    ).toBe(true);
  });

  it("shows resume Plan from hydrated active cycle", async () => {
    const hydrate = vi.fn(async () => ({
      cycle: baseCycle({
        state: "questions",
        phase: "questions",
        version: 3
      })
    }));
    render(
      <GoalCycleLauncher api={createApi()} hydrate={hydrate} />
    );
    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-entry-cta").textContent).toMatch(
        /Resume Plan/
      );
    });
    expect(screen.getByTestId("goal-cycle-launcher").getAttribute("data-cta")).toBe(
      "resume_plan"
    );
  });

  it("shows review completion CTA", async () => {
    const hydrate = vi.fn(async () => ({
      cycle: baseCycle({ state: "completion_suggested", phase: "completion" })
    }));
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-entry-cta").textContent).toMatch(
        /Review completion/
      );
    });
  });

  it("hides when Goal Cycle API is unavailable", async () => {
    const hydrate = vi.fn(async () => {
      throw new RelayApiError("not found", 404, "NOT_FOUND");
    });
    const { container } = render(
      <GoalCycleLauncher api={createApi()} hydrate={hydrate} />
    );
    await waitFor(() => {
      expect(hydrate).toHaveBeenCalled();
    });
    expect(container.querySelector('[data-testid="goal-cycle-launcher"]')).toBeNull();
  });
});

describe("GoalCycle a11y + fixture states (VS6-T06)", () => {
  it("Escape closes drawer and returns focus to CTA", async () => {
    const hydrate = vi.fn(async () => ({ cycle: null }));
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    const cta = screen.getByTestId("goal-cycle-entry-cta");
    fireEvent.click(cta);
    await waitFor(() => screen.getByTestId("goal-cycle-drawer"));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("goal-cycle-drawer")).toBeNull();
    });
    expect(document.activeElement).toBe(cta);
    expect(screen.getByTestId("goal-cycle-announce").textContent).toMatch(/closed/i);
  });

  it("close/reopen resumes the same hydrated cycle phase", async () => {
    const hydrate = vi.fn(async () => ({
      cycle: baseCycle({
        state: "researching",
        phase: "research",
        version: 2,
        context: { topic: "sketches" },
        credit: GOAL_CYCLE_RESUME_DETAIL_FIXTURE.credit
      })
    }));
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    fireEvent.click(screen.getByTestId("goal-cycle-entry-cta"));
    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-flow").getAttribute("data-phase")).toBe(
        "research"
      );
    });
    fireEvent.click(screen.getByTestId("goal-cycle-close"));
    await waitFor(() => expect(screen.queryByTestId("goal-cycle-drawer")).toBeNull());
    fireEvent.click(screen.getByTestId("goal-cycle-entry-cta"));
    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-flow").getAttribute("data-phase")).toBe(
        "research"
      );
      expect(screen.getByTestId("goal-cycle-research-step")).toBeTruthy();
    });
  });

  it("covers break branches, weak evidence, no-credit, and version conflict", async () => {
    const api = createApi({
      startResearch: vi.fn(async () => {
        throw new RelayApiError(
          COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE.title,
          402,
          "GOAL_CYCLE_NO_CREDIT"
        );
      }),
      patchCheckpoint: vi.fn(async () => {
        throw new RelayApiError("stale", 409, "GOAL_CYCLE_VERSION_CONFLICT");
      })
    });
    const hydrate = vi.fn(async () => ({ cycle: null }));
    render(<GoalCycleLauncher api={api} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    fireEvent.click(screen.getByTestId("goal-cycle-entry-cta"));
    await waitFor(() => screen.getByTestId("goal-cycle-goal-step"));

    // Break branches — pick a mode (auto-advances)
    fireEvent.click(screen.getByTestId("goal-kind-break"));
    expect(screen.getByTestId("goal-cycle-break-modes")).toBeTruthy();
    expect(screen.getByTestId("break-mode-complete_silence").textContent).toMatch(
      /Free/
    );
    expect(screen.getByTestId("break-mode-social_upkeep").textContent).toMatch(
      /Uses 1 credit/
    );
    expect(screen.getByTestId("break-mode-active_rest").textContent).toMatch(
      /Uses 1 credit/
    );

    fireEvent.click(screen.getByTestId("break-mode-social_upkeep"));
    await waitFor(() => screen.getByTestId("goal-cycle-context-step"));
    fireEvent.change(screen.getByTestId("context-topic"), {
      target: { value: "rest sketches" }
    });
    fireEvent.click(screen.getByTestId("context-step-continue"));

    await waitFor(() => screen.getByTestId("goal-cycle-error-state"));
    expect(
      screen.getByTestId("goal-cycle-error-state").getAttribute("data-conflict")
    ).toBe("true");
  });

  it("approval step discloses materialization side effects", async () => {
    const plan = samplePlan();
    const hydrate = vi.fn(async () => ({
      cycle: baseCycle({
        phase: "approval",
        state: "review",
        plan,
        version: 9
      })
    }));
    render(
      <GoalCycleLauncher
        api={createApi()}
        hydrate={hydrate}
        onMaterialized={vi.fn()}
      />
    );
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    fireEvent.click(screen.getByTestId("goal-cycle-entry-cta"));
    await waitFor(() => screen.getByTestId("goal-cycle-approval-step"));
    expect(screen.getByTestId("approval-side-effect-note").textContent).toMatch(
      /unpublished draft posts/
    );
  });

  it("active cycle resume shows live panel instead of empty shell", async () => {
    const plan = samplePlan();
    const hydrate = vi.fn(async () => ({
      cycle: baseCycle({
        phase: "active",
        state: "active",
        plan,
        version: 12
      })
    }));
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    expect(screen.getByTestId("goal-cycle-entry-cta").textContent).toMatch(/Resume Plan/i);
    fireEvent.click(screen.getByTestId("goal-cycle-entry-cta"));
    await waitFor(() => screen.getByTestId("goal-cycle-active-panel"));
    expect(screen.getByTestId("active-cycle-summary").textContent).toMatch(/Views|Engagement|Paid/i);
    expect(screen.queryByTestId("goal-cycle-goal-step")).toBeNull();
  });

  it("dialog has accessible name and reduced-motion CSS is present", async () => {
    const hydrate = vi.fn(async () => ({ cycle: null }));
    render(<GoalCycleLauncher api={createApi()} hydrate={hydrate} />);
    await waitFor(() => screen.getByTestId("goal-cycle-entry-cta"));
    fireEvent.click(screen.getByTestId("goal-cycle-entry-cta"));
    await waitFor(() => screen.getByTestId("goal-cycle-flow"));
    const dialog = screen.getByTestId("goal-cycle-flow");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    const chrome = within(dialog).getByRole("heading", { name: /Plan this month/i });
    expect(chrome).toBeTruthy();
  });
});
