"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { fetchRelayComposeTiers, type TierFacet } from "@/lib/relay-api";

export type CreatorTierCatalogMultiselectProps = {
  creatorId: string;
  value: string[];
  onChange: (tierIds: string[]) => void;
  disabled?: boolean;
  /** Optional: associate with a heading for a11y */
  "aria-labelledby"?: string;
};

function sortTiers(tiers: TierFacet[]): TierFacet[] {
  return [...tiers].sort((a, b) => {
    const ac = a.amount_cents ?? 0;
    const bc = b.amount_cents ?? 0;
    if (ac !== bc) return ac - bc;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

/**
 * Multiselect of tiers for Relay-native `POST /api/v1/relay/posts` `tier_ids`.
 * Uses `GET /api/v1/relay/compose-tiers`; each option value is Prisma `Tier.id`.
 */
export function CreatorTierCatalogMultiselect({
  creatorId,
  value,
  onChange,
  disabled = false,
  "aria-labelledby": ariaLabelledBy
}: CreatorTierCatalogMultiselectProps) {
  const baseId = useId();
  const [tiers, setTiers] = useState<TierFacet[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!creatorId.trim() || disabled) {
      setTiers(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { tiers: rows } = await fetchRelayComposeTiers(creatorId.trim());
        if (!cancelled) {
          setTiers(
            rows.map((r) => ({
              tier_id: r.tier_id,
              title: r.title,
              ...(r.amount_cents != null ? { amount_cents: r.amount_cents } : {})
            }))
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setTiers(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId, disabled]);

  const sorted = useMemo(() => (tiers ? sortTiers(tiers) : []), [tiers]);

  const toggle = useCallback(
    (tierId: string) => {
      if (value.includes(tierId)) {
        onChange(value.filter((x) => x !== tierId));
      } else {
        onChange([...value, tierId]);
      }
    },
    [value, onChange]
  );

  if (!creatorId.trim()) {
    return (
      <p className="text-center text-xs text-[var(--lib-fg-muted)]" role="status">
        Sign in with a studio session to load tiers.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="text-center text-xs text-[var(--lib-fg-muted)]" role="status">
        Loading tiers…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-center text-sm text-[var(--lib-destructive)]" role="alert">
        {error}
      </p>
    );
  }

  if (!sorted.length) {
    return (
      <p className="text-center text-xs leading-relaxed text-[var(--lib-fg-muted)]" role="status">
        No tiers in catalog yet. Run a Patreon sync from the menu so Relay can list membership tiers
        (stable ids match <code className="text-[10px]">POST /api/v1/relay/posts</code>{" "}
        <span className="font-mono text-[10px]">tier_ids</span>).
      </p>
    );
  }

  return (
    <fieldset
      className="text-left"
      disabled={disabled}
      aria-labelledby={ariaLabelledBy}
    >
      <ul className="mx-auto max-h-40 max-w-lg space-y-1.5 overflow-y-auto pr-1 text-left">
        {sorted.map((t) => {
          const id = `${baseId}-${t.tier_id}`;
          const checked = value.includes(t.tier_id);
          return (
            <li key={t.tier_id}>
              <label
                htmlFor={id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-1 py-0.5 hover:border-[var(--lib-border)] hover:bg-[var(--lib-muted)]/30"
              >
                <input
                  id={id}
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-[var(--lib-border)] text-[var(--lib-primary)] focus:ring-[var(--lib-primary)]"
                  checked={checked}
                  onChange={() => toggle(t.tier_id)}
                />
                <span className="min-w-0 flex-1 text-xs text-[var(--lib-fg)]">
                  <span className="font-medium">{t.title}</span>
                  {typeof t.amount_cents === "number" && t.amount_cents > 0 ? (
                    <span className="ml-1.5 text-[10px] text-[var(--lib-fg-muted)]">
                      ${(t.amount_cents / 100).toFixed(2)}/mo
                    </span>
                  ) : null}
                  <span className="mt-0.5 block font-mono text-[10px] text-[var(--lib-fg-muted)]">
                    {t.tier_id}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
