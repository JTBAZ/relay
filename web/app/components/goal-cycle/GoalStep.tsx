"use client";

import type { GoalCycleBreakMode, GoalCycleGoalKind } from "@/lib/goal-cycle-types";
import { COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE } from "@/lib/coach-plan-credit-api-fixtures";
import {
  BREAK_MODE_OPTIONS,
  GOAL_KIND_OPTIONS
} from "./goal-cycle-copy";

export type GoalStepProps = {
  goalKind: GoalCycleGoalKind | null;
  breakMode: GoalCycleBreakMode | null;
  disabled?: boolean;
  /** Shown when start fails with GOAL_CYCLE_NO_CREDIT (credit goals only). */
  noCredit?: boolean;
  onGoalKindChange: (kind: GoalCycleGoalKind) => void;
  onBreakModeChange: (mode: GoalCycleBreakMode) => void;
  /**
   * Advance with the selected values (avoids stale React state on click).
   * Non-break goals advance immediately; break waits for a break-mode pick.
   */
  onAdvance: (
    goalKind: GoalCycleGoalKind,
    breakMode: GoalCycleBreakMode | null
  ) => void;
};

export function GoalStep({
  goalKind,
  breakMode,
  disabled = false,
  noCredit = false,
  onGoalKindChange,
  onBreakModeChange,
  onAdvance
}: GoalStepProps) {
  const selectedHelp = GOAL_KIND_OPTIONS.find((o) => o.id === goalKind)?.help;

  return (
    <div className="goal-cycle-step" data-testid="goal-cycle-goal-step">
      <header className="goal-cycle-step__header">
        <h2 className="goal-cycle-step__title">Choose a goal</h2>
        <p className="goal-cycle-step__lede">
          Pick what Relay can measure this cycle. Help text explains the source of truth.
        </p>
      </header>

      <ul className="goal-cycle-choice-list" role="list">
        {GOAL_KIND_OPTIONS.map((opt) => {
          const selected = goalKind === opt.id;
          return (
            <li key={opt.id}>
              <button
                type="button"
                disabled={disabled}
                className={`goal-cycle-choice${selected ? " is-selected" : ""}`}
                aria-pressed={selected}
                onClick={() => {
                  onGoalKindChange(opt.id);
                  if (opt.id !== "break") {
                    onAdvance(opt.id, null);
                  }
                }}
                data-testid={`goal-kind-${opt.id}`}
              >
                <span className="goal-cycle-choice__label">{opt.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {selectedHelp ? (
        <p className="goal-cycle-help" data-testid="goal-kind-help">
          {selectedHelp}
        </p>
      ) : null}

      {goalKind === "break" ? (
        <div className="goal-cycle-break" data-testid="goal-cycle-break-modes">
          <p className="goal-cycle-step__subhead">How quiet should this be?</p>
          <ul className="goal-cycle-choice-list" role="list">
            {BREAK_MODE_OPTIONS.map((opt) => {
              const selected = breakMode === opt.id;
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    className={`goal-cycle-choice${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => {
                      onBreakModeChange(opt.id);
                      onAdvance("break", opt.id);
                    }}
                    data-testid={`break-mode-${opt.id}`}
                  >
                    <span className="goal-cycle-choice__label">{opt.label}</span>
                    <span className="goal-cycle-choice__meta">
                      {opt.usesCredit ? "Uses 1 credit" : "Free"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {breakMode ? (
            <p className="goal-cycle-help" data-testid="break-mode-help">
              {BREAK_MODE_OPTIONS.find((o) => o.id === breakMode)?.help}
            </p>
          ) : null}
        </div>
      ) : null}

      {noCredit ? (
        <div
          className="goal-cycle-alert"
          role="alert"
          data-testid="goal-cycle-no-credit"
        >
          <p className="goal-cycle-alert__title">
            {COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE.title}
          </p>
          <p className="goal-cycle-alert__body">
            {COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE.body}
          </p>
        </div>
      ) : null}
    </div>
  );
}
