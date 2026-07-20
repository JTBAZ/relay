"use client";

import type { GoalCycleDetail, GoalCyclePlan } from "@/lib/goal-cycle-types";

export type ActiveCyclePanelProps = {
  cycle: GoalCycleDetail;
  plan: GoalCyclePlan | null;
  cancelling?: boolean;
  onClose: () => void;
  onCancelCycle: () => void | Promise<void>;
};

function goalLabel(cycle: GoalCycleDetail): string {
  if (cycle.goal_kind === "break") {
    if (cycle.break_mode === "social_upkeep") return "Take a break · social upkeep";
    if (cycle.break_mode === "active_rest") return "Take a break · active rest";
    if (cycle.break_mode === "complete_silence") return "Take a break · silence";
    return "Take a break";
  }
  if (cycle.goal_kind === "paid_support") return "Paid support";
  if (cycle.goal_kind === "views") return "Views";
  if (cycle.goal_kind === "engagement") return "Engagement";
  return cycle.goal_kind;
}

/**
 * Post-approval resume surface — planning steps no longer apply while the cycle is active.
 */
export function ActiveCyclePanel({
  cycle,
  plan,
  cancelling = false,
  onClose,
  onCancelCycle
}: ActiveCyclePanelProps) {
  const slotCount = plan?.slots?.length ?? 0;

  return (
    <div className="goal-cycle-step" data-testid="goal-cycle-active-panel">
      <header className="goal-cycle-step__header">
        <h2 className="goal-cycle-step__title">Plan is live</h2>
        <p className="goal-cycle-step__lede">
          This cycle is active on the Schedule Rail. Finish or cancel it before starting another
          Coach Plan — only one cycle can be active at a time (not a monthly limit).
        </p>
      </header>

      <div className="goal-cycle-credit" data-testid="active-cycle-summary">
        <p className="goal-cycle-credit__body">
          {goalLabel(cycle)}
          {slotCount > 0
            ? ` · ${slotCount} planned slot${slotCount === 1 ? "" : "s"}`
            : ""}
        </p>
        <p className="goal-cycle-help">
          State: {cycle.state} · phase: {cycle.phase}
        </p>
      </div>

      <p className="goal-cycle-help">
        Attach media and confirm publish from the rail. When you want a new goal (including break /
        upkeep), cancel this cycle first.
      </p>

      <div className="goal-cycle-step__actions">
        <button
          type="button"
          className="goal-cycle-btn goal-cycle-btn--ghost"
          onClick={() => void onCancelCycle()}
          disabled={cancelling}
          data-testid="active-cycle-cancel"
        >
          {cancelling ? "Cancelling…" : "Cancel this cycle"}
        </button>
        <button
          type="button"
          className="goal-cycle-btn goal-cycle-btn--primary"
          onClick={onClose}
          data-testid="active-cycle-done"
        >
          Back to Library
        </button>
      </div>
    </div>
  );
}
