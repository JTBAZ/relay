"use client";

/**
 * Stateless bounded clarification question card (VS6-T02).
 * Max two questions are enforced by the planner — this is presentation only.
 */

import type { GoalCycleQuestion } from "@/lib/goal-cycle-types";

export type CoachQuestionCardProps = {
  question: GoalCycleQuestion;
  /** 1-based index for “Question N of M”. */
  index: number;
  total: number;
  onSelectOption?: (option: string) => void;
  onBoundedTextChange?: (value: string) => void;
  disabled?: boolean;
};

export function CoachQuestionCard({
  question,
  index,
  total,
  onSelectOption,
  onBoundedTextChange,
  disabled = false
}: CoachQuestionCardProps) {
  const cappedTotal = Math.min(Math.max(total, 1), 2);

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
      data-testid="coach-question-card"
      data-question-id={question.id}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#6b7280]">
        Question {Math.min(index, cappedTotal)} of {cappedTotal}
      </p>
      <p className="text-[14px] font-medium leading-snug text-[#f3f4f6]">
        {question.prompt}
      </p>

      {question.options.length > 0 ? (
        <ul className="flex flex-col gap-2" role="list">
          {question.options.map((option) => {
            const selected = question.answer === option;
            return (
              <li key={option}>
                <button
                  type="button"
                  disabled={disabled || !onSelectOption}
                  onClick={() => onSelectOption?.(option)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors ${
                    selected
                      ? "bg-[#00aa6f] font-semibold text-black"
                      : "bg-[rgba(255,255,255,0.04)] text-[#d1d5db] hover:bg-[rgba(255,255,255,0.08)]"
                  }`}
                  aria-pressed={selected}
                >
                  {option}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {question.bounded_text !== null || onBoundedTextChange ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-[#6b7280]">Short answer</span>
          <textarea
            value={question.bounded_text ?? question.answer ?? ""}
            disabled={disabled || !onBoundedTextChange}
            onChange={(e) => onBoundedTextChange?.(e.target.value)}
            rows={2}
            maxLength={280}
            className="resize-none rounded-xl border bg-transparent px-3 py-2 text-[13px] text-[#e5e7eb] outline-none focus:border-[#00aa6f]"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
            data-testid="coach-question-bounded-text"
          />
        </label>
      ) : null}
    </div>
  );
}
