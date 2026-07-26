"use client";

import Link from "next/link";
import type { GoalCycleAuditRecord } from "@/lib/goal-cycle-audit-fixtures";
import { GOAL_KIND_OPTIONS, BREAK_MODE_OPTIONS } from "@/app/components/goal-cycle/goal-cycle-copy";

function formatFreshness(seconds: number | null | undefined): string {
  if (seconds == null) return "Freshness unknown";
  if (seconds < 60) return `Fresh · ${seconds}s`;
  if (seconds < 3600) return `Freshness · ${Math.round(seconds / 60)}m`;
  return `Freshness · ${Math.round(seconds / 3600)}h`;
}

function goalLabel(record: GoalCycleAuditRecord): string {
  const { goal_kind, break_mode } = record.cycle;
  if (goal_kind === "break") {
    const mode = BREAK_MODE_OPTIONS.find((m) => m.id === break_mode);
    return mode ? `Break · ${mode.label}` : "Break";
  }
  return GOAL_KIND_OPTIONS.find((g) => g.id === goal_kind)?.label ?? goal_kind;
}

export type GoalCycleDetailPanelProps = {
  record: GoalCycleAuditRecord;
  isActive: boolean;
};

export function GoalCycleDetailPanel({ record, isActive }: GoalCycleDetailPanelProps) {
  const { cycle, reflection, learning } = record;
  const plan = cycle.plan;
  const outcome = cycle.outcome;
  const analyticsHref =
    cycle.goal_kind === "paid_support"
      ? `/studio/analytics?focus=paid_support&cycle=${encodeURIComponent(cycle.cycle_id)}`
      : "/studio/analytics";

  return (
    <article className="goals-audit-detail" data-testid="goals-audit-detail">
      <header className="goals-audit-detail__header">
        <h2 className="goals-audit-detail__title">{goalLabel(record)}</h2>
        <p className="goals-audit-detail__lede">
          {cycle.period_key} · {cycle.state.replaceAll("_", " ")}
          {isActive ? " · resume from Library" : ""}
        </p>
      </header>

      <section className="goals-audit-block" aria-labelledby="goals-outcome-heading">
        <h3 id="goals-outcome-heading" className="goals-audit-block__title">
          Outcome
        </h3>
        {outcome ? (
          <dl className="goals-audit-dl">
            <div>
              <dt>Target</dt>
              <dd>{outcome.target_label}</dd>
            </div>
            <div>
              <dt>Actual</dt>
              <dd>{outcome.actual_label ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{outcome.confidence}</dd>
            </div>
            <div>
              <dt>Attribution</dt>
              <dd>{outcome.attribution ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Freshness</dt>
              <dd>{formatFreshness(outcome.freshness_seconds)}</dd>
            </div>
          </dl>
        ) : (
          <p className="goals-audit-muted">No outcome snapshot for this cycle yet.</p>
        )}
      </section>

      <section className="goals-audit-block" aria-labelledby="goals-plan-heading">
        <h3 id="goals-plan-heading" className="goals-audit-block__title">
          Plan
        </h3>
        {plan ? (
          <>
            <p className="goals-audit-muted">{plan.rationale}</p>
            <p className="goals-audit-muted">
              {plan.slots.length} slot{plan.slots.length === 1 ? "" : "s"} ·{" "}
              {plan.ai_revision_count} AI revision{plan.ai_revision_count === 1 ? "" : "s"}
            </p>
            <ul className="goals-audit-list">
              {plan.slots.map((slot) => (
                <li key={slot.id}>
                  {slot.title} · {slot.format} · media {slot.media_state}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="goals-audit-muted">No Plan on record.</p>
        )}
      </section>

      <section className="goals-audit-block" aria-labelledby="goals-evidence-heading">
        <h3 id="goals-evidence-heading" className="goals-audit-block__title">
          Evidence
        </h3>
        {cycle.evidence.length > 0 ? (
          <ul className="goals-audit-list">
            {cycle.evidence.map((ev) => (
              <li key={ev.ref_id}>
                {ev.summary}{" "}
                <span className="goals-audit-muted">
                  ({ev.kind} · {ev.confidence})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="goals-audit-muted">No evidence refs stored on this cycle.</p>
        )}
      </section>

      <section className="goals-audit-block" aria-labelledby="goals-reflection-heading">
        <h3 id="goals-reflection-heading" className="goals-audit-block__title">
          Reflection
        </h3>
        {reflection ? (
          <p data-testid="goals-audit-reflection">{reflection}</p>
        ) : (
          <p className="goals-audit-muted">No reflection recorded.</p>
        )}
      </section>

      <section className="goals-audit-block" aria-labelledby="goals-learning-heading">
        <h3 id="goals-learning-heading" className="goals-audit-block__title">
          Learning
        </h3>
        {learning ? (
          <div data-testid="goals-audit-learning">
            <p>
              Status: <strong>{learning.status}</strong>
            </p>
            <p className="goals-audit-muted">{learning.explanation}</p>
            <ul className="goals-audit-list">
              {learning.changes.map((change, idx) => (
                <li key={`${change.field}-${idx}`}>
                  {change.field}: {String(change.from)} → {String(change.to)}
                </li>
              ))}
            </ul>
            {learning.status === "rejected" ? (
              <p className="goals-audit-muted" data-testid="goals-audit-learning-rejected-note">
                Rejected — no preference change was kept.
              </p>
            ) : null}
            {learning.status === "accepted" ? (
              <p className="goals-audit-muted" data-testid="goals-audit-learning-accepted-note">
                Accepted — may seed a later cycle when you start one.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="goals-audit-muted">No learning proposal yet.</p>
        )}
      </section>

      <footer className="goals-audit-detail__footer">
        <Link
          href={analyticsHref}
          className="goals-audit-link"
          data-testid="goals-audit-analytics-link"
        >
          Open Analytics
        </Link>
        {isActive ? (
          <Link href="/studio" className="goals-audit-link" data-testid="goals-audit-resume-link">
            Resume in Library
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
