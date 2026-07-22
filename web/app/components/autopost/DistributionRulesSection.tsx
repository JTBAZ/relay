"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  createDistributionRule,
  deleteDistributionRule,
  listDistributionRuleRuns,
  listDistributionRules,
  patchDistributionRule,
  type DistributionRuleRunWire,
  type DistributionRuleWire
} from "@/lib/autopost-routines-api";
import { DEST_LABELS, type Destination } from "@/lib/schedule-rail-data";

const RULE_DESTS = (Object.keys(DEST_LABELS) as Destination[]).filter(
  (d): d is NonNullable<Destination> => Boolean(d) && d !== "patreon"
);

/**
 * Extracted distribution-rules panel (VS7 / B17) — behavior-preserving section.
 * Shared by `/studio/autopost/routines` and Schedule Rail Automations modal.
 */
export function DistributionRulesSection() {
  const [rules, setRules] = useState<DistributionRuleWire[]>([]);
  const [runsByRule, setRunsByRule] = useState<Record<string, DistributionRuleRunWire[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offsetDays, setOffsetDays] = useState(30);
  const [ruleDests, setRuleDests] = useState<string[]>(["x", "deviantart"]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setRules(await listDistributionRules());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadRuns = async (ruleId: string) => {
    const runs = await listDistributionRuleRuns(ruleId);
    setRunsByRule((prev) => ({ ...prev, [ruleId]: runs }));
  };

  return (
    <section className="space-y-3" data-testid="distribution-rules-panel">
      <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Distribution rules</h2>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rounded-lg border border-[var(--lib-border)] p-3">
        <p className="text-sm text-[var(--lib-fg)]">
          After a Patreon post is published, wait{" "}
          <input
            type="number"
            min={0}
            max={365}
            value={offsetDays}
            onChange={(e) => setOffsetDays(Math.max(0, Number(e.target.value) || 0))}
            className="mx-1 w-14 rounded border border-[var(--lib-border)] bg-transparent px-1 py-0.5 text-center"
          />{" "}
          days, then prepare previews for{" "}
          {RULE_DESTS.map((d) => {
            const on = ruleDests.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setRuleDests((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))
                }
                className={`mx-0.5 rounded px-1.5 py-0.5 text-xs ${
                  on ? "bg-emerald-900/40 text-emerald-200" : "text-[var(--lib-fg-muted)]"
                }`}
              >
                {DEST_LABELS[d]}
              </button>
            );
          })}
          .
        </p>
        <button
          type="button"
          disabled={busy || ruleDests.length === 0}
          className="mt-3 rounded-md bg-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-950 disabled:opacity-40"
          data-testid="create-distribution-rule"
          onClick={() => {
            setBusy(true);
            void createDistributionRule({
              offset_days: offsetDays,
              target_destinations: ruleDests
            })
              .then(refresh)
              .catch((err) => setError(err instanceof Error ? err.message : String(err)))
              .finally(() => setBusy(false));
          }}
        >
          Save rule
        </button>
      </div>

      <ul className="space-y-2">
        {rules.map((rule) => (
          <li
            key={rule.rule_id}
            className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg-elevated)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--lib-fg)]">
                  Wait {rule.offset_days} days → {rule.target_destinations.join(", ")} (
                  {rule.transform_mode})
                </p>
                <p className="text-xs capitalize text-[var(--lib-fg-muted)]">
                  {rule.status}
                  {rule.last_error ? ` · ${rule.last_error}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded border border-[var(--lib-border)] px-2 py-1 text-[10px]"
                  onClick={() => {
                    setBusy(true);
                    void patchDistributionRule(rule.rule_id, {
                      status: rule.status === "paused" ? "active" : "paused"
                    })
                      .then(refresh)
                      .finally(() => setBusy(false));
                  }}
                >
                  {rule.status === "paused" ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  className="rounded border border-[var(--lib-border)] px-2 py-1 text-[10px]"
                  onClick={() => void loadRuns(rule.rule_id)}
                >
                  History
                </button>
                <button
                  type="button"
                  className="rounded border border-[var(--lib-border)] px-2 py-1 text-[10px] text-red-300"
                  onClick={() => {
                    setBusy(true);
                    void deleteDistributionRule(rule.rule_id)
                      .then(refresh)
                      .finally(() => setBusy(false));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
            {runsByRule[rule.rule_id]?.length ? (
              <ul className="mt-2 space-y-1 border-t border-[var(--lib-border)] pt-2">
                {runsByRule[rule.rule_id].map((run) => (
                  <li key={run.run_id} className="text-[11px] text-[var(--lib-fg-muted)]">
                    {run.status} · due {new Date(run.due_at).toLocaleString()}
                    {run.draft_id ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          href={`/studio/autopost?draft_id=${encodeURIComponent(run.draft_id)}`}
                          className="text-emerald-300 underline"
                        >
                          Open draft
                        </Link>
                      </>
                    ) : null}
                    {run.failure_reason ? ` · ${run.failure_reason}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
