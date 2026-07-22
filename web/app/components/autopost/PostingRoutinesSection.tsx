"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteScheduleSeries,
  listScheduleSeries,
  patchScheduleSeries,
  type ScheduleSeriesWire
} from "@/lib/autopost-routines-api";

/**
 * Extracted posting-routines list (VS7 / B17) — behavior-preserving section.
 * Shared by `/studio/autopost/routines` and Schedule Rail Automations modal.
 */
export function PostingRoutinesSection() {
  const [series, setSeries] = useState<ScheduleSeriesWire[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setSeries(await listScheduleSeries());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="space-y-3" data-testid="routines-list">
      <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Posting routines</h2>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {series.length === 0 ? (
        <p className="text-sm text-[var(--lib-fg-muted)]">
          No routines yet. After you create a Post on the Schedule Rail, choose{" "}
          <span className="text-[var(--lib-fg)]">Every week</span> or{" "}
          <span className="text-[var(--lib-fg)]">Every month</span>.
        </p>
      ) : (
        <ul className="space-y-2">
          {series.map((row) => (
            <li
              key={row.series_id}
              className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg-elevated)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--lib-fg)]">
                    {row.title_hint || "Routine"} · {row.cadence}
                    {row.interval > 1 ? ` / ${row.interval}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--lib-fg-muted)]">
                    {row.local_time} · {row.timezone} · {row.destinations.join(", ")} ·{" "}
                    <span className="capitalize">{row.status}</span>
                    {row.next_occurrence_at
                      ? ` · next ${new Date(row.next_occurrence_at).toLocaleString()}`
                      : ""}
                  </p>
                  {row.last_error ? (
                    <p className="mt-1 text-xs text-amber-400">{row.last_error}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded border border-[var(--lib-border)] px-2 py-1 text-[10px]"
                    onClick={() => {
                      setBusy(true);
                      void patchScheduleSeries(row.series_id, {
                        status: row.status === "paused" ? "active" : "paused"
                      })
                        .then(refresh)
                        .finally(() => setBusy(false));
                    }}
                  >
                    {row.status === "paused" ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded border border-[var(--lib-border)] px-2 py-1 text-[10px] text-red-300"
                    onClick={() => {
                      setBusy(true);
                      void deleteScheduleSeries(row.series_id, { delete_future_only: true })
                        .then(refresh)
                        .finally(() => setBusy(false));
                    }}
                  >
                    End future
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
