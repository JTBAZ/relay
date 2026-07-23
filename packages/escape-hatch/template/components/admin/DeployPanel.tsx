"use client";

import { useEffect, useState } from "react";

type DeployRecord = {
  deployment_id: string;
  status: string;
  preview_url: string;
  production_url: string | null;
  domain: string | null;
};

type Readiness = {
  ok: boolean;
  detail: string;
  active_deployment_id: string | null;
  previous_stable_deployment_id: string | null;
  callbacks: {
    ok: boolean;
    detail: string;
    domain_mode: string;
    slots: Array<{
      id: string;
      label: string;
      path: string;
      absolute_url: string | null;
      required: boolean;
    }>;
  };
};

export function DeployPanel({ siteId }: { siteId: string }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [deployments, setDeployments] = useState<DeployRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastPreviewId, setLastPreviewId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/deploy", { method: "GET" });
    const json = (await res.json()) as {
      ok?: boolean;
      readiness?: Readiness;
      state?: { deployments?: DeployRecord[] };
      error?: string;
    };
    if (res.ok && json.ok !== false) {
      setReadiness(json.readiness ?? null);
      setDeployments(json.state?.deployments ?? []);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function run(action: "preview" | "promote" | "rollback", deploymentId?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const body: Record<string, string> = { action };
      if (deploymentId) body.deployment_id = deploymentId;
      const res = await fetch("/api/admin/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        record?: DeployRecord;
      };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? "Action failed");
      } else {
        if (action === "preview" && json.record) {
          setLastPreviewId(json.record.deployment_id);
          setMessage(
            `Preview created (fixture): ${json.record.preview_url}`
          );
        } else if (action === "promote") {
          setMessage("Promoted to live pointer (fixture rehearsal).");
        } else {
          setMessage("Rolled back to prior stable when available (fixture).");
        }
      }
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="Vercel deploy rehearsal">
      <h2 className="admin-section-title">Vercel golden path (EH-070)</h2>
      <p className="small muted">
        Fixture preview → promote → rollback for site{" "}
        <span className="mono">{siteId}</span>. This does{" "}
        <strong>not</strong> call the live Vercel API. productionSafe remains
        false. Docker Path B is EH-071.
      </p>
      {message ? <p className="admin-attention-note">{message}</p> : null}
      {readiness ? (
        <p className="small">
          Status: {readiness.ok ? "rehearsal live pointer" : "manifest only"} —{" "}
          {readiness.detail}
        </p>
      ) : null}

      <div className="admin-form-stack">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("preview")}
        >
          Create preview
        </button>
        <button
          type="button"
          disabled={busy || !lastPreviewId}
          onClick={() =>
            lastPreviewId ? void run("promote", lastPreviewId) : undefined
          }
        >
          Promote last preview
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("rollback")}
        >
          Rollback
        </button>
      </div>

      <h3 className="admin-section-title">Callback checklist</h3>
      {readiness?.callbacks ? (
        <>
          <p className="small muted">
            {readiness.callbacks.detail} · mode{" "}
            <code>{readiness.callbacks.domain_mode}</code>
          </p>
          <ul className="admin-list">
            {readiness.callbacks.slots.map((s) => (
              <li key={s.id}>
                {s.label}
                {s.required ? " *" : ""} —{" "}
                {s.absolute_url ? (
                  <code className="mono">{s.absolute_url}</code>
                ) : (
                  <span className="muted">{s.path} (no absolute URL)</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="small muted">Loading checklist…</p>
      )}

      <h3 className="admin-section-title">Recent deployments</h3>
      {deployments.length === 0 ? (
        <p className="small muted">No fixture deployments yet.</p>
      ) : (
        <ul className="admin-list">
          {deployments.map((d) => (
            <li key={d.deployment_id}>
              <span className="mono">{d.deployment_id}</span> · {d.status} ·{" "}
              {d.production_url ?? d.preview_url}
              {d.status === "preview" ? (
                <button
                  type="button"
                  className="admin-inline-btn"
                  disabled={busy}
                  onClick={() => void run("promote", d.deployment_id)}
                >
                  Promote
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
