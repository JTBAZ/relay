import type { AdminOverviewModel } from "@/lib/admin/load-admin";

export function AdminOverview({ model }: { model: AdminOverviewModel }) {
  const anyOk = model.adapters.some((a) => a.ok);
  const allDegraded = model.adapters.every((a) => !a.ok);

  return (
    <div className="admin-panel">
      <section className="admin-banner admin-banner--degraded" aria-live="polite">
        <p>
          <strong>Site health: degraded (preview stubs)</strong>
          {allDegraded
            ? " — every adapter reports ok: false. This is expected until EH-030/033/050."
            : anyOk
              ? " — at least one adapter claimed ok; treat as non-authoritative until Milestone 3."
              : null}
        </p>
        <p className="small muted">
          {model.creator_display_name} (@{model.creator_handle}) ·{" "}
          <span className="mono">{model.base_url}</span>
          {model.manifest_slice ? (
            <>
              {" "}
              · manifest slice {model.manifest_slice}
            </>
          ) : null}
        </p>
      </section>

      <section className="admin-section" aria-labelledby="admin-counts-heading">
        <h2 id="admin-counts-heading">Kit inventory</h2>
        <div className="admin-tiles">
          <div className="admin-tile">
            <span className="admin-tile-value">{model.post_count}</span>
            <span className="admin-tile-label">Posts</span>
          </div>
          <div className="admin-tile">
            <span className="admin-tile-value">{model.media_count}</span>
            <span className="admin-tile-label">Media</span>
          </div>
          <div className="admin-tile">
            <span className="admin-tile-value">{model.tier_count}</span>
            <span className="admin-tile-label">Tiers</span>
          </div>
          <div className="admin-tile admin-tile--warn">
            <span className="admin-tile-value">{model.attention_count}</span>
            <span className="admin-tile-label">Attention marks</span>
          </div>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="admin-adapters-heading">
        <h2 id="admin-adapters-heading">Adapter health</h2>
        <p className="small muted">
          Stub/preview adapters must not false-green. productionSafe remains
          false.
        </p>
        <ul className="admin-health-list">
          {model.adapters.map((row) => (
            <li
              key={row.id}
              className={`admin-health-row ${row.ok ? "is-ok" : "is-degraded"}`}
            >
              <div className="admin-health-head">
                <span className="admin-health-id">{row.id}</span>
                <span className="admin-health-badge" aria-label={row.ok ? "ok" : "degraded"}>
                  {row.ok ? "ok" : "degraded"}
                </span>
                <span className="admin-health-impl muted mono">
                  {row.implementation}
                </span>
              </div>
              <p className="admin-health-detail">{row.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-section" aria-labelledby="admin-blockers-heading">
        <h2 id="admin-blockers-heading">Known blockers</h2>
        <ul className="admin-blocker-list">
          {model.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
