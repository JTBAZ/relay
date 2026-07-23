"use client";

import { useEffect, useState } from "react";

type TokenRow = {
  token_id: string;
  prefix: string;
  scopes: string[];
  label: string;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
};

type AuditRow = {
  entry_id: string;
  token_id: string;
  action: string;
  post_id: string | null;
  ok: boolean;
  detail: string;
  created_at: string;
};

export function CrosspostPanel({ siteId }: { siteId: string }) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [scopes, setScopes] = useState<string[]>([
    "crosspost:draft",
    "crosspost:publish"
  ]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [label, setLabel] = useState("Relay Crosspost");
  const [wantDraft, setWantDraft] = useState(true);
  const [wantPublish, setWantPublish] = useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/crosspost/tokens", { method: "GET" });
    const json = (await res.json()) as {
      ok?: boolean;
      tokens?: TokenRow[];
      audit_entries?: AuditRow[];
      scopes_available?: string[];
      error?: string;
    };
    if (res.ok && json.ok !== false) {
      setTokens(json.tokens ?? []);
      setAudit(json.audit_entries ?? []);
      if (json.scopes_available?.length) setScopes(json.scopes_available);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function mint() {
    setBusy(true);
    setMessage(null);
    setSecretOnce(null);
    const selected: string[] = [];
    if (wantDraft) selected.push("crosspost:draft");
    if (wantPublish) selected.push("crosspost:publish");
    try {
      const res = await fetch("/api/admin/crosspost/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scopes: selected, label })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        secret?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.secret) {
        setMessage(json.error ?? "Mint failed");
      } else {
        setSecretOnce(json.secret);
        setMessage("Token minted — copy the secret now; it will not be shown again.");
      }
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Mint failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tokenId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/crosspost/tokens?token_id=${encodeURIComponent(tokenId)}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? "Revoke failed");
      } else {
        setMessage("Token revoked. Native CMS publishing is unaffected.");
      }
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="Relay Crosspost tokens">
      <h2 className="admin-section-title">Optional Relay Crosspost (EH-064)</h2>
      <p className="small muted">
        Mint revocable Bearer tokens with <code>crosspost:draft</code> /{" "}
        <code>crosspost:publish</code> scopes. Inbound posts land in kit{" "}
        <code>site.json</code> with origin <code>crossposted</code>. Site{" "}
        <span className="mono">{siteId}</span>. Revoking tokens never breaks
        native admin publishing. productionSafe remains false.
      </p>
      {message ? <p className="admin-attention-note">{message}</p> : null}
      {secretOnce ? (
        <p className="admin-attention-note" role="status">
          Secret (once): <code className="mono">{secretOnce}</code>
        </p>
      ) : null}

      <div className="admin-form-stack">
        <label>
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={wantDraft}
            onChange={(e) => setWantDraft(e.target.checked)}
            disabled={busy}
          />
          crosspost:draft
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={wantPublish}
            onChange={(e) => setWantPublish(e.target.checked)}
            disabled={busy}
          />
          crosspost:publish
        </label>
        <button type="button" onClick={() => void mint()} disabled={busy}>
          Mint token
        </button>
      </div>

      <h3 className="admin-section-title">Tokens</h3>
      {tokens.length === 0 ? (
        <p className="small muted">No tokens yet.</p>
      ) : (
        <ul className="admin-list">
          {tokens.map((t) => (
            <li key={t.token_id}>
              <span className="mono">{t.prefix}…</span> · {t.label} ·{" "}
              {t.scopes.join(", ")}
              {t.revoked_at ? (
                <span className="muted"> · revoked</span>
              ) : (
                <button
                  type="button"
                  className="admin-inline-btn"
                  disabled={busy}
                  onClick={() => void revoke(t.token_id)}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="admin-section-title">Recent audit</h3>
      {audit.length === 0 ? (
        <p className="small muted">No Crosspost audit entries yet.</p>
      ) : (
        <ul className="admin-list">
          {audit.slice(0, 12).map((e) => (
            <li key={e.entry_id}>
              {e.created_at} · {e.action} · {e.ok ? "ok" : "fail"} ·{" "}
              {e.detail}
              {e.post_id ? (
                <>
                  {" "}
                  · <span className="mono">{e.post_id}</span>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="small muted">
        Inbound endpoint: <code>POST /api/relay/crosspost/posts</code> with
        Bearer token + optional <code>Idempotency-Key</code>. Available scopes:{" "}
        {scopes.join(", ")}.
      </p>
    </section>
  );
}
