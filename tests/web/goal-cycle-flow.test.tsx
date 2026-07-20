/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoalCycleFlow,
  type GoalCycleFlowApi
} from "../../web/app/components/goal-cycle/GoalCycleFlow";
import { GOAL_CYCLE_RESUME_DETAIL_FIXTURE } from "../../web/lib/goal-cycle-api-fixtures";
import type {
  GoalCycleDetail,
  GoalCyclePlan,
  GoalCycleQuestion
} from "../../web/lib/goal-cycle-types";
import { RelayApiError } from "../../web/lib/relay-api";

function samplePlan(patch: Partial<GoalCyclePlan> = {}): GoalCyclePlan {
  return {
    version: 1,
    rationale: "History-paced engagement posts.",
    slots: [
      {
        id: "slot_1",
        intent: "engagement_hook",
        format: "image_post",
        title: "Warm-up sketch",
        draft_body: "Quick warm-up.",
        destination_ids: ["patreon", "deviantart"],
        scheduled_local: "2026-07-20T19:00:00",
        scheduled_utc: "2026-07-20T23:00:00.000Z",
        time_zone: "America/New_York",
        media_state: "missing",
        evidence_refs: ["ev_history_top"]
      }
    ],
    questions_asked: [],
    ai_revision_count: 0,
    evidence_summary: "Creator history only.",
    warnings: ["Attach media later."],
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
      cycle: baseCycle({
        goal_kind,
        break_mode: break_mode ?? null,
        phase: "goal",
        state: "draft",
        version: 1
      })
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
        request_id: "req_1",
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
        request_id: "req_1",
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
        version: 3,
        progress: [
          {
            sequence: 1,
            phase: "research",
            message_code: "history_loaded",
            occurred_at: "2026-07-17T16:01:00.000Z",
            retryable: false
          },
          {
            sequence: 2,
            phase: "research",
            message_code: "evidence_weak",
            occurred_at: "2026-07-17T16:01:30.000Z",
            retryable: false
          }
        ],
        evidence: [
          {
            ref_id: "ev_history_top",
            kind: "history",
            confidence: "low",
            freshness_seconds: 0,
            summary: "Midweek evening posts earned the strongest engagement."
          }
        ],
        credit: GOAL_CYCLE_RESUME_DETAIL_FIXTURE.credit
      })
    })),
    proposeQuestions: vi.fn(async () => {
      const questions: GoalCycleQuestion[] = [
        {
          id: "q1",
          prompt: "Prefer weekday or weekend posts?",
          options: ["Weekday", "Weekend"],
          bounded_text: null,
          answer: null
        }
      ];
      return {
        questions,
        cycle: baseCycle({
          phase: "questions",
          state: "questions",
          version: 4,
          context: { planner_questions: questions },
          credit: GOAL_CYCLE_RESUME_DETAIL_FIXTURE.credit
        })
      };
    }),
    answerQuestions: vi.fn(async (_id, body) => ({
      cycle: baseCycle({
        phase: "revisions",
        state: "review",
        version: 5,
        context: {
          planner_questions: [
            {
              id: body.answers[0]!.id,
              prompt: "Prefer weekday or weekend posts?",
              options: ["Weekday", "Weekend"],
              bounded_text: null,
              answer: body.answers[0]!.answer
            }
          ]
        }
      })
    })),
    generatePlan: vi.fn(async () => {
      const plan = samplePlan();
      return {
        plan,
        cycle: baseCycle({
          phase: "revisions",
          state: "review",
          version: 6,
          plan
        })
      };
    }),
    revisePlan: vi.fn(async (_id, body) => {
      const plan = samplePlan({
        ai_revision_count: 1,
        rationale: `Revised: ${body.revision_note}`
      });
      return {
        plan,
        cycle: baseCycle({ phase: "revisions", state: "review", version: 7, plan }),
        ai_revision_count: 1
      };
    }),
    manualEditPlan: vi.fn(async (_id, body) => ({
      plan: body.plan,
      // Production manual-edit checkpoints phase "revisions" — UI must still advance.
      cycle: baseCycle({
        phase: "revisions",
        state: "review",
        version: 8,
        plan: body.plan
      })
    })),
    ...overrides
  };
}

afterEach(() => {
  cleanup();
});

