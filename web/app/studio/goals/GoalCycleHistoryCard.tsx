"use client";

import type { GoalCycleAuditRecord } from "@/lib/goal-cycle-audit-fixtures";
import { GOAL_KIND_OPTIONS, BREAK_MODE_OPTIONS } from "@/app/components/goal-cycle/goal-cycle-copy";

function goalLabel(record: GoalCycleAuditRecord): string {
  const { goal_kind, break_mode } = record.cycle;
  if (goal_kind === "break") {
    const mode = BREAK_MODE_OPTIONS.find((m) => m.id === break_mode);
    return mode ? `Break · ${mode.label}` : "Break";
  }
  return GOAL_KIND_OPTIONS.find((g) => g.id === goal_kind)?.label ?? goal_kind;
}

export type GoalCycleHistoryCardProps = {
  record: GoalCycleAuditRecord;
  selected: boolean;
  isActive: boolean;
  onSelect: () => void;
};

export function GoalCycleHistoryCard({
  record,
  selected,
  isActive,
  onSelect
}: GoalCycleHistoryCardProps) {
  const { cycle, outcome } = {
    cycle: record.cycle,
    outcome: record.cycle.outcome
  };
  const learningStatus = record.learning?.status ?? null;

  return (
    <button
      type="button"
      className="goals-audit-card"
      data-testid={`goals-audit-card-${cycle.cycle_id}`}
      data-selected={selected ? "true" : "false"}
      data-active={isActive ? "true" : "false"}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className="goals-audit-card__row">
        <span className="goals-audit-card__title">{goalLabel(record)}</span>
        <span className="goals-audit-card__meta">{cycle.period_key}</span>
      </div>
      <div className="goals-audit-card__row goals-audit-card__row--muted">
        <span>{cycle.state.replaceAll("_", " ")}</span>
        {isActive ? <span className="goals-audit-pill">Active</span> : null}
      </div>
      {outcome ? (
        <p className="goals-audit-card__outcome">
          {outcome.target_label}
          {outcome.actual_label ? ` · ${outcome.actual_label}` : ""}
        </p>
      ) : (
        <p className="goals-audit-card__outcome">No outcome snapshot yet</p>
      )}
      {learningStatus ? (
        <p className="goals-audit-card__learning">Learning: {learningStatus}</p>
      ) : null}
    </button>
  );
}
