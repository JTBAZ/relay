"use client";

import type {
  GoalCycleMaterializationReceipt,
  GoalCyclePlan
} from "@/lib/goal-cycle-types";
import {
  collectMissingMediaSlots,
  type GoalCycleMissingMediaSlot
} from "./goal-cycle-rail-handoff";

export type ReceiptSummaryProps = {
  receipt: GoalCycleMaterializationReceipt;
  plan: GoalCyclePlan | null;
  onDone: () => void;
};

export function ReceiptSummary({ receipt, plan, onDone }: ReceiptSummaryProps) {
  const silence = receipt.slots.length === 0;
  const missing: GoalCycleMissingMediaSlot[] = collectMissingMediaSlots(receipt, plan);
  const postCount = receipt.slots.filter((s) => s.post_id).length;
  const eventCount = receipt.slots.reduce((n, s) => n + s.rail_event_ids.length, 0);

  return (
    <div className="goal-cycle-step" data-testid="goal-cycle-receipt-summary">
      <header className="goal-cycle-step__header">
        <h2 className="goal-cycle-step__title">Plan approved</h2>
        <p className="goal-cycle-step__lede">
          {silence
            ? "Silence receipt saved. Reminders are suppressed for the interval — nothing was added to the rail."
            : "Unpublished posts and rail events are ready. Publishing still needs your confirmation."}
        </p>
      </header>

      <div className="goal-cycle-credit" data-testid="receipt-summary-stats">
        <p className="goal-cycle-credit__body">
          {silence
            ? "0 posts · 0 rail events · no credit consumed"
            : `${postCount} draft post${postCount === 1 ? "" : "s"} · ${eventCount} rail event${eventCount === 1 ? "" : "s"}`}
        </p>
        <p className="goal-cycle-help" data-testid="receipt-approval-key">
          Receipt · {receipt.approval_key}
        </p>
      </div>

      {missing.length > 0 ? (
        <div data-testid="receipt-missing-media">
          <p className="goal-cycle-step__subhead">Needs media (for later)</p>
          <ul className="goal-cycle-help">
            {missing.map((m) => (
              <li key={m.slot_id}>
                {m.title}
                {m.post_id ? ` · ${m.post_id}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="goal-cycle-step__actions">
        <button
          type="button"
          className="goal-cycle-btn goal-cycle-btn--primary"
          onClick={onDone}
          data-testid="receipt-done"
        >
          Done
        </button>
      </div>
    </div>
  );
}
