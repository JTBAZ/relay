"use client";

import { CoachQuestionCard } from "@/app/components/coach";
import type { GoalCycleQuestion } from "@/lib/goal-cycle-types";

export type QuestionsStepProps = {
  questions: GoalCycleQuestion[];
  disabled?: boolean;
  emptyLabel?: string;
  onAnswer: (questionId: string, answer: string) => void;
  onBoundedText: (questionId: string, text: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function QuestionsStep({
  questions,
  disabled = false,
  emptyLabel = "No clarifying questions — you can continue.",
  onAnswer,
  onBoundedText,
  onBack,
  onContinue
}: QuestionsStepProps) {
  const capped = questions.slice(0, 2);
  const allAnswered =
    capped.length === 0 ||
    capped.every((q) => Boolean((q.answer ?? q.bounded_text ?? "").trim()));

  return (
    <div className="goal-cycle-step" data-testid="goal-cycle-questions-step">
      <header className="goal-cycle-step__header">
        <h2 className="goal-cycle-step__title">Quick questions</h2>
        <p className="goal-cycle-step__lede">
          At most two bounded clarifications. Answers persist if you close and reopen.
        </p>
      </header>

      {capped.length === 0 ? (
        <p className="goal-cycle-help" data-testid="questions-empty">
          {emptyLabel}
        </p>
      ) : (
        <div className="goal-cycle-questions">
          {capped.map((q, index) => (
            <CoachQuestionCard
              key={q.id}
              question={q}
              index={index + 1}
              total={capped.length}
              disabled={disabled}
              onSelectOption={(option) => onAnswer(q.id, option)}
              onBoundedTextChange={
                q.options.length === 0
                  ? (text) => onBoundedText(q.id, text)
                  : undefined
              }
            />
          ))}
        </div>
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
          disabled={disabled || !allAnswered}
          onClick={onContinue}
          data-testid="questions-continue"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
