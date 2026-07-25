"use client";

import { adminLocalFetch } from "./adminLocalFetch";
import { useEffect, useState } from "react";

type DeployRecord = {
  deployment_id: string;
  provider?: string;
  status: string;
  preview_url: string;
  production_url: string | null;
  domain: string | null;
  notes?: string | null;
};

type Readiness = {
  ok: boolean;
  detail: string;
  path?: string;
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

type PathB = {
  ok: boolean;
  detail: string;
  items: Array<{
    id: string;
    title: string;
    path: string;
    present: boolean;
    required: boolean;
  }>;
  host_candidate: {
    title: string;
    status: string;
    wizard_supported: boolean;
    notes: string;
  };
};

export function DeployPanel({ siteId }: { siteId: string }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [pathB, setPathB] = useState<PathB | null>(null);
  const [deployments, setDeployments] = useState<DeployRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastVercelId, setLastVercelId] = useState<string | null>(null);
  const [lastDockerId, setLastDockerId] = useState<string | null>(null);

  async function refresh() {
    const res = await adminLocalFetch("/api/admin/deploy", { method: "GET" });
    const json = (await res.json()) as {
      ok?: boolean;
      readiness?: Readiness;
      path_b?: PathB;
      state?: { deployments?: DeployRecord[] };
      error?: string;
    };
    if (res.ok && json.ok !== false) {
      setReadiness(json.readiness ?? null);
      setPathB(json.path_b ?? null);
      setDeployments(json.state?.deployments ?? []);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function run(
    action: "preview" | "promote" | "rollback",
    path: "vercel" | "docker",
    deploymentId?: string
  ) {
    setBusy(true);
    setMessage(null);
    try {
      const body: Record<string, string> = { action, path };
      if (deploymentId) body.deployment_id = deploymentId;
      const res = await adminLocalFetch("/api/admin/deploy", {
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
          if (path === "docker") setLastDockerId(json.record.deployment_id);
          else setLastVercelId(json.record.deployment_id);
          setMessage(
            `${path} preview (fixture): ${json.record.preview_url}`
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
    <section className="admin-panel" aria-label="Deploy rehearsals">
      <p className="small muted">
        Site <span className="mono">{siteId}</span>. Fixture rehearsals only —
        no live Vercel API or Docker daemon. productionSafe remains false.
      </p>
      {message ? (
        <p
          className="admin-attention-note"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {message}
        </p>
      ) : null}
      {readiness ? (
        <p className="small">
          Status: {readiness.ok ? readiness.path ?? "live" : "manifest only"} —{" "}
          {readiness.detail}
        </p>
      ) : null}

      <h2 className="admin-section-title">Vercel golden path (EH-070)</h2>
      <div className="admin-form-stack">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("preview", "vercel")}
        >
          Create Vercel preview
        </button>
        <button
          type="button"
          disabled={busy || !lastVercelId}
          onClick={() =>
            lastVercelId
              ? void run("promote", "vercel", lastVercelId)
              : undefined
          }
        >
          Promote last Vercel preview
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("rollback", "vercel")}
        >
          Rollback
        </button>
      </div>

      <h2 className="admin-section-title">Docker Path B (EH-071)</h2>
      <p className="small muted">
        Fixture image-build → compose-up → promote. Recipe files under{" "}
        <code>deploy/docker/</code>. MojoHost is a policy candidate only — not
        wizard-supported.
      </p>
      {pathB ? (
        <>
          <p className="small">
            Recipe: {pathB.ok ? "complete" : "incomplete"} — {pathB.detail}
          </p>
          <ul className="admin-list">
            {pathB.items.map((i) => (
              <li key={i.id}>
                {i.present ? "✓" : "✗"} {i.title}{" "}
                <code className="mono">{i.path}</code>
              </li>
            ))}
          </ul>
          <p className="small muted">
            Host candidate: {pathB.host_candidate.title} (
            {pathB.host_candidate.status}, wizard_supported=
            {String(pathB.host_candidate.wizard_supported)}) —{" "}
            {pathB.host_candidate.notes}
          </p>
        </>
      ) : null}
      <div className="admin-form-stack">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("preview", "docker")}
        >
          Create Docker preview
        </button>
        <button
          type="button"
          disabled={busy || !lastDockerId}
          onClick={() =>
            lastDockerId
              ? void run("promote", "docker", lastDockerId)
              : undefined
          }
        >
          Promote last Docker preview
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
              <span className="mono">{d.deployment_id}</span> ·{" "}
              {d.provider ?? "vercel"} · {d.status} ·{" "}
              {d.production_url ?? d.preview_url}
              {d.status === "preview" ? (
                <button
                  type="button"
                  className="admin-inline-btn"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      "promote",
                      d.provider === "docker" ? "docker" : "vercel",
                      d.deployment_id
                    )
                  }
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
