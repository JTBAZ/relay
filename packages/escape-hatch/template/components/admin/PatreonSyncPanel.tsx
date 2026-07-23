"use client";

import { useEffect, useState } from "react";

type SyncStatus = {
  last_sync_at: string | null;
  last_status: string;
  last_error: string | null;
  conflict_count: number;
  conflict_queue: Array<{
    conflict_id: string;
    kind: string;
    post_id: string;
    summary: string;
    upstream_revision: string | null;
  }>;
  tracked_posts: number;
};

export function PatreonSyncPanel({ siteId }: { siteId: string }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/patreon/sync", { method: "GET" });
    const json = (await res.json()) as SyncStatus & {
      ok?: boolean;
      error?: string;
    };
    if (res.ok && json.ok !== false) {
      setStatus({
        last_sync_at: json.last_sync_at,
        last_status: json.last_status,
        last_error: json.last_error,
        conflict_count: json.conflict_count,
        conflict_queue: json.conflict_queue ?? [],
        tracked_posts: json.tracked_posts
      });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function runFixtureSync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/patreon/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fixture_posts: [
            {
              upstream_id: "demo_1",
              upstream_revision: "rev_1",
              title: "Synced demo post",
              published_at: "2026-07-01T00:00:00.000Z",
              access_level: "member_only",
              tier_ids: [],
              body_plain: "Read-only transition sync preview."
            }
          ]
        })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        created?: number;
        updated?: number;
        conflicts?: number;
      };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? "Sync failed");
      } else {
        setMessage(
          `Sync ok (preview): created ${json.created ?? 0}, updated ${json.updated ?? 0}, conflicts ${json.conflicts ?? 0}.`
        );
      }
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="Patreon transition sync">
      <h2 className="admin-section-title">Optional Patreon sync (EH-063)</h2>
      <p className="small muted">
        Read-only transition sync into kit <code>site.json</code>. Protected
        local edits and native posts are never overwritten — conflicts queue
        instead. Site <span className="mono">{siteId}</span>. productionSafe
        remains false. Live network pull is deferred; use fixture sync for
        preview.
      </p>
      {message ? <p className="admin-attention-note">{message}</p> : null}
      {status ? (
        <p className="small">
          Status: <strong>{status.last_status}</strong>
          {status.last_sync_at ? ` · last ${status.last_sync_at}` : ""}
          {` · tracked ${status.tracked_posts} · conflicts ${status.conflict_count}`}
          {status.last_error ? (
            <>
              <br />
              <span className="admin-attention-note">{status.last_error}</span>
            </>
          ) : null}
        </p>
      ) : null}
      <button
        type="button"
        className="admin-link-btn"
        disabled={busy}
        onClick={() => void runFixtureSync()}
      >
        {busy ? "Syncing…" : "Run fixture sync (preview)"}
      </button>
      {status && status.conflict_queue.length > 0 ? (
        <ul className="admin-tier-list" aria-label="Sync conflict queue">
          {status.conflict_queue.map((c) => (
            <li key={c.conflict_id} className="admin-tier-card">
              <p>
                <span className="admin-pill">{c.kind}</span>{" "}
                <span className="mono">{c.post_id}</span>
              </p>
              <p className="small muted">{c.summary}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No sync conflicts.</p>
      )}
    </section>
  );
}
