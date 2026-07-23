"use client";

import { useMemo, useState } from "react";

type Persona = { id: string; label: string; tier_ids: string[] };

type PreviewResult = {
  allowed: boolean;
  reason: string;
  detail: string;
  reason_label?: string;
};

const FALLBACK_PERSONAS: Persona[] = [
  { id: "public", label: "Public / anonymous", tier_ids: [] },
  { id: "patreon_active", label: "Active Patreon (basic)", tier_ids: ["tier_basic"] },
  { id: "insufficient", label: "Insufficient tier", tier_ids: ["tier_basic"] },
  { id: "expired_manual", label: "Expired manual grant", tier_ids: [] }
];

export function AdminPersonaPreview({
  siteId,
  personas,
  postOptions
}: {
  siteId: string;
  personas: Persona[];
  postOptions: Array<{ post_id: string; title: string; access_level: string }>;
}) {
  const list = personas.length > 0 ? personas : FALLBACK_PERSONAS;
  const [personaId, setPersonaId] = useState(list[0]?.id ?? "public");
  const [postId, setPostId] = useState(postOptions[0]?.post_id ?? "");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => list.find((p) => p.id === personaId) ?? list[0],
    [list, personaId]
  );

  async function runPreview() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "inspect",
          subject_key: selected?.id === "public" ? "" : selected?.id,
          post_id: postId || undefined
        })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        evaluation?: PreviewResult;
        reason_label?: string;
      };
      if (!res.ok || !json.ok || !json.evaluation) {
        setResult({
          allowed: false,
          reason: "error",
          detail: json.error ?? "Preview failed"
        });
        return;
      }
      setResult({
        ...json.evaluation,
        reason_label: json.reason_label
      });
    } catch (err) {
      setResult({
        allowed: false,
        reason: "error",
        detail: err instanceof Error ? err.message : "Preview failed"
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="Access persona preview">
      <h2 className="admin-section-title">Access persona preview</h2>
      <p className="small muted">
        Uses the same evaluator as production paths. Soft personas remain
        local-preview only. Site <span className="mono">{siteId}</span>.
      </p>
      <div className="admin-field-row">
        <label className="admin-field">
          <span className="small muted">Persona</span>
          <select
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
          >
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span className="small muted">Post</span>
          <select value={postId} onChange={(e) => setPostId(e.target.value)}>
            {postOptions.map((p) => (
              <option key={p.post_id} value={p.post_id}>
                {p.title} ({p.access_level})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="admin-link-btn"
          disabled={busy || !postId}
          onClick={() => void runPreview()}
        >
          {busy ? "Evaluating…" : "Inspect access"}
        </button>
      </div>
      {result ? (
        <p className={result.allowed ? "admin-banner" : "admin-banner admin-banner--warn"}>
          {result.allowed ? "Allowed" : "Denied"} —{" "}
          {result.reason_label ?? `${result.reason}: ${result.detail}`}
        </p>
      ) : null}
    </section>
  );
}
