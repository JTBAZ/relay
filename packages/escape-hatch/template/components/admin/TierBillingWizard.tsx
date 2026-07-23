"use client";

import { useState, useTransition } from "react";
import type { BillingPreflightReport } from "@/lib/billing/preflight";
import type { BillingTierMapEntry } from "@/lib/billing/tier-map";

type DraftRow = {
  tierId: string;
  title: string;
  productId: string;
  priceId: string;
  currency: string;
  unitAmountCents: string;
  interval: string;
  benefitCopy: string;
  patreonContinuityNote: string;
};

type Props = {
  siteId: string;
  initialRows: DraftRow[];
  initialPreflight: BillingPreflightReport | null;
};

function toDraft(
  tierId: string,
  title: string,
  entry: BillingTierMapEntry | null
): DraftRow {
  return {
    tierId,
    title,
    productId: entry?.productId ?? "",
    priceId: entry?.priceId ?? "",
    currency: entry?.currency ?? "USD",
    unitAmountCents:
      entry?.unitAmountCents != null ? String(entry.unitAmountCents) : "",
    interval: entry?.interval ?? "month",
    benefitCopy: entry?.benefitCopy ?? "",
    patreonContinuityNote: entry?.patreonContinuityNote ?? ""
  };
}

export function TierBillingWizard({
  siteId,
  initialRows,
  initialPreflight
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [preflight, setPreflight] = useState(initialPreflight);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateRow(tierId: string, patch: Partial<DraftRow>) {
    setRows((prev) =>
      prev.map((r) => (r.tierId === tierId ? { ...r, ...patch } : r))
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/billing/tier-map", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-escape-hatch-local": "1"
        },
        body: JSON.stringify({
          siteId,
          entries: rows.map((r) => ({
            tierId: r.tierId,
            productId: r.productId || null,
            priceId: r.priceId || null,
            currency: r.currency || null,
            unitAmountCents: r.unitAmountCents
              ? Number(r.unitAmountCents)
              : null,
            interval: r.interval || null,
            benefitCopy: r.benefitCopy || null,
            patreonContinuityNote: r.patreonContinuityNote || null
          }))
        })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        document?: { updatedAt?: string };
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "save_failed");
        return;
      }
      setSavedAt(json.document?.updatedAt ?? new Date().toISOString());
    });
  }

  function runPreflight() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/billing/preflight", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-escape-hatch-local": "1"
        },
        body: JSON.stringify({ siteId })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        report?: BillingPreflightReport;
      };
      if (!res.ok || !json.ok || !json.report) {
        setError(json.error ?? "preflight_failed");
        return;
      }
      setPreflight(json.report);
    });
  }

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <h2>Independent billing map</h2>
        <p className="muted">
          Map each catalog tier to a creator-owned product/price id. Preview{" "}
          <a href="/tiers">/tiers</a> after saving. Duplicate-billing safeguards
          block Checkout when Patreon or independent access already covers the
          tier. productionSafe: false · EH-054
        </p>
        {rows.length === 0 ? (
          <p className="muted">No tiers in catalog yet.</p>
        ) : (
          <ul className="admin-tier-list">
            {rows.map((row) => (
              <li key={row.tierId} className="admin-tier-card">
                <div>
                  <h3 className="admin-tier-title">{row.title}</h3>
                  <p className="small muted mono">{row.tierId}</p>
                  <label className="admin-field">
                    <span>Price id</span>
                    <input
                      value={row.priceId}
                      onChange={(e) =>
                        updateRow(row.tierId, { priceId: e.target.value })
                      }
                      disabled={pending}
                      placeholder="price_…"
                    />
                  </label>
                  <label className="admin-field">
                    <span>Product id</span>
                    <input
                      value={row.productId}
                      onChange={(e) =>
                        updateRow(row.tierId, { productId: e.target.value })
                      }
                      disabled={pending}
                      placeholder="prod_…"
                    />
                  </label>
                  <div className="admin-field-row">
                    <label className="admin-field">
                      <span>Amount (cents)</span>
                      <input
                        value={row.unitAmountCents}
                        onChange={(e) =>
                          updateRow(row.tierId, {
                            unitAmountCents: e.target.value
                          })
                        }
                        disabled={pending}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Currency</span>
                      <input
                        value={row.currency}
                        onChange={(e) =>
                          updateRow(row.tierId, { currency: e.target.value })
                        }
                        disabled={pending}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Interval</span>
                      <select
                        value={row.interval}
                        onChange={(e) =>
                          updateRow(row.tierId, { interval: e.target.value })
                        }
                        disabled={pending}
                      >
                        <option value="month">month</option>
                        <option value="year">year</option>
                        <option value="week">week</option>
                        <option value="day">day</option>
                      </select>
                    </label>
                  </div>
                  <label className="admin-field">
                    <span>Benefit copy</span>
                    <input
                      value={row.benefitCopy}
                      onChange={(e) =>
                        updateRow(row.tierId, { benefitCopy: e.target.value })
                      }
                      disabled={pending}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Patreon continuity note</span>
                    <input
                      value={row.patreonContinuityNote}
                      onChange={(e) =>
                        updateRow(row.tierId, {
                          patreonContinuityNote: e.target.value
                        })
                      }
                      disabled={pending}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
        {error ? <p role="alert">{error}</p> : null}
        {savedAt ? (
          <p className="muted">Saved {savedAt}</p>
        ) : null}
        <p className="eh-account-actions">
          <button type="button" onClick={save} disabled={pending}>
            {pending ? "Working…" : "Save map"}
          </button>{" "}
          <button type="button" onClick={runPreflight} disabled={pending}>
            Run preflight
          </button>
        </p>
      </section>

      {preflight ? (
        <section className="admin-panel">
          <h2>Preflight / sandbox</h2>
          <p>
            Overall:{" "}
            <strong>{preflight.ok ? "ready enough to preview" : "blocked"}</strong>
            {" · "}
            adapter {preflight.adapterImplementation}
            {" · "}
            sandbox={String(preflight.sandbox)}
            {" · "}
            mapped {preflight.mappedTier}/{preflight.catalogTiers}
          </p>
          <ul>
            {preflight.checks.map((c) => (
              <li key={c.id}>
                <strong>{c.ok ? "ok" : "fail"}</strong> · {c.id}: {c.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export { toDraft };
