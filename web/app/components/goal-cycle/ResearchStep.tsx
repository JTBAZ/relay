"use client";

import {
  CoachEvidenceSummary,
  CoachGatheringPanel,
  CoachProgressList
} from "@/app/components/coach";
import type {
  CoachPlanCreditStatus,
  GoalCycleEvidenceRef,
  GoalCycleProgressEvent
} from "@/lib/goal-cycle-types";
import { COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE } from "@/lib/coach-plan-credit-api-fixtures";
import { CREDIT_EXPLANATION } from "./goal-cycle-copy";

export type ResearchStepProps = {
  /** Complete silence skips paid research. */
  silence: boolean;
  credit: CoachPlanCreditStatus | null;
  progress: GoalCycleProgressEvent[];
  evidence: GoalCycleEvidenceRef[];
  researching: boolean;
  liveMessage?: string | null;
  noCredit?: boolean;
  disabled?: boolean;
  onStartResearch: () => void;
  onBack: () => void;
  onContinue: () => void;
};

export function ResearchStep({
  silence,
  credit,
  progress,
  evidence,
  researching,
  liveMessage = null,
  noCredit = false,
  disabled = false,
  onStartResearch,
  onBack,
  onContinue
}: ResearchStepProps) {
  const available = credit?.available ?? 0;
  const reserved = credit?.reserved ?? 0;
  const hasEvidence = evidence.length > 0;
  const researchDone = silence || (!researching && (hasEvidence || progress.length > 0));

  return (
    <div className="goal-cycle-step" data-testid="goal-cycle-research-step">
      <header className="goal-cycle-step__header">
        <h2 className="goal-cycle-step__title">Research</h2>
        <p className="goal-cycle-step__lede">
          {silence
            ? "Complete silence skips research and credits."
            : "Operational progress only — no chain-of-thought. Weak evidence is disclosed."}
        </p>
      </header>

      {!silence ? (
        <div
          className="goal-cycle-credit"
          data-testid="goal-cycle-credit-explain"
        >
          <p className="goal-cycle-credit__body">{CREDIT_EXPLANATION}</p>
          {credit ? (
            <p className="goal-cycle-credit__balance">
              Available {available}
              {reserved > 0 ? ` · reserved ${reserved}` : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="goal-cycle-help" data-testid="goal-cycle-silence-note">
          No Coach Plan credit is reserved for complete silence.
        </p>
      )}

      {noCredit && !silence ? (
        <div
          className="goal-cycle-alert"
          role="alert"
          data-testid="goal-cycle-no-credit"
        >
          <p className="goal-cycle-alert__title">
            {COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE.title}
          </p>
          <p className="goal-cycle-alert__body">{COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE.body}</p>
        </div>
      ) : null}

      {researching ? (
        <CoachGatheringPanel message={liveMessage ?? "Researching…"} />
      ) : (
        <>
          <CoachProgressList events={progress} liveMessage={liveMessage} />
          <CoachEvidenceSummary evidence={evidence} />
        </>
      )}

      <div className="goal-cycle-step__actions">
        <button
          type="button"
          className="goal-cycle-btn goal-cycle-btn--ghost"
          disabled={disabled || researching}
          onClick={onBack}
        >
          Back
        </button>
        {!silence && !researchDone && !noCredit ? (
          <button
            type="button"
            className="goal-cycle-btn goal-cycle-btn--primary"
            disabled={disabled || researching}
            onClick={onStartResearch}
            data-testid="research-start"
          >
            Start research
          </button>
        ) : (
          <button
            type="button"
            className="goal-cycle-btn goal-cycle-btn--primary"
            disabled={disabled || researching || (noCredit && !silence)}
            onClick={onContinue}
            data-testid="research-continue"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
