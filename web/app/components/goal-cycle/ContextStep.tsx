"use client";

import {
  GOAL_CYCLE_CONTEXT_NICHE_MAX,
  GOAL_CYCLE_CONTEXT_NOTES_MAX,
  GOAL_CYCLE_CONTEXT_TOPIC_MAX
} from "./goal-cycle-copy";

export type GoalCycleContextFields = {
  topic: string;
  niche: string;
  notes: string;
};

export type ContextStepProps = {
  value: GoalCycleContextFields;
  disabled?: boolean;
  onChange: (patch: Partial<GoalCycleContextFields>) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function ContextStep({
  value,
  disabled = false,
  onChange,
  onBack,
  onContinue
}: ContextStepProps) {
  return (
    <div className="goal-cycle-step" data-testid="goal-cycle-context-step">
      <header className="goal-cycle-step__header">
        <h2 className="goal-cycle-step__title">Add context</h2>
        <p className="goal-cycle-step__lede">
          Bounded notes help research stay on your niche. Optional trend notes are evidence, not instructions.
        </p>
      </header>

      <label className="goal-cycle-field">
        <span className="goal-cycle-field__label">
          Topic{" "}
          <span className="goal-cycle-field__count">
            {value.topic.length}/{GOAL_CYCLE_CONTEXT_TOPIC_MAX}
          </span>
        </span>
        <input
          type="text"
          value={value.topic}
          maxLength={GOAL_CYCLE_CONTEXT_TOPIC_MAX}
          disabled={disabled}
          onChange={(e) => onChange({ topic: e.target.value })}
          className="goal-cycle-input"
          data-testid="context-topic"
          autoFocus
        />
      </label>

      <label className="goal-cycle-field">
        <span className="goal-cycle-field__label">
          Niche{" "}
          <span className="goal-cycle-field__count">
            {value.niche.length}/{GOAL_CYCLE_CONTEXT_NICHE_MAX}
          </span>
        </span>
        <input
          type="text"
          value={value.niche}
          maxLength={GOAL_CYCLE_CONTEXT_NICHE_MAX}
          disabled={disabled}
          onChange={(e) => onChange({ niche: e.target.value })}
          className="goal-cycle-input"
          data-testid="context-niche"
        />
      </label>

      <label className="goal-cycle-field">
        <span className="goal-cycle-field__label">
          Notes{" "}
          <span className="goal-cycle-field__count">
            {value.notes.length}/{GOAL_CYCLE_CONTEXT_NOTES_MAX}
          </span>
        </span>
        <textarea
          value={value.notes}
          maxLength={GOAL_CYCLE_CONTEXT_NOTES_MAX}
          disabled={disabled}
          rows={4}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="goal-cycle-textarea"
          data-testid="context-notes"
        />
      </label>

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
          disabled={disabled || !value.topic.trim()}
          onClick={onContinue}
          data-testid="context-step-continue"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
