import type { HealthItem } from "@/lib/admin/connections";

export function AdminHealthPanel({ items }: { items: HealthItem[] }) {
  const degraded = items.filter((i) => !i.ok).length;
  return (
    <div className="admin-panel">
      <section className="admin-banner admin-banner--degraded" aria-live="polite">
        <p>
          <strong>
            Site health: {degraded} actionable item
            {degraded === 1 ? "" : "s"} (preview)
          </strong>{" "}
          — connected ≠ healthy; productionSafe remains false.
        </p>
      </section>
      <ul className="admin-health-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`admin-health-row ${item.ok ? "is-ok" : "is-degraded"}`}
          >
            <div className="admin-health-head">
              <span className="admin-health-id">{item.title}</span>
              <span className="admin-health-badge">
                {item.ok ? "ok (preview)" : "action needed"}
              </span>
            </div>
            <p className="admin-health-detail">{item.detail}</p>
            <p className="admin-attention-note">
              <strong>Next safe action:</strong> {item.next_action}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
