import Link from "next/link";
import type { ConnectionCard } from "@/lib/admin/connections";

export function AdminConnectionsPanel({ cards }: { cards: ConnectionCard[] }) {
  return (
    <div className="admin-panel">
      <p className="small muted">
        Connection status is preview honesty only — <code>ok</code> never means
        productionSafe. Env names only; secrets stay in the host secret store.
      </p>
      <ul className="admin-tier-list">
        {cards.map((card) => (
          <li key={card.id} className="admin-tier-card">
            <div className="admin-health-head">
              <h3 className="admin-tier-title">{card.title}</h3>
              <span
                className={`admin-health-badge ${card.ok ? "is-ok" : "is-degraded"}`}
              >
                {card.ok ? "ok (preview)" : "degraded"}
              </span>
            </div>
            <p className="small muted mono">{card.implementation}</p>
            <p className="admin-health-detail">{card.detail}</p>
            <p className="small">
              <strong>Owner:</strong> {card.ownership}
            </p>
            {card.env_hints.length > 0 ? (
              <p className="small muted">
                Env:{" "}
                {card.env_hints.map((e, i) => (
                  <span key={e}>
                    {i > 0 ? ", " : ""}
                    <code className="mono">{e}</code>
                  </span>
                ))}
              </p>
            ) : null}
            <p className="small">
              <strong>What breaks:</strong> {card.what_breaks}
            </p>
            <p className="admin-attention-note">
              <strong>Next:</strong> {card.next_action}
            </p>
            {card.deep_link ? (
              <Link
                href={card.deep_link}
                className="admin-link-btn admin-link-btn--compact"
              >
                Open related surface
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
