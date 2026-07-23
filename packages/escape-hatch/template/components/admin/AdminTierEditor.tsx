"use client";

import { useState } from "react";

type TierRow = {
  tier_id: string;
  title: string;
  access_level: string;
  post_count: number;
  amount_cents?: number | null;
  retired?: boolean;
  benefit_copy?: string | null;
  mapping_warning?: string;
};

export function AdminTierEditor({
  siteId,
  initialTiers
}: {
  siteId: string;
  initialTiers: TierRow[];
}) {
  const [tiers, setTiers] = useState(initialTiers);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function saveTier(tier: TierRow) {
    setBusy(tier.tier_id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/tiers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tier_id: tier.tier_id,
          title: tier.title,
          benefit_copy: tier.benefit_copy ?? null,
          retired: Boolean(tier.retired),
          amount_cents: tier.amount_cents ?? null
        })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        affected_posts?: number;
        tier?: TierRow;
      };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? "Save failed");
        return;
      }
      setTiers((prev) =>
        prev.map((t) =>
          t.tier_id === tier.tier_id
            ? {
                ...t,
                ...json.tier,
                post_count: json.affected_posts ?? t.post_count
              }
            : t
        )
      );
      setMessage(
        `Saved ${tier.tier_id}${
          typeof json.affected_posts === "number"
            ? ` (${json.affected_posts} gated posts)`
            : ""
        }.`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="admin-panel" aria-label="Tier CMS editor">
      <h2 className="admin-section-title">Tier catalog (EH-061)</h2>
      <p className="small muted">
        Edit display copy and retire tiers. Retired tiers stay in site.json for
        post gates but are hidden from public <code>/tiers</code>. Site:{" "}
        <span className="mono">{siteId}</span>
      </p>
      {message ? <p className="admin-attention-note">{message}</p> : null}
      <ul className="admin-tier-list">
        {tiers.map((tier) => (
          <li key={tier.tier_id} className="admin-tier-card">
            <label className="admin-field">
              <span className="small muted">Title</span>
              <input
                value={tier.title}
                onChange={(e) =>
                  setTiers((prev) =>
                    prev.map((t) =>
                      t.tier_id === tier.tier_id
                        ? { ...t, title: e.target.value }
                        : t
                    )
                  )
                }
              />
            </label>
            <label className="admin-field">
              <span className="small muted">Benefit copy</span>
              <textarea
                rows={2}
                value={tier.benefit_copy ?? ""}
                onChange={(e) =>
                  setTiers((prev) =>
                    prev.map((t) =>
                      t.tier_id === tier.tier_id
                        ? { ...t, benefit_copy: e.target.value }
                        : t
                    )
                  )
                }
              />
            </label>
            <label className="admin-field admin-field--inline">
              <input
                type="checkbox"
                checked={Boolean(tier.retired)}
                onChange={(e) =>
                  setTiers((prev) =>
                    prev.map((t) =>
                      t.tier_id === tier.tier_id
                        ? { ...t, retired: e.target.checked }
                        : t
                    )
                  )
                }
              />
              <span>
                Retired ({tier.post_count} gated posts — not deleted)
              </span>
            </label>
            <p className="small muted mono">{tier.tier_id}</p>
            <button
              type="button"
              className="admin-link-btn"
              disabled={busy === tier.tier_id}
              onClick={() => void saveTier(tier)}
            >
              {busy === tier.tier_id ? "Saving…" : "Save tier"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
