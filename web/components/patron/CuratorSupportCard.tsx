"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RelayApiError,
  fetchPatronSupportSummary,
  type PatronSupportSummaryWire
} from "@/lib/relay-api";
import { CuratorBadge } from "@/components/patron/CuratorBadge";

type LoadState =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "ready"; summary: PatronSupportSummaryWire };

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** MB-14 — "Your support this month" patronage card. */
export function CuratorSupportCard(): React.ReactElement | null {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const summary = await fetchPatronSupportSummary();
      setLoad({ status: "ready", summary });
    } catch (err) {
      if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
        setLoad({ status: "hidden" });
        return;
      }
      setLoad({ status: "hidden" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (load.status === "loading" || load.status === "hidden") {
    return null;
  }

  const { summary } = load;

  return (
    <section
      className="rounded-lg border border-[var(--lib-border)] px-4 py-4"
      data-testid="curator-support-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-medium text-[var(--lib-fg)]">Your support this month</h2>
        {summary.is_curator ? <CuratorBadge /> : null}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[var(--lib-fg-muted)]">Tips spent</dt>
          <dd
            className="font-medium tabular-nums text-[var(--lib-fg)]"
            data-testid="support-tips-spent"
          >
            {summary.tips_spent}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--lib-fg-muted)]">Artists supported</dt>
          <dd
            className="font-medium tabular-nums text-[var(--lib-fg)]"
            data-testid="support-artists"
          >
            {summary.artists_supported}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--lib-fg-muted)]">Routed to artists</dt>
          <dd
            className="font-medium tabular-nums text-[var(--lib-fg)]"
            data-testid="support-cents"
          >
            {formatCents(summary.cents_routed_to_artists)}
          </dd>
        </div>
      </dl>
      {summary.boosts_coming_copy ? (
        <p
          className="mt-3 text-xs text-[var(--lib-fg-muted)]"
          data-testid="boosts-coming-copy"
        >
          {summary.boosts_coming_copy}
        </p>
      ) : null}
    </section>
  );
}