describe("GoalCycleFlow (VS6-T03)", () => {
  it("walks goal → context → research → questions with credit + weak evidence", async () => {
    const api = createApi();
    const onAdvance = vi.fn();
    render(
      <GoalCycleFlow open onClose={vi.fn()} api={api} onAdvancePastQuestions={onAdvance} />
    );

    fireEvent.click(screen.getByTestId("goal-kind-engagement"));
    expect(screen.getByTestId("goal-kind-help").textContent).toMatch(/likes/i);

    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-context-step")).toBeTruthy();
    });
    expect(api.startCycle).toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("context-topic"), {
      target: { value: "character sketches" }
    });
    fireEvent.click(screen.getByTestId("context-step-continue"));

    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-research-step")).toBeTruthy();
    });
    expect(screen.getByTestId("goal-cycle-credit-explain").textContent).toMatch(
      /One Coach Plan credit/
    );

    fireEvent.click(screen.getByTestId("research-start"));
    await waitFor(() => {
      expect(screen.getByTestId("coach-evidence-weak-note")).toBeTruthy();
    });
    expect(api.startResearch).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("research-continue"));
    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-questions-step")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Weekday"));
    fireEvent.click(screen.getByTestId("questions-continue"));

    await waitFor(() => {
      expect(api.answerQuestions).toHaveBeenCalled();
      expect(onAdvance).toHaveBeenCalled();
      expect(screen.getByTestId("goal-cycle-plan-step")).toBeTruthy();
    });
  });

  it("complete silence skips credit research and questions stay empty", async () => {
    const api = createApi();
    render(<GoalCycleFlow open onClose={vi.fn()} api={api} />);

    fireEvent.click(screen.getByTestId("goal-kind-break"));
    fireEvent.click(screen.getByTestId("break-mode-complete_silence"));

    await waitFor(() => screen.getByTestId("goal-cycle-context-step"));
    fireEvent.change(screen.getByTestId("context-topic"), {
      target: { value: "quiet month" }
    });
    fireEvent.click(screen.getByTestId("context-step-continue"));

    await waitFor(() => screen.getByTestId("goal-cycle-silence-note"));
    expect(screen.queryByTestId("research-start")).toBeNull();
    fireEvent.click(screen.getByTestId("research-continue"));

    await waitFor(() => screen.getByTestId("questions-empty"));
    expect(api.startResearch).not.toHaveBeenCalled();
  });

  it("shows no-credit state without inventing a top-up CTA", async () => {
    const api = createApi({
      startResearch: vi.fn(async () => {
        throw new RelayApiError("No credit", 402, "GOAL_CYCLE_NO_CREDIT");
      })
    });
    render(<GoalCycleFlow open onClose={vi.fn()} api={api} />);

    fireEvent.click(screen.getByTestId("goal-kind-views"));
    await waitFor(() => screen.getByTestId("goal-cycle-context-step"));
    fireEvent.change(screen.getByTestId("context-topic"), {
      target: { value: "views push" }
    });
    fireEvent.click(screen.getByTestId("context-step-continue"));
    await waitFor(() => screen.getByTestId("research-start"));
    fireEvent.click(screen.getByTestId("research-start"));

    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-no-credit").textContent).toMatch(
        /No Coach Plan credit/
      );
    });
    expect(screen.getByTestId("goal-cycle-no-credit").textContent).not.toMatch(
      /top.?up/i
    );
  });

  it("surfaces no-credit on goal select when start fails", async () => {
    const api = createApi({
      startCycle: vi.fn(async () => {
        throw new RelayApiError("No credit", 402, "GOAL_CYCLE_NO_CREDIT");
      })
    });
    render(<GoalCycleFlow open onClose={vi.fn()} api={api} />);

    fireEvent.click(screen.getByTestId("goal-kind-engagement"));
    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-no-credit").textContent).toMatch(
        /No Coach Plan credit/
      );
    });
    expect(screen.getByTestId("goal-cycle-goal-step")).toBeTruthy();
    expect(screen.queryByTestId("goal-cycle-context-step")).toBeNull();
  });

  it("close keeps cycle for resume via CLOSE machine path", async () => {
    const onClose = vi.fn();
    const api = createApi();
    render(
      <GoalCycleFlow
        open
        onClose={onClose}
        api={api}
        initialCycle={baseCycle({ phase: "context", state: "draft" })}
      />
    );
    await waitFor(() => screen.getByTestId("goal-cycle-context-step"));
    fireEvent.click(screen.getByTestId("goal-cycle-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("retries after mutation error", async () => {
    let failOnce = true;
    const api = createApi({
      startCycle: vi.fn(async ({ goal_kind }) => {
        if (failOnce) {
          failOnce = false;
          throw new RelayApiError("temporary", 503, "UPSTREAM");
        }
        return {
          cycle: baseCycle({ goal_kind, phase: "goal", version: 1 })
        };
      })
    });
    render(<GoalCycleFlow open onClose={vi.fn()} api={api} />);
    fireEvent.click(screen.getByTestId("goal-kind-engagement"));

    await waitFor(() => screen.getByTestId("goal-cycle-error-state"));
    fireEvent.click(screen.getByTestId("goal-cycle-error-retry"));

    await waitFor(() => {
      expect(screen.getByTestId("goal-cycle-context-step")).toBeTruthy();
    });
    expect(api.startCycle).toHaveBeenCalledTimes(2);
  });
});

