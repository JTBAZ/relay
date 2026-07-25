"use client";

import { adminLocalFetch } from "./adminLocalFetch";
import { useState } from "react";

type GrantRow = {
  grant_id: string;
  subject_key: string;
  tier_ids: string[];
  reason: string;
  actor: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export function AdminPatronsPanel({
  siteId,
  tierIds,
  initialGrants
}: {
  siteId: string;
  tierIds: string[];
  initialGrants: GrantRow[];
}) {
  const [grants, setGrants] = useState(initialGrants);
  const [subject, setSubject] = useState("");
  const [tierId, setTierId] = useState(tierIds[0] ?? "");
  const [reason, setReason] = useState("Complimentary access");
  const [expiresAt, setExpiresAt] = useState("");
  const [inspectSubject, setInspectSubject] = useState("");
  const [inspectOut, setInspectOut] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addGrant() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminLocalFetch("/api/admin/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject_key: subject,
          tier_ids: tierId ? [tierId] : [],
          reason,
          actor: "local-operator",
          expires_at: expiresAt.trim() ? expiresAt.trim() : null
        })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        grant?: GrantRow;
      };
      if (!res.ok || !json.ok || !json.grant) {
        setMessage(json.error ?? "Grant failed");
        return;
      }
      setGrants((prev) => [json.grant!, ...prev]);
      setMessage(`Grant ${json.grant.grant_id} saved.`);
      setSubject("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Grant failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(grantId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminLocalFetch(
        `/api/admin/grants?grant_id=${encodeURIComponent(grantId)}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        grant?: GrantRow;
      };
      if (!res.ok || !json.ok || !json.grant) {
        setMessage(json.error ?? "Revoke failed");
        return;
      }
      setGrants((prev) =>
        prev.map((g) => (g.grant_id === grantId ? json.grant! : g))
      );
      setMessage(`Revoked ${grantId}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  async function inspect() {
    setBusy(true);
    setInspectOut(null);
    try {
      const res = await adminLocalFetch("/api/admin/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "inspect",
          subject_key: inspectSubject
        })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        reason_label?: string;
        evaluation?: { allowed: boolean };
      };
      if (!res.ok || !json.ok) {
        setInspectOut(json.error ?? "Inspect failed");
        return;
      }
      setInspectOut(
        `${json.evaluation?.allowed ? "Allowed" : "Denied"} — ${json.reason_label}`
      );
    } catch (err) {
      setInspectOut(err instanceof Error ? err.message : "Inspect failed");
    } finally {
      setBusy(false);
    }
  }

  async function revokeSessions() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminLocalFetch("/api/admin/sessions/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: sessionUser })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        revoked?: number;
      };
      if (!res.ok || !json.ok) {
        setMessage(json.detail ?? json.error ?? "Session revoke failed");
        return;
      }
      setMessage(`Revoked ${json.revoked ?? 0} portable session(s).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Session revoke failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-panel">
      <p className="small muted">
        Local manual grants live in <code>data/manual-grants.json</code>{" "}
        (preview_only). Dual-source honesty still comes from the entitlement
        evaluator. Site <span className="mono">{siteId}</span>.
      </p>
      {message ? <p className="admin-attention-note">{message}</p> : null}

      <section aria-label="Add manual grant">
        <h2 className="admin-section-title">Add manual grant</h2>
        <div className="admin-field-row">
          <label className="admin-field">
            <span className="small muted">Subject key (user id / persona)</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="user_… or persona id"
            />
          </label>
          <label className="admin-field">
            <span className="small muted">Tier</span>
            <select value={tierId} onChange={(e) => setTierId(e.target.value)}>
              {tierIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span className="small muted">Reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="admin-field">
            <span className="small muted">Expires (ISO, optional)</span>
            <input
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              placeholder="2026-08-01T00:00:00.000Z"
            />
          </label>
          <button
            type="button"
            className="admin-link-btn"
            disabled={busy}
            onClick={() => void addGrant()}
          >
            Grant access
          </button>
        </div>
      </section>

      <section aria-label="Inspect access reason">
        <h2 className="admin-section-title">Inspect access reason</h2>
        <div className="admin-field-row">
          <label className="admin-field">
            <span className="small muted">Subject key</span>
            <input
              value={inspectSubject}
              onChange={(e) => setInspectSubject(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="admin-link-btn"
            disabled={busy}
            onClick={() => void inspect()}
          >
            Inspect
          </button>
        </div>
        {inspectOut ? <p className="admin-banner">{inspectOut}</p> : null}
      </section>

      <section aria-label="Session controls">
        <h2 className="admin-section-title">Session revoke (portable)</h2>
        <div className="admin-field-row">
          <label className="admin-field">
            <span className="small muted">User id</span>
            <input
              value={sessionUser}
              onChange={(e) => setSessionUser(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="admin-link-btn"
            disabled={busy}
            onClick={() => void revokeSessions()}
          >
            Revoke sessions
          </button>
        </div>
      </section>

      <section aria-label="Grant list">
        <h2 className="admin-section-title">Grants</h2>
        {grants.length === 0 ? (
          <p className="muted">No local manual grants yet.</p>
        ) : (
          <ul className="admin-tier-list">
            {grants.map((g) => (
              <li key={g.grant_id} className="admin-tier-card">
                <p>
                  <strong className="mono">{g.subject_key}</strong> →{" "}
                  {g.tier_ids.join(", ")}
                </p>
                <p className="small muted">
                  {g.reason} · actor {g.actor}
                  {g.expires_at ? ` · expires ${g.expires_at}` : ""}
                  {g.revoked_at ? ` · revoked ${g.revoked_at}` : ""}
                </p>
                {!g.revoked_at ? (
                  <button
                    type="button"
                    className="admin-link-btn admin-link-btn--compact"
                    disabled={busy}
                    onClick={() => void revoke(g.grant_id)}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
