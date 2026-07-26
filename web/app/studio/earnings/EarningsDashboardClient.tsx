"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  RelayApiError,
  fetchCreatorEarnings,
  fetchCreatorPayouts,
  requestCreatorPayout,
  startCreatorPayoutOnboarding,
  type CreatorEarningsWire,
  type CreatorPayoutWire
} from "@/lib/relay-api";

type LoadState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      earnings: CreatorEarningsWire;
      payouts: CreatorPayoutWire[];
    }
  | { status: "error"; message: string };

type ConnectStatus = "not_started" | "pending" | "restricted" | "complete";

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function resolveConnectStatus(e: CreatorEarningsWire): ConnectStatus {
  if (e.payouts_enabled === true) return "complete";
  const raw = (e.onboarding_status ?? "").trim().toLowerCase();
  if (raw === "complete") return "complete";
  if (raw === "restricted") return "restricted";
  if (raw === "pending") return "pending";
  return "not_started";
}

function payoutStatusLabel(status: string): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "in_transit":
      return "In transit";
    case "settled":
      return "Settled";
    case "failed":
      return "Failed";
    default:
      return status.replace(/_/g, " ");
  }
}

function mapPayoutRequestError(err: unknown, remainingCents: number): string {
  if (!(err instanceof RelayApiError)) {
    return err instanceof Error ? err.message : "Could not request payout.";
  }
  const code = err.message.trim();
  if (code === "below_threshold") {
    return `Need ${formatUsd(remainingCents)} more to request a cash payout.`;
  }
  if (code === "payouts_not_enabled") {
    return "Finish payout account setup to request cash.";
  }
  if (code === "balance_not_positive") {
    return "No cash balance available to pay out.";
  }
  return err.message || "Could not request payout. Try again.";
}

