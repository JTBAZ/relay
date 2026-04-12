"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchActionCenterCards,
  fetchAnalyticsHealth,
  postActionCenterAccept,
  postActionCenterDismiss,
  postAnalyticsGenerate,
  type ActionCenterCard,
  type AnalyticsHealthData
} from "@/lib/relay-api";

const defaultCreatorId = process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "creator_1";

function formatDeltaRange(metric: string, range: [number, number], horizon: number): string {
  const [a, b] = range;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  return `${metric}: ${sign(a)}${a} to ${sign(b)}${b} over ~${horizon}d`;
}

export default function ActionCenterView() {
  const creatorId = defaultCreatorId;
  const [cards, setCards] = useState<ActionCenterCard[]>([]);
  const [health, setHealth] = useState<AnalyticsHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, h] = await Promise.all([
        fetchActionCenterCards(creatorId),
        fetchAnalyticsHealth()
      ]);
      setCards(list.items);
      setHealth(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefreshInsights = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await postAnalyticsGenerate(creatorId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const onAccept = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await postActionCenterAccept(creatorId, id, "accepted from Action Center");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const onDismiss = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await postActionCenterDismiss(creatorId, id, "not_relevant_now");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--lib-bg)] text-sm text-[var(--lib-fg-muted)]">
        Loading insights…
      </div>
    );
  }

  return (
    <div className="library-shell flex min-h-0 flex-1 flex-col overflow-auto bg-[var(--lib-bg)] text-[var(--lib-fg)]">
      <header className="shrink-0 border-b border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_65%,var(--lib-bg))] px-6 py-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-lg text-[var(--lib-fg)]">
              Action Center
            </h1>
            <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
              Prioritized recommendations from your Library analytics. Creator:{" "}
              <code className="rounded bg-[var(--lib-card)] px-1 py-0.5 text-[11px]">{creatorId}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefreshInsights()}
            disabled={refreshing}
            className="shrink-0 rounded-md border border-[var(--lib-border)] bg-[oklch(0.22_0.012_160)] px-4 py-2 text-xs font-medium text-[var(--lib-fg)] transition hover:bg-[oklch(0.26_0.012_160)] disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh insights"}
          </button>
        </div>
      </header>

      {health && (
        <div className="mx-auto w-full max-w-4xl px-6 py-3 text-[11px] text-[var(--lib-fg-muted)]">
          <span
            className={
              health.status === "ok" ? "text-[oklch(0.72_0.12_145)]" : "text-[oklch(0.72_0.14_55)]"
            }
          >
            API insight jobs: {health.status}
          </span>
          {health.metrics.generate_attempts > 0 && (
            <span className="ml-2">
              · success{" "}
              {health.metrics.success_ratio !== null
                ? `${(health.metrics.success_ratio * 100).toFixed(1)}%`
                : "—"}{" "}
              ({health.metrics.generate_successes}/{health.metrics.generate_successes + health.metrics.generate_failures}{" "}
              completed)
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mx-auto w-full max-w-4xl px-6 py-2 text-sm text-[oklch(0.72_0.14_55)]">
          {error}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-6">
        {cards.length === 0 ? (
          <p className="text-sm text-[var(--lib-fg-muted)]">
            No open cards. Run <strong>Refresh insights</strong> after ingesting posts, or check another creator via{" "}
            <code className="rounded bg-[var(--lib-card)] px-1">NEXT_PUBLIC_RELAY_CREATOR_ID</code>.
          </p>
        ) : (
          cards.map((card) => (
            <article
              key={card.recommendation_id}
              className="rounded-lg border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_88%,var(--lib-bg))] p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">
                    {card.card_type.replace(/_/g, " ")}
                  </p>
                  <h2 className="mt-1 font-[family-name:var(--font-display)] text-base">{card.title}</h2>
                </div>
                <span className="rounded-full border border-[var(--lib-border)] px-2 py-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                  {(card.confidence_score * 100).toFixed(0)}% confidence
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-[10px] uppercase text-[var(--lib-fg-muted)]">Signal</dt>
                  <dd className="text-[var(--lib-fg)]">{card.signal}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[var(--lib-fg-muted)]">Diagnosis</dt>
                  <dd>{card.diagnosis}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[var(--lib-fg-muted)]">Recommendation</dt>
                  <dd>{card.recommendation}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[var(--lib-fg-muted)]">Expected impact</dt>
                  <dd>
                    {formatDeltaRange(
                      card.expected_impact.metric,
                      card.expected_impact.delta_range,
                      card.expected_impact.horizon_days
                    )}
                  </dd>
                </div>
              </dl>
              {card.status === "open" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === card.recommendation_id}
                    onClick={() => void onAccept(card.recommendation_id)}
                    className="rounded-md bg-[oklch(0.42_0.14_145)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[oklch(0.48_0.14_145)] disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busyId === card.recommendation_id}
                    onClick={() => void onDismiss(card.recommendation_id)}
                    className="rounded-md border border-[var(--lib-border)] px-3 py-1.5 text-xs text-[var(--lib-fg)] hover:bg-[var(--lib-card)] disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              {card.status !== "open" && (
                <p className="mt-3 text-xs text-[var(--lib-fg-muted)]">Status: {card.status}</p>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
