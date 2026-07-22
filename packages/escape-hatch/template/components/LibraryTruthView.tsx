"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import type {
  ContinueGateResult,
  LibraryAnomaly,
  LibraryParityReport,
  LibraryTruthState
} from "@/lib/library-truth";

type Props = {
  report: LibraryParityReport;
  state: LibraryTruthState;
  gate: ContinueGateResult;
};

function CountTile({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string | number;
  tone?: "default" | "ok" | "warn" | "bad";
}) {
  return (
    <div className={`lt-tile lt-tile--${tone}`}>
      <span className="lt-tile-value">{value}</span>
      <span className="lt-tile-label">{label}</span>
    </div>
  );
}

export function LibraryTruthView({ report: initialReport, state, gate: initialGate }: Props) {
  const [report, setReport] = useState(initialReport);
  const [exclusions, setExclusions] = useState(state.exclusions);
  const [gate, setGate] = useState(initialGate);
  const [complete, setComplete] = useState(state.library_truth_complete);
  const [activeBucket, setActiveBucket] = useState(
    report.access_buckets[0]?.id ?? "public"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const applyServerResult = (payload: {
    state: LibraryTruthState;
    gate: ContinueGateResult;
    report?: LibraryParityReport;
  }) => {
    setExclusions(payload.state.exclusions);
    setGate(payload.gate);
    setComplete(payload.state.library_truth_complete);
    if (payload.report) {
      setReport(payload.report);
    }
  };

  const excludeAnomaly = async (anomaly: LibraryAnomaly) => {
    setBusyId(anomaly.id);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/library-truth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-escape-hatch-local": "1"
        },
        body: JSON.stringify({
          action: "exclude",
          anomaly_id: anomaly.id,
          reason: "Creator excluded from this build."
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        state?: LibraryTruthState;
        gate?: ContinueGateResult;
        report?: LibraryParityReport;
      };
      if (!res.ok || !data.ok || !data.state || !data.gate) {
        setError(data.error ?? "Could not exclude this item.");
        return;
      }
      startTransition(() => {
        applyServerResult({
          state: data.state!,
          gate: data.gate!,
          report: data.report
        });
        setStatusMsg(`Excluded “${anomaly.id}” from this build.`);
      });
    } catch {
      setError("Network error while excluding. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const markComplete = async () => {
    setBusyId("complete");
    setError(null);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/library-truth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-escape-hatch-local": "1"
        },
        body: JSON.stringify({ action: "complete" })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        state?: LibraryTruthState;
        gate?: ContinueGateResult;
        report?: LibraryParityReport;
      };
      if (!res.ok || !data.ok || !data.state || !data.gate) {
        setError(
          data.error ??
            "Library truth is not complete yet. Resolve or exclude blocking issues."
        );
        return;
      }
      startTransition(() => {
        applyServerResult({
          state: data.state!,
          gate: data.gate!,
          report: data.report
        });
        setStatusMsg("Library truth marked complete for this prototype kit.");
      });
    } catch {
      setError("Network error while saving. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const bucket =
    report.access_buckets.find((b) => b.id === activeBucket) ??
    report.access_buckets[0];
  const simulation = report.access_simulations.find(
    (s) => s.bucket_id === activeBucket
  );

  const blocking = report.anomalies.filter((a) => a.blocking);
  const other = report.anomalies.filter((a) => !a.blocking);

  return (
    <main className="console-page shell lt-page">
      <header className="console-hero">
        <p className="eyebrow">Step 1 · Library truth</p>
        <h1>Library truth</h1>
        <p className="lede">
          Audit what Relay imported for{" "}
          <strong>{report.identity.display_name}</strong> (@
          {report.identity.handle}). Every post and media item must be imported,
          excluded with a reason, or failed with a reason — nothing silent.
        </p>
        <p className="meta muted">
          Prototype audit only · production_safe: false · not private media
          delivery · exclude/complete are local-operator only (not auth)
        </p>
      </header>

      <section className="lt-banner" aria-live="polite">
        {gate.can_continue ? (
          <p>
            {complete
              ? "Library truth is complete for this kit. You can continue to Structure."
              : "No blocking issues remain. Mark library truth complete when you are ready."}
          </p>
        ) : (
          <p>
            Continue is blocked.{" "}
            {gate.reasons.join(" ")}
          </p>
        )}
      </section>

      {error ? (
        <p className="lt-error" role="alert">
          {error}
        </p>
      ) : null}
      {statusMsg ? (
        <p className="lt-status" role="status">
          {statusMsg}
        </p>
      ) : null}

      <section className="lt-section" aria-labelledby="lt-summary-heading">
        <h2 id="lt-summary-heading">Summary</h2>
        <div className="lt-tiles">
          <CountTile
            label="Posts accounted"
            value={`${report.posts.imported + report.posts.excluded + report.posts.failed}/${report.posts.expected}`}
            tone={report.posts.fully_accounted ? "ok" : "bad"}
          />
          <CountTile
            label="Media accounted"
            value={`${report.media.imported + report.media.excluded + report.media.failed}/${report.media.expected}`}
            tone={report.media.fully_accounted ? "ok" : "bad"}
          />
          <CountTile
            label="Tiers mapped"
            value={`${report.tiers.mapped}/${report.tiers.expected}`}
            tone={report.tiers.unmapped > 0 ? "warn" : "default"}
          />
          <CountTile
            label="Attachments"
            value={report.attachments.expected}
          />
          <CountTile
            label="Failed exports"
            value={report.media.missing + report.media.failed}
            tone={report.media.failed + report.media.missing > 0 ? "warn" : "default"}
          />
          <CountTile
            label="Conflicts"
            value={report.conflicts.length}
            tone={report.conflicts.length > 0 ? "warn" : "default"}
          />
        </div>
        <ul className="lt-notes">
          {report.creator_notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <details className="lt-artifacts">
          <summary>Artifact presence</summary>
          <ul>
            {Object.entries(report.artifacts).map(([k, v]) => (
              <li key={k}>
                <span className={v ? "lt-ok" : "lt-missing"}>{v ? "present" : "missing"}</span>{" "}
                {k.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="lt-section" aria-labelledby="lt-access-heading">
        <h2 id="lt-access-heading">Access inspect</h2>
        <p className="lt-help">
          Exact tier means only that tier. Tier or higher also includes tiers
          priced above it. Simulation below is a soft client preview — not live
          patron entitlements.
        </p>
        <div className="lt-bucket-tabs" role="tablist" aria-label="Access buckets">
          {report.access_buckets.map((b) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={b.id === activeBucket}
              className={`lt-bucket-tab ${b.id === activeBucket ? "is-active" : ""}`}
              onClick={() => setActiveBucket(b.id)}
            >
              {b.title}
              <span className="lt-bucket-count">{b.post_count}</span>
            </button>
          ))}
        </div>
        {bucket ? (
          <div className="lt-bucket-panel" role="tabpanel">
            <p className="lt-help">{bucket.blurb}</p>
            <p>
              <strong>{bucket.post_count}</strong> posts ·{" "}
              <strong>{bucket.media_count}</strong> media refs
            </p>
            {bucket.post_ids.length > 0 ? (
              <ul className="lt-id-list">
                {bucket.post_ids.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No posts in this bucket.</p>
            )}
            {simulation ? (
              <p className="lt-sim">
                Soft simulation for <strong>{simulation.bucket_title}</strong>:{" "}
                {simulation.visible_count} visible, {simulation.locked_count}{" "}
                locked (non-authoritative).
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="lt-section" aria-labelledby="lt-anomalies-heading">
        <h2 id="lt-anomalies-heading">Anomalies</h2>
        {blocking.length === 0 && other.length === 0 ? (
          <p>No anomalies recorded for this kit.</p>
        ) : null}

        {blocking.length > 0 ? (
          <div className="lt-anomaly-group">
            <h3>Blocking</h3>
            <ul className="lt-anomaly-list">
              {blocking.map((a) => {
                const excluded = Boolean(exclusions[a.id]);
                return (
                  <li
                    key={a.id}
                    className={`lt-anomaly ${excluded ? "is-excluded" : "is-blocking"}`}
                  >
                    <div className="lt-anomaly-head">
                      <span className="lt-anomaly-kind">{a.kind}</span>
                      {excluded ? (
                        <span className="lt-pill">Excluded</span>
                      ) : (
                        <span className="lt-pill lt-pill--block">Blocks continue</span>
                      )}
                    </div>
                    <p>
                      <strong>What was seen:</strong> {a.what_was_seen}
                    </p>
                    <p>
                      <strong>Likely effect:</strong> {a.likely_effect}
                    </p>
                    <p>
                      <strong>Recommended:</strong> {a.recommended_resolution}
                    </p>
                    {!excluded ? (
                      <button
                        type="button"
                        className="lt-exclude-btn"
                        disabled={busyId === a.id}
                        onClick={() => void excludeAnomaly(a)}
                      >
                        {busyId === a.id
                          ? "Excluding…"
                          : "Exclude from this build"}
                      </button>
                    ) : (
                      <p className="muted">
                        Excluded: {exclusions[a.id]?.reason}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {other.length > 0 ? (
          <div className="lt-anomaly-group">
            <h3>Review</h3>
            <ul className="lt-anomaly-list">
              {other.map((a) => {
                const excluded = Boolean(exclusions[a.id]);
                return (
                  <li
                    key={a.id}
                    className={`lt-anomaly ${excluded ? "is-excluded" : ""}`}
                  >
                    <div className="lt-anomaly-head">
                      <span className="lt-anomaly-kind">{a.kind}</span>
                    </div>
                    <p>
                      <strong>What was seen:</strong> {a.what_was_seen}
                    </p>
                    <p>
                      <strong>Likely effect:</strong> {a.likely_effect}
                    </p>
                    <p>
                      <strong>Recommended:</strong> {a.recommended_resolution}
                    </p>
                    {!excluded ? (
                      <button
                        type="button"
                        className="lt-exclude-btn lt-exclude-btn--ghost"
                        disabled={busyId === a.id}
                        onClick={() => void excludeAnomaly(a)}
                      >
                        {busyId === a.id
                          ? "Excluding…"
                          : "Exclude from this build"}
                      </button>
                    ) : (
                      <p className="muted">Excluded from this build.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="console-cta-row lt-cta">
        <button
          type="button"
          className="btn-primary lt-primary-btn"
          disabled={!gate.can_continue || busyId === "complete" || complete}
          onClick={() => void markComplete()}
          aria-disabled={!gate.can_continue || complete}
        >
          {complete
            ? "Library truth complete"
            : busyId === "complete"
              ? "Saving…"
              : "Library truth complete"}
        </button>
        <Link
          href="/structure"
          className={`btn-ghost ${gate.can_continue && complete ? "" : "lt-secondary"}`}
        >
          Continue to Structure
        </Link>
        {!gate.can_continue ? (
          <p className="lt-gate-help" id="lt-gate-help">
            Structure stays reachable for exploration, but library truth is not
            complete while blockers remain.
          </p>
        ) : null}
      </section>
    </main>
  );
}

export function LibraryTruthEmpty({ message }: { message: string }) {
  return (
    <main className="console-page shell lt-page">
      <header className="console-hero">
        <p className="eyebrow">Step 1 · Library truth</p>
        <h1>Library truth</h1>
        <p className="lede">{message}</p>
      </header>
      <section className="lt-banner lt-banner--warn">
        <p>
          Generate a parity report from the Escape Hatch package, then refresh
          this page:
        </p>
        <pre className="lt-code">
          npm run library-truth --prefix packages/escape-hatch -- &lt;kit-slug&gt;
        </pre>
      </section>
      <section className="console-cta-row">
        <Link href="/structure" className="btn-ghost">
          Open Structure anyway
        </Link>
      </section>
    </main>
  );
}
