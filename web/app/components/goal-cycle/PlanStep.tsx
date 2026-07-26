"use client";

import { CoachProposalPreview } from "@/app/components/coach";
import type { GoalCyclePlan, GoalCyclePlanSlot } from "@/lib/goal-cycle-types";

const MAX_SLOTS = 8;
const MAX_REVISIONS = 2;

export type PlanStepProps = {
  plan: GoalCyclePlan | null;
  generating?: boolean;
  disabled?: boolean;
  revisionNote: string;
  onRevisionNoteChange: (value: string) => void;
  onGenerate: () => void;
  onRevise: () => void;
  onSlotChange: (slotId: string, patch: Partial<GoalCyclePlanSlot>) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function PlanStep({
  plan,
  generating = false,
  disabled = false,
  revisionNote,
  onRevisionNoteChange,
  onGenerate,
  onRevise,
  onSlotChange,
  onBack,
  onContinue
}: PlanStepProps) {
  const slots = (plan?.slots ?? []).slice(0, MAX_SLOTS);
  const revisionCount = Math.min(plan?.ai_revision_count ?? 0, MAX_REVISIONS);
  const canRevise = Boolean(plan) && revisionCount < MAX_REVISIONS;
  const overCap = (plan?.slots.length ?? 0) > MAX_SLOTS;

  return (
    <div className="goal-cycle-step" data-testid="goal-cycle-plan-step">
      <header className="goal-cycle-step__header">
        <h2 className="goal-cycle-step__title">Your Plan</h2>
        <p className="goal-cycle-step__lede">
          Up to eight slots. At most two AI revisions — then manual edits stay available.
        </p>
      </header>

      {!plan ? (
        <div className="goal-cycle-step__actions" style={{ justifyContent: "flex-start" }}>
          <button
            type="button"
            className="goal-cycle-btn goal-cycle-btn--primary"
            disabled={disabled || generating}
            onClick={onGenerate}
            data-testid="plan-generate"
          >
            {generating ? "Generating…" : "Generate Plan"}
          </button>
        </div>
      ) : (
        <>
          <CoachProposalPreview plan={plan} />
          {overCap ? (
            <p className="goal-cycle-alert__body" data-testid="plan-slot-cap">
              Only the first {MAX_SLOTS} slots are shown. Remove extras before approval.
            </p>
          ) : null}

          <ul className="goal-cycle-slot-list" role="list">
            {slots.map((slot, index) => (
              <li key={slot.id} className="goal-cycle-slot" data-testid={`plan-slot-${slot.id}`}>
                <p className="goal-cycle-field__label">
                  Slot {index + 1}
                  {slot.format ? ` · ${slot.format}` : ""}
                </p>
                <label className="goal-cycle-field">
                  <span className="goal-cycle-field__label">Title</span>
                  <input
                    type="text"
                    className="goal-cycle-input"
                    value={slot.title}
                    disabled={disabled}
                    maxLength={120}
                    onChange={(e) => onSlotChange(slot.id, { title: e.target.value })}
                    data-testid={`plan-slot-title-${slot.id}`}
                  />
                </label>
                <label className="goal-cycle-field">
                  <span className="goal-cycle-field__label">Draft</span>
                  <textarea
                    className="goal-cycle-textarea"
                    value={slot.draft_body}
                    disabled={disabled}
                    rows={3}
                    maxLength={2000}
                    onChange={(e) => onSlotChange(slot.id, { draft_body: e.target.value })}
                    data-testid={`plan-slot-body-${slot.id}`}
                  />
                </label>
                {slot.evidence_refs.length > 0 ? (
                  <p className="goal-cycle-help">
                    Evidence: {slot.evidence_refs.join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="goal-cycle-revision" data-testid="plan-revision-controls">
            <p className="goal-cycle-credit__balance">
              Revisions {revisionCount} / {MAX_REVISIONS}
            </p>
            <label className="goal-cycle-field">
              <span className="goal-cycle-field__label">Revision note</span>
              <textarea
                className="goal-cycle-textarea"
                value={revisionNote}
                disabled={disabled || !canRevise}
                rows={2}
                maxLength={400}
                onChange={(e) => onRevisionNoteChange(e.target.value)}
                data-testid="plan-revision-note"
                placeholder={
                  canRevise
                    ? "What should change?"
                    : "AI revision cap reached — edit slots manually"
                }
              />
            </label>
            <button
              type="button"
              className="goal-cycle-btn goal-cycle-btn--ghost"
              disabled={disabled || !canRevise || !revisionNote.trim()}
              onClick={onRevise}
              data-testid="plan-revise"
            >
              Request AI revision
            </button>
          </div>
        </>
      )}

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
          disabled={disabled || !plan || generating}
          onClick={onContinue}
          data-testid="plan-continue"
        >
          Continue to logistics
        </button>
      </div>
    </div>
  );
}
