import Link from "next/link";
import type { AdminTiersModel } from "@/lib/admin/load-admin";

export function AdminTiers({ model }: { model: AdminTiersModel }) {
  return (
    <div className="admin-panel">
      <p className="small muted">
        Tier catalog from kit data. Mapping warnings are honesty signals — resolve
        access buckets in{" "}
        <Link href="/structure">Structure</Link>, audit imports in{" "}
        <Link href="/library">Library truth</Link>.
      </p>

      {model.unmapped_warnings.length > 0 ? (
        <section
          className="admin-banner admin-banner--warn"
          aria-label="Unmapped tier warnings"
        >
          <ul>
            {model.unmapped_warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="admin-tier-list">
        {model.tiers.map((tier) => (
          <li key={tier.tier_id} className="admin-tier-card">
            <div>
              <h3 className="admin-tier-title">{tier.title}</h3>
              <p className="small muted mono">{tier.tier_id}</p>
              <p className="admin-post-meta">
                <span className="admin-pill">{tier.access_level}</span>
                <span className="muted small">{tier.post_count} posts</span>
              </p>
              {tier.mapping_warning ? (
                <p className="admin-attention-note">{tier.mapping_warning}</p>
              ) : null}
            </div>
            <Link
              href="/structure"
              className="admin-link-btn admin-link-btn--compact"
            >
              Adjust in Structure
            </Link>
          </li>
        ))}
      </ul>

      {model.tiers.length === 0 ? (
        <p className="muted">
          No tiers in catalog — public / member_only posts may still exist.
        </p>
      ) : null}
    </div>
  );
}
