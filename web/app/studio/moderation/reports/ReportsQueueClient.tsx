"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Filter,
  Flag,
  Loader2,
  RefreshCw,
  X
} from "lucide-react";
import {
  fetchPatronSessionMe,
  listContentReports,
  resolveContentReport,
  type ContentReportRecord,
  type ContentReportStatus
} from "@/lib/relay-api";

/**
 * PE-E (BO-P2-04) — moderation queue client.
 *
 * State machine:
 *   - loading-session  : fetching /api/v1/me/session to discover the caller's primary creator scope
 *   - no-scope         : caller has no primaryRelayCreatorId (not a creator)
 *   - loading-reports  : page-level fetch in flight
 *   - ready            : list rendered (may be empty)
 *   - error            : surface the message and offer retry
 */

const STATUSES: ContentReportStatus[] = ["open", "actioned", "dismissed"];

export function ReportsQueueClient(): React.ReactElement {
  const [phase, setPhase] = useState<
    "loading-session" | "no-scope" | "loading-reports" | "ready" | "error"
  >("loading-session");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creatorScope, setCreatorScope] = useState<string | null>(null);
  const [status, setStatus] = useState<ContentReportStatus>("open");
  const [items, setItems] = useState<ContentReportRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Resolve the caller's primary creator scope from /me/session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchPatronSessionMe();
        if (cancelled) return;
        // Best-effort: any caller whose session is bound to a creator workspace can use the
        // queue. We rely on the API to enforce ownership per request -- this is a UX hint, not
        // a security gate.
        const scope = (me as { creator_id?: string }).creator_id;
        if (!scope || scope === "__relay_platform") {
          setPhase("no-scope");
          return;
        }
        setCreatorScope(scope);
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPage = useCallback(
    async (replace: boolean) => {
      if (!creatorScope) return;
      setPhase("loading-reports");
      try {
        const result = await listContentReports({
          relayCreatorId: creatorScope,
          status,
          cursor: replace ? undefined : nextCursor
        });
        setItems((prev) => (replace ? result.items : [...prev, ...result.items]));
        setNextCursor(result.nextCursor);
        setPhase("ready");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [creatorScope, status, nextCursor]
  );

  // Initial + status-change refetch.
  useEffect(() => {
    if (!creatorScope) return;
    void loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorScope, status]);

  const handleResolve = useCallback(
    async (reportId: string, outcome: "actioned" | "dismissed") => {
      setResolvingId(reportId);
      try {
        await resolveContentReport(reportId, outcome);
        // Drop the row optimistically -- it now sits in a different status bucket.
        setItems((prev) => prev.filter((r) => r.id !== reportId));
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setResolvingId(null);
      }
    },
    []
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0]">
      <header className="border-b border-[#1F1F1F] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Flag size={18} className="text-[#a04040]" aria-hidden />
          <h1 className="text-base font-semibold">Moderation queue</h1>
          <span className="text-xs text-[#666]">PE-E · skeletal</span>
          <button
            onClick={() => void loadPage(true)}
            disabled={phase === "loading-reports" || !creatorScope}
            aria-label="Refresh queue"
            className="ml-auto inline-flex items-center gap-1.5 rounded border border-[#2A2A2A] px-2 py-1 text-xs text-[#888] hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={11} className={phase === "loading-reports" ? "animate-spin" : ""} aria-hidden />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {phase === "loading-session" ? (
          <PhaseBox icon={<Loader2 size={14} className="animate-spin" />} message="Loading session…" />
        ) : null}

        {phase === "no-scope" ? (
          <PhaseBox
            icon={<AlertTriangle size={14} className="text-[#d39e6a]" />}
            message="Your session is not bound to a creator workspace. Sign in with the studio account that owns this scope."
          />
        ) : null}

        {phase === "error" ? (
          <PhaseBox
            icon={<AlertTriangle size={14} className="text-[#d36a6a]" />}
            message={errorMessage ?? "Failed to load reports."}
            actionLabel="Retry"
            onAction={() => {
              setErrorMessage(null);
              if (creatorScope) void loadPage(true);
            }}
          />
        ) : null}

        {creatorScope && phase !== "no-scope" && phase !== "error" ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Filter size={11} className="text-[#666]" aria-hidden />
              <span className="text-[10px] uppercase tracking-wide text-[#666]">Status</span>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setNextCursor(undefined);
                    setStatus(s);
                  }}
                  aria-pressed={s === status}
                  className={[
                    "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
                    s === status
                      ? "border-[#2D6A4F] bg-[#1B4332] text-[#9bf0c4]"
                      : "border-[#2A2A2A] text-[#888] hover:border-[#3A3A3A] hover:text-white"
                  ].join(" ")}
                >
                  {s}
                </button>
              ))}
            </div>

            {phase === "loading-reports" && items.length === 0 ? (
              <PhaseBox icon={<Loader2 size={14} className="animate-spin" />} message="Loading reports…" />
            ) : null}

            {phase === "ready" && items.length === 0 ? (
              <PhaseBox
                icon={<Check size={14} className="text-[#40916C]" />}
                message={`No ${status} reports right now.`}
              />
            ) : null}

            <ul className="space-y-2">
              {items.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  busy={resolvingId === report.id}
                  resolvable={status === "open"}
                  onResolve={(outcome) => void handleResolve(report.id, outcome)}
                />
              ))}
            </ul>

            {nextCursor ? (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => void loadPage(false)}
                  disabled={phase === "loading-reports"}
                  className="rounded border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#888] hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
                >
                  Load more
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

function PhaseBox({
  icon,
  message,
  actionLabel,
  onAction
}: {
  icon: React.ReactNode;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-[#2A2A2A] bg-[#141414] p-3 text-xs text-[#888]">
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{message}</span>
      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          className="rounded border border-[#2A2A2A] px-2 py-0.5 text-[11px] text-white hover:border-[#3A3A3A]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ReportRow({
  report,
  busy,
  resolvable,
  onResolve
}: {
  report: ContentReportRecord;
  busy: boolean;
  resolvable: boolean;
  onResolve: (outcome: "actioned" | "dismissed") => void;
}) {
  return (
    <li className="rounded-md border border-[#1F1F1F] bg-[#141414] p-3">
      <div className="flex items-start gap-2">
        <Flag size={11} className="mt-0.5 shrink-0 text-[#a04040]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full border border-[#2A2A2A] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[#888]"
              title="Target kind"
            >
              {report.targetKind}
            </span>
            <code className="truncate text-[10px] text-[#888]" title={report.targetId}>
              {report.targetId}
            </code>
            <span className="ml-auto text-[10px] text-[#555]">{humanise(report.createdAt)}</span>
          </div>
          <div className="mt-1 text-[12px] text-[#E0E0E0]">
            <span className="font-medium">{report.reasonCode}</span>
            {report.body ? <span className="text-[#bbb]"> — {report.body}</span> : null}
          </div>
          <div className="mt-1 text-[10px] text-[#555]">
            Reporter: <code className="text-[#888]">{report.reporterAccountId}</code>
          </div>
        </div>
        {resolvable ? (
          <div className="flex shrink-0 flex-col gap-1">
            <button
              onClick={() => onResolve("actioned")}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-[#2D6A4F] bg-[#1B4332] px-2 py-1 text-[10px] text-[#9bf0c4] hover:bg-[#244f3a] disabled:opacity-50"
            >
              <Check size={10} aria-hidden />
              Action
            </button>
            <button
              onClick={() => onResolve("dismissed")}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-[#2A2A2A] px-2 py-1 text-[10px] text-[#888] hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
            >
              <X size={10} aria-hidden />
              Dismiss
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function humanise(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
