"use client";

import { useCallback, useEffect, useState } from "react";

type LaunchStep = {
  id: string;
  title: string;
  detail: string;
  blocking: boolean;
  recovery: string;
  status: "pending" | "verified" | "blocked";
  auto_ok: boolean | null;
};

type LaunchReadiness = {
  ok: boolean;
  can_complete: boolean;
  detail: string;
  path: "vercel" | "docker" | null;
  steps: LaunchStep[];
  blockers: string[];
  advisories: string[];
  wizard: {
    diagnostics_acknowledged: boolean;
    launch_completed_at: string | null;
    stuck_note: string | null;
  };
};

export function DeployLaunchWizard({ siteId }: { siteId: string }) {
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stuckDraft, setStuckDraft] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/deploy?wizard=1", { method: "GET" });
    const json = (await res.json()) as {
      ok?: boolean;
      launch?: LaunchReadiness;
      error?: string;
    };
    if (res.ok && json.launch) {
      setReadiness(json.launch);
      setStuckDraft(json.launch.wizard.stuck_note ?? "");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, siteId]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        launch?: LaunchReadiness;
      };
      if (json.launch) setReadiness(json.launch);
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? "Request failed");
      } else {
        setMessage("Updated (preview only — not productionSafe).");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="launch-wizard-title">
      <h2 id="launch-wizard-title" className="admin-section-title">
        Launch wizard (EH-074)
      </h2>
      <p className="small muted">
        Guided Path A/B checklist with backup-before-complete. Fixture only —
        not live Vercel/Docker. MojoHost is not wizard-supported.
      </p>

      {readiness ? (
        <>
          <p
            className={`admin-banner ${readiness.can_complete || readiness.wizard.launch_completed_at ? "admin-banner--ok" : "admin-banner--degraded"}`}
          >
            <strong>
              {readiness.wizard.launch_completed_at
                ? "Launch marked complete (preview)"
                : readiness.can_complete
                  ? "Ready to complete"
                  : "Launch blocked"}
            </strong>{" "}
            — {readiness.detail}
          </p>

          <div className="admin-form-stack">
            <p className="small">
              Path:{" "}
              <strong>
                {readiness.path === "vercel"
                  ? "A — Vercel"
                  : readiness.path === "docker"
                    ? "B — Docker"
                    : "not chosen"}
              </strong>
            </p>
            <div className="admin-inline-actions">
              <button
                type="button"
                disabled={busy || Boolean(readiness.wizard.launch_completed_at)}
                onClick={() =>
                  void post({ action: "wizard_select_path", path: "vercel" })
                }
              >
                Choose Path A (Vercel)
              </button>
              <button
                type="button"
                disabled={busy || Boolean(readiness.wizard.launch_completed_at)}
                onClick={() =>
                  void post({ action: "wizard_select_path", path: "docker" })
                }
              >
                Choose Path B (Docker)
              </button>
            </div>
          </div>

          <ol className="admin-list">
            {readiness.steps.map((step) => (
              <li key={step.id} className="admin-health-row">
                <div className="admin-health-head">
                  <span>
                    {step.title}
                    {step.blocking ? " *" : ""}
                  </span>
                  <span className="admin-health-badge">{step.status}</span>
                </div>
                <p className="admin-health-detail">{step.detail}</p>
                <p className="admin-attention-note">
                  <strong>If stuck:</strong> {step.recovery}
                </p>
                {step.id !== "launch_complete" &&
                step.id !== "choose_path" &&
                !readiness.wizard.launch_completed_at ? (
                  <button
                    type="button"
                    className="admin-inline-btn"
                    disabled={busy || step.status === "verified"}
                    onClick={() =>
                      void post({
                        action: "wizard_mark_step",
                        step_id: step.id,
                        status: "verified"
                      })
                    }
                  >
                    Mark verified
                  </button>
                ) : null}
              </li>
            ))}
          </ol>

          {readiness.blockers.length > 0 ? (
            <p className="small">
              Blockers: {readiness.blockers.join("; ")}
            </p>
          ) : null}
          {readiness.advisories.length > 0 ? (
            <p className="small muted">
              Advisories: {readiness.advisories.join("; ")}
            </p>
          ) : null}

          <div className="admin-form-stack">
            <label className="small">
              I am stuck (recovery note)
              <textarea
                value={stuckDraft}
                onChange={(e) => setStuckDraft(e.target.value)}
                rows={2}
                disabled={busy}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void post({
                  action: "wizard_stuck",
                  note: stuckDraft || null
                })
              }
            >
              Save stuck note
            </button>
            <button
              type="button"
              disabled={busy || readiness.wizard.diagnostics_acknowledged}
              onClick={() => void post({ action: "wizard_ack_diagnostics" })}
            >
              {readiness.wizard.diagnostics_acknowledged
                ? "Diagnostics acknowledged"
                : "Acknowledge diagnostic download"}
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !readiness.can_complete ||
                Boolean(readiness.wizard.launch_completed_at)
              }
              onClick={() => void post({ action: "wizard_complete" })}
            >
              Complete launch
            </button>
          </div>
        </>
      ) : (
        <p className="small muted">Loading launch wizard…</p>
      )}

      {message ? <p className="small">{message}</p> : null}
      <p className="small muted">Site: {siteId}</p>
    </section>
  );
}
