"use client";

import type { GoalCycleDetail, GoalCyclePlan } from "@/lib/goal-cycle-types";

export type ApprovalStepProps = {
  cycle: GoalCycleDetail;
  plan: GoalCyclePlan;
  disabled?: boolean;
  /**
   * Explicit approval — VS6 only invokes the callback.
   * VS7 owns credit consume + materialization side effects.
   */
  onApprove: () => void;
  onBack: () => void;
};

export function ApprovalStep({
  cycle,
  plan,
  disabled = false,
  onApprove,
  onBack
}: ApprovalStepProps) {
  const slotCount = Math.min(plan.slots.length, 8);
  const silence =
    cycle.goal_kind === "break" && cycle.break_mode === "complete_silence";

  return (
    <div className="goal-cycle-step" data-testid="goal-cycle-approval-step">
      <header className="goal-cycle-step__header">
        <h2 className="goal-cycle-step__title">Approve Plan</h2>
        <p className="goal-cycle-step__lede">
          {silence
            ? "Complete silence creates a zero-slot receipt — no posts, no credit."
            : "Approval will create unpublished posts and rail events. Publishing stays creator-confirmed."}
        </p>
      </header>

      <div className="goal-cycle-credit" data-testid="approval-summary">
        <p className="goal-cycle-credit__body">
          {silence
            ? "Zero new posts · reminders suppressed for the interval"
            : `${slotCount} planned post${slotCount === 1 ? "" : "s"} · revisions used ${Math.min(plan.ai_revision_count, 2)} / 2`}
        </p>
        {plan.rationale ? (
          <p className="goal-cycle-help">{plan.rationale}</p>
        ) : null}
        {plan.warnings.length > 0 ? (
          <ul className="goal-cycle-help">
            {plan.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="goal-cycle-help" data-testid="approval-side-effect-note">
        Approving creates unpublished draft posts and Schedule Rail events. Nothing publishes
        without your confirmation.
      </p>

      <div className="goal-cycle-step__actions">
        <button
          type="button"
          className="goal-cycle-btn goal-cycle-btn--ghost"
          disabled={disabled}
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          className="goal-cycle-btn goal-cycle-btn--primary"
          disabled={disabled}
          onClick={onApprove}
          data-testid="approval-confirm"
        >
          Approve Plan
        </button>
      </div>
    </div>
  );
}