describe("GoalCycleFlow (VS6-T04 + VS7-T06)", () => {
  it("revises Plan, filters unlinked destinations, and shows receipt after approve", async () => {
    const plan = samplePlan({ ai_revision_count: 0 });
    const api = createApi();
    const receipt = {
      cycle_id: "cycle_resume_1",
      approval_key: "appr_flow",
      status: "materialized" as const,
      materialized_at: "2026-07-17T20:00:00.000Z",
      slots: [
        {
          slot_id: "slot_1",
          post_id: "relay_p_1",
          distribution_plan_id: "plan_1",
          variant_ids: ["var_1"],
          task_ids: ["task_1"],
          rail_event_ids: ["task_1"],
          mode: "new_post" as const
        }
      ]
    };
    const onApprove = vi.fn(async () => ({
      receipt,
      cycle: baseCycle({
        phase: "active",
        state: "active",
        version: 8,
        plan,
        materialization: {
          cycle_id: receipt.cycle_id,
          approval_key: receipt.approval_key,
          status: "materialized" as const,
          materialized_at: receipt.materialized_at
        }
      })
    }));
    render(
      <GoalCycleFlow
        open
        onClose={vi.fn()}
        api={api}
        linkedDestinationIds={["patreon", "x"]}
        onApprove={onApprove}
        initialCycle={baseCycle({
          phase: "revisions",
          state: "review",
          version: 6,
          plan
        })}
      />
    );

    await waitFor(() => screen.getByTestId("goal-cycle-plan-step"));
    expect(screen.getByTestId("plan-revision-controls").textContent).toMatch(
      /Revisions 0 \/ 2/
    );

    fireEvent.change(screen.getByTestId("plan-revision-note"), {
      target: { value: "More evening slots" }
    });
    fireEvent.click(screen.getByTestId("plan-revise"));
    await waitFor(() => {
      expect(api.revisePlan).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("plan-continue"));
    await waitFor(() => screen.getByTestId("goal-cycle-logistics-step"));
    expect(screen.getByTestId("logistics-media-slot_1").textContent).toMatch(
      /Media missing/
    );
    expect(screen.getByTestId("logistics-unlinked-slot_1").textContent).toMatch(
      /deviantart/
    );

    fireEvent.click(screen.getByTestId("logistics-continue"));
    await waitFor(() => screen.getByTestId("goal-cycle-approval-step"));
    expect(screen.getByTestId("approval-side-effect-note").textContent).toMatch(
      /unpublished draft posts/
    );

    fireEvent.click(screen.getByTestId("approval-confirm"));
    await waitFor(() => screen.getByTestId("goal-cycle-receipt-summary"));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("receipt-missing-media")).toBeTruthy();
  });

  it("keeps approval step when materialization fails (no ghost rail)", async () => {
    const plan = samplePlan();
    const onApprove = vi.fn(async () => {
      throw new RelayApiError("stale", 409, "GOAL_CYCLE_VERSION_CONFLICT");
    });
    render(
      <GoalCycleFlow
        open
        onClose={vi.fn()}
        api={createApi()}
        onApprove={onApprove}
        initialCycle={baseCycle({
          phase: "approval",
          state: "review",
          version: 3,
          plan
        })}
      />
    );
    await waitFor(() => screen.getByTestId("goal-cycle-approval-step"));
    fireEvent.click(screen.getByTestId("approval-confirm"));
    await waitFor(() => screen.getByTestId("goal-cycle-error-state"));
    expect(screen.queryByTestId("goal-cycle-receipt-summary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => screen.getByTestId("goal-cycle-approval-step"));
  });

  it("blocks a third AI revision after the cap", async () => {
    const api = createApi();
    render(
      <GoalCycleFlow
        open
        onClose={vi.fn()}
        api={api}
        initialCycle={baseCycle({
          phase: "revisions",
          state: "review",
          plan: samplePlan({ ai_revision_count: 2 })
        })}
      />
    );
    await waitFor(() => screen.getByTestId("goal-cycle-plan-step"));
    expect(screen.getByTestId("plan-revise").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("plan-revision-note").hasAttribute("disabled")).toBe(
      true
    );
  });
});
