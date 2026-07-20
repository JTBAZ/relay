"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { GoalCycleAuditRecord } from "@/lib/goal-cycle-audit-fixtures";
import { GoalCycleHistoryCard } from "./GoalCycleHistoryCard";
import { GoalCycleDetailPanel } from "./GoalCycleDetail";
import "@/app/components/goal-cycle/goal-cycle.css";
import "./goals-audit.css";

export type GoalsAuditViewProps = {
  records: GoalCycleAuditRecord[];
  activeCycleId: string | null;
  selectedCycleId: string | null;
  onSelect: (cycleId: string) => void;
  loading?: boolean;
  error?: string | null;
};

export function GoalsAuditView({
  records,
  activeCycleId,
  selectedCycleId,
  onSelect,
  loading = false,
  error = null
}: GoalsAuditViewProps) {
  const selected = useMemo(
    () => records.find((r) => r.cycle.cycle_id === selectedCycleId) ?? records[0] ?? null,
    [records, selectedCycleId]
  );

  return (
    <div className="goals-audit goal-cycle-flow" data-testid="goals-audit-view">
      <header className="goals-audit__header">
        <div>
          <p className="goals-audit__eyebrow">Studio · secondary</p>
          <h1 className="goals-audit__title">Goal history</h1>
          <p className="goals-audit__lede">
            Quiet audit of Coach Plan cycles — outcomes, reflection, and confirmed learning. Planning
            stays in the Library.
          </p>
        </div>
        <Link href="/studio" className="goals-audit-link" data-testid="goals-audit-library-link">
          Library
        </Link>
      </header>

      {error ? (
        <p className="goals-audit-error" role="alert" data-testid="goals-audit-error">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="goals-audit-muted" data-testid="goals-audit-loading">
          Loading cycles…
        </p>
      ) : null}

      {!loading && records.length === 0 ? (
        <p className="goals-audit-muted" data-testid="goals-audit-empty">
          No Goal Cycles yet. Start one from the Library Coach Plan.
        </p>
      ) : null}

      {records.length > 0 ? (
        <div className="goals-audit__layout">
          <div className="goals-audit__list" role="list" aria-label="Goal Cycle history">
            {activeCycleId ? (
              <p className="goals-audit-active-hint" data-testid="goals-audit-active-hint">
                An active cycle is in progress — resume from Library when you are ready.
              </p>
            ) : null}
            {records.map((record) => (
              <div key={record.cycle.cycle_id} role="listitem">
                <GoalCycleHistoryCard
                  record={record}
                  selected={selected?.cycle.cycle_id === record.cycle.cycle_id}
                  isActive={record.cycle.cycle_id === activeCycleId}
                  onSelect={() => onSelect(record.cycle.cycle_id)}
                />
              </div>
            ))}
          </div>
          <div className="goals-audit__detail">
            {selected ? (
              <GoalCycleDetailPanel
                record={selected}
                isActive={selected.cycle.cycle_id === activeCycleId}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