export default function EarningsDashboardClient() {
  const searchParams = useSearchParams();
  const connectQuery = searchParams.get("connect");

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [actionBusy, setActionBusy] = useState<"onboard" | "request" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connectNotice, setConnectNotice] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const connectHandledRef = useRef<string | null>(null);

  const refresh = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) {
      setLoad({ status: "loading" });
    }
    setActionError(null);
    try {
      const earnings = await fetchCreatorEarnings();
      let payouts: CreatorPayoutWire[] = [];
      try {
        const list = await fetchCreatorPayouts();
        payouts = list.payouts ?? [];
      } catch (payoutErr) {
        if (
          !(
            payoutErr instanceof RelayApiError &&
            (payoutErr.status === 404 || payoutErr.code === "NOT_FOUND")
          )
        ) {
          setActionError(
            payoutErr instanceof Error
              ? payoutErr.message
              : "Could not load payout history."
          );
        }
      }
      setLoad({ status: "ready", earnings, payouts });
    } catch (err) {
      if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
        setLoad({
          status: "unavailable",
          message: "Artist earnings are not enabled on this environment yet."
        });
        return;
      }
      if (opts?.soft && loadRef.current.status === "ready") {
        setActionError(
          err instanceof Error ? err.message : "Could not refresh earnings."
        );
        return;
      }
      setLoad({
        status: "error",
        message: err instanceof Error ? err.message : "Could not load earnings."
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (connectQuery !== "return" && connectQuery !== "refresh") return;
    if (connectHandledRef.current === connectQuery) return;
    connectHandledRef.current = connectQuery;
    setConnectNotice(
      connectQuery === "refresh"
        ? "Payout setup was interrupted — status below is from Relay, not the URL."
        : "Checking payout account status after Stripe return…"
    );
    void refresh({ soft: true }).then(() => {
      setConnectNotice(
        "Payout account status updated from Relay. The URL is not proof of success."
      );
    });
  }, [connectQuery, refresh]);

  const handleOnboard = useCallback(async () => {
    setActionBusy("onboard");
    setActionError(null);
    try {
      const { onboarding_url } = await startCreatorPayoutOnboarding();
      if (typeof window !== "undefined" && onboarding_url) {
        window.location.assign(onboarding_url);
        return;
      }
      setActionError("Onboarding link missing.");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not start payout setup."
      );
    } finally {
      setActionBusy(null);
    }
  }, []);

  const handleRequestPayout = useCallback(async () => {
    const current = loadRef.current;
    if (current.status !== "ready") return;
    const threshold = current.earnings.payout_threshold_cents ?? 0;
    const remaining = Math.max(0, threshold - current.earnings.available_cents);
    setActionBusy("request");
    setActionError(null);
    try {
      await requestCreatorPayout();
      await refresh({ soft: true });
    } catch (err) {
      setActionError(mapPayoutRequestError(err, remaining));
    } finally {
      setActionBusy(null);
    }
  }, [refresh]);

  if (load.status === "loading") {
    return (
      <p className="text-sm text-[var(--lib-fg-muted)]" data-testid="earnings-loading">
        Loading earnings…
      </p>
    );
  }

  if (load.status === "unavailable" || load.status === "error") {
    return (
      <div className="space-y-3" data-testid="earnings-unavailable">
        <p className="text-sm text-[var(--lib-fg-muted)]">{load.message}</p>
        <button
          type="button"
          className="rounded-md border border-[var(--lib-border)] px-3 py-1.5 text-sm text-[var(--lib-fg)] hover:bg-[var(--lib-sidebar-accent)]"
          onClick={() => void refresh()}
        >
          Retry
        </button>
      </div>
    );
  }

  const e = load.earnings;
  const billCoveredCents = e.bill_credits.reduce(
    (sum, row) => sum + Math.abs(row.amount_cents),
    0
  );
  const threshold = e.payout_threshold_cents ?? 0;
  const remainingCents = Math.max(0, threshold - e.available_cents);
  const progressPct =
    threshold > 0
      ? Math.min(100, Math.round((e.available_cents / threshold) * 100))
      : 0;
  const connectStatus = resolveConnectStatus(e);
  const canRequest =
    e.payouts_enabled === true &&
    e.available_cents > 0 &&
    (threshold <= 0 || e.available_cents >= threshold);
  const showResume =
    connectStatus === "pending" || connectStatus === "restricted";
  const showStart = connectStatus === "not_started";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8" data-testid="earnings-dashboard">
      <header className="space-y-2">
        <p
          className="text-sm text-[var(--lib-fg-muted)]"
          data-testid="earnings-bill-covered"
        >
          Fans covered {formatUsd(billCoveredCents)} of your bill
          {billCoveredCents === 0 ? " this month" : ""}
        </p>
        {connectNotice ? (
          <p
            className="text-xs text-[var(--lib-fg-muted)]"
            role="status"
            data-testid="earnings-connect-return-notice"
          >
            {connectNotice}
          </p>
        ) : null}
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--lib-border)] px-4 py-3">
          <p className="text-xs text-[var(--lib-fg-muted)]">Available</p>
          <p
            className="mt-1 text-xl font-semibold tabular-nums text-[var(--lib-primary)]"
            data-testid="earnings-available"
          >
            {formatUsd(e.available_cents)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--lib-border)] px-4 py-3">
          <p className="text-xs text-[var(--lib-fg-muted)]">Lifetime</p>
          <p
            className="mt-1 text-xl font-semibold tabular-nums text-[var(--lib-primary)]"
            data-testid="earnings-lifetime"
          >
            {formatUsd(e.lifetime_cents)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--lib-border)] px-4 py-3">
          <p className="text-xs text-[var(--lib-fg-muted)]">This month</p>
          <p
            className="mt-1 text-xl font-semibold tabular-nums text-[var(--lib-fg)]"
            data-testid="earnings-this-month"
          >
            {e.this_month.tips} Tips · {formatUsd(e.this_month.earned_cents)}
          </p>
        </div>
      </section>

      <section
        className="rounded-lg border border-[var(--lib-border)] px-4 py-4"
        data-testid="earnings-bill-credit"
      >
        <h2 className="text-sm font-medium text-[var(--lib-fg)]">Bill credit</h2>
        <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">
          Tip earnings apply to your Relay invoice first. No payout account required.
        </p>
        {e.bill_credits.length === 0 ? (
          <p
            className="mt-3 text-xs text-[var(--lib-fg-muted)]"
            data-testid="earnings-bill-credit-empty"
          >
            No bill credits applied yet.
          </p>
        ) : (
          <ul
            className="mt-3 divide-y divide-[var(--lib-border)]"
            data-testid="earnings-bill-credit-list"
          >
            {e.bill_credits.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
              >
                <span className="text-[var(--lib-fg)]">Bill credit</span>
                <span className="tabular-nums text-[var(--lib-fg-muted)]">
                  {formatUsd(Math.abs(row.amount_cents))} ·{" "}
                  {new Date(row.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-[var(--lib-fg)]">Ledger</h2>
        {e.entries.length === 0 ? (
          <p className="text-sm text-[var(--lib-fg-muted)]" data-testid="earnings-ledger-empty">
            No Tip earnings yet. When fans reveal your promo pieces, $0.33 per Tip lands here.
          </p>
        ) : (
          <ul
            className="divide-y divide-[var(--lib-border)] rounded-lg border border-[var(--lib-border)]"
            data-testid="earnings-ledger"
          >
            {e.entries.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm"
                data-testid={`earnings-entry-${row.id}`}
              >
                <span className="text-[var(--lib-fg)]">{row.entry_kind.replace(/_/g, " ")}</span>
                <span className="tabular-nums text-[var(--lib-fg-muted)]">
                  {formatUsd(row.amount_cents)} ·{" "}
                  {new Date(row.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="rounded-lg border border-[var(--lib-border)] px-4 py-4"
        data-testid="earnings-payouts"
      >
        <h2 className="text-sm font-medium text-[var(--lib-fg)]">Cash payouts</h2>
        <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">
          Cash payouts are optional — bill credit needs no setup.
        </p>

        <p
          className="mt-3 text-[10px] font-bold uppercase tracking-wider text-[var(--lib-fg-muted)]"
          data-testid="earnings-connect-status"
        >
          Account:{" "}
          <span className="text-[var(--lib-fg)]">
            {connectStatus === "not_started"
              ? "Not started"
              : connectStatus === "pending"
                ? "Pending"
                : connectStatus === "restricted"
                  ? "Needs attention"
                  : "Ready"}
          </span>
          {e.payouts_enabled ? " · Transfers enabled" : null}
        </p>

        {threshold > 0 ? (
          <div className="mt-3 space-y-2" data-testid="earnings-payout-threshold">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-[var(--lib-fg-muted)]">
              <span>
                Threshold {formatUsd(threshold)} · Available{" "}
                <span className="tabular-nums text-[var(--lib-primary)]">
                  {formatUsd(e.available_cents)}
                </span>
              </span>
              {!canRequest && e.payouts_enabled && remainingCents > 0 ? (
                <span data-testid="earnings-payout-remaining">
                  {formatUsd(remainingCents)} remaining
                </span>
              ) : null}
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-[var(--lib-muted)]/40"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              aria-label="Payout threshold progress"
              data-testid="earnings-payout-progress"
            >
              <div
                className="h-full rounded-full bg-[var(--lib-primary)] transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {showStart ? (
            <button
              type="button"
              data-testid="earnings-connect-onboard"
              disabled={actionBusy !== null}
              title="Optional — set up Stripe Connect for cash payouts"
              className="inline-flex h-7 items-center justify-center rounded-md border border-[var(--lib-primary)]/40 bg-[color-mix(in_oklab,var(--lib-primary)_12%,transparent)] px-3 text-xs font-medium text-[var(--lib-primary)] transition-colors hover:border-[var(--lib-primary)]/60 disabled:cursor-not-allowed disabled:opacity-75"
              onClick={() => void handleOnboard()}
            >
              {actionBusy === "onboard" ? "Starting…" : "Set up cash payouts"}
            </button>
          ) : null}
          {showResume ? (
            <button
              type="button"
              data-testid="earnings-connect-resume"
              disabled={actionBusy !== null}
              title={
                connectStatus === "restricted"
                  ? "Complete required payout account details"
                  : "Resume Stripe Connect onboarding"
              }
              className="inline-flex h-7 items-center justify-center rounded-md border border-[var(--lib-primary)]/40 bg-[color-mix(in_oklab,var(--lib-primary)_12%,transparent)] px-3 text-xs font-medium text-[var(--lib-primary)] transition-colors hover:border-[var(--lib-primary)]/60 disabled:cursor-not-allowed disabled:opacity-75"
              onClick={() => void handleOnboard()}
            >
              {actionBusy === "onboard"
                ? "Opening…"
                : connectStatus === "restricted"
                  ? "Fix payout account"
                  : "Resume payout setup"}
            </button>
          ) : null}
          {e.payouts_enabled === true ? (
            <button
              type="button"
              data-testid="earnings-request-payout"
              disabled={!canRequest || actionBusy !== null}
              title={
                !canRequest
                  ? remainingCents > 0
                    ? `Need ${formatUsd(remainingCents)} more to request a payout`
                    : e.available_cents <= 0
                      ? "No cash balance available to pay out"
                      : "Payout not available"
                  : "Request cash payout of available balance"
              }
              className="inline-flex h-7 items-center justify-center rounded-md bg-[var(--lib-primary)] px-3 text-xs font-medium text-[var(--lib-primary-fg)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-75"
              onClick={() => void handleRequestPayout()}
            >
              {actionBusy === "request" ? "Requesting…" : "Request payout"}
            </button>
          ) : null}
        </div>

        {actionError ? (
          <p
            role="alert"
            className="mt-3 text-sm text-red-400"
            data-testid="earnings-payout-error"
          >
            {actionError}
          </p>
        ) : null}
      </section>

      <section data-testid="earnings-payout-history">
        <h2 className="mb-3 text-sm font-medium text-[var(--lib-fg)]">Payout history</h2>
        {load.payouts.length === 0 ? (
          <div
            className="rounded-xl border border-dashed border-[#2a2a2a] bg-[#0a0a0a] px-4 py-6 text-center"
            data-testid="earnings-payout-history-empty"
          >
            <p className="text-[13px] font-medium text-white">No cash payouts yet</p>
            <p className="mt-1 text-[11px] text-[#555]">
              Requests appear here after you cash out above the threshold. Bill credits stay in the
              panel above.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--lib-border)] rounded-lg border border-[var(--lib-border)]">
            {load.payouts.map((row) => (
              <li
                key={row.payout_id}
                className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between"
                data-testid={`earnings-payout-${row.payout_id}`}
                data-status={row.status}
              >
                <span className="text-[var(--lib-fg)]">
                  {payoutStatusLabel(row.status)}
                  <span className="ml-2 tabular-nums text-[var(--lib-primary)]">
                    {formatUsd(row.amount_cents)}
                  </span>
                </span>
                <span className="text-xs text-[var(--lib-fg-muted)]">
                  {new Date(row.requested_at).toLocaleDateString()}
                  {row.settled_at
                    ? ` · Settled ${new Date(row.settled_at).toLocaleDateString()}`
                    : null}
                </span>
                {row.status === "failed" && row.failure_reason ? (
                  <p className="w-full text-xs text-red-400" role="alert">
                    {row.failure_reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
