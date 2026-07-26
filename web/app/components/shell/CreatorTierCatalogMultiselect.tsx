"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRelayComposeTiers, resolveRelayComposeCampaignId, type TierFacet } from "@/lib/relay-api";

export type CreatorTierCatalogMultiselectProps = {
  creatorId: string;
  value: string[];
  onChange: (tierIds: string[]) => void;
  disabled?: boolean;
  /** When true, resolve campaign from the full catalog (public posts). */
  isPublic?: boolean;
  /** Switch between public gallery visibility and tier-gated access. */
  onPublicChange?: (isPublic: boolean) => void;
  /** Fires when compose tiers imply an unambiguous `campaign_id` for create-post. */
  onCampaignChange?: (campaignId: string | undefined) => void;
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
  isPublic = false,
  onPublicChange,
  onCampaignChange,
  "aria-labelledby": ariaLabelledBy
}: CreatorTierCatalogMultiselectProps) {
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
              relay_tier_id: r.relay_tier_id,
              campaign_id: r.campaign_id,
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

  useEffect(() => {
    if (!onCampaignChange || !tiers) {
      return;
    }
    onCampaignChange(resolveRelayComposeCampaignId(tiers, value, isPublic));
  }, [tiers, value, isPublic, onCampaignChange]);

  const toggle = useCallback(
    (tierId: string) => {
      if (value.includes(tierId)) {
        onChange(value.filter((x) => x !== tierId));
      } else {
        onPublicChange?.(false);
        onChange([...value, tierId]);
      }
    },
    [value, onChange, onPublicChange]
  );

  const selectPublic = useCallback(() => {
    onPublicChange?.(true);
    onChange([]);
  }, [onChange, onPublicChange]);


  const publicCardClass = isPublic
    ? "border-[#00aa6f] bg-[rgba(0,170,111,0.08)] shadow-[0_0_12px_rgba(0,170,111,0.15)]"
    : "border-[#2a2a2a] bg-[rgba(42,42,42,0.3)] hover:border-[rgba(0,170,111,0.4)] hover:bg-[rgba(42,42,42,0.5)]";

  const tierCardClass = (checked: boolean) =>
    checked
      ? "border-[#00aa6f] bg-[rgba(0,170,111,0.08)] shadow-[0_0_12px_rgba(0,170,111,0.15)]"
      : "border-[#2a2a2a] bg-[rgba(42,42,42,0.3)] hover:border-[rgba(0,170,111,0.4)] hover:bg-[rgba(42,42,42,0.5)]";

  const renderPublicOption = () => (
    <li>
      <button
        type="button"
        onClick={selectPublic}
        className={`w-full flex items-center gap-2.5 rounded-full border px-4 py-2.5 transition-all duration-200 text-left ${publicCardClass}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-[#f9fafb]">Public</span>
          <span className="block text-[10px] leading-snug text-[#9ca3af]">
            Visible to all gallery visitors.
          </span>
        </span>
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
          style={{ background: isPublic ? "#00aa6f" : "#2a2a2a" }}
        >
          {isPublic && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M2 5L4.2 7.5L8 2.5" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>
    </li>
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
      <fieldset
        className="text-left"
        disabled={disabled}
        aria-labelledby={ariaLabelledBy}
      >
        <ul className="space-y-2">
          {renderPublicOption()}
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-[var(--lib-fg-muted)]" role="status">
          No membership tiers in the catalog yet. Run a Patreon sync from the menu to add tier-gated options.
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset
      className="text-left"
      disabled={disabled}
      aria-labelledby={ariaLabelledBy}
    >
      <ul className="space-y-2 text-left">
        {renderPublicOption()}
        <li className="pt-1">
          <div className="mx-auto my-1 h-px w-2/3 bg-[#2a2a2a]" />
        </li>
        {sorted.map((t) => {
          const checked = value.includes(t.tier_id);
          return (
            <li key={t.tier_id}>
              <button
                type="button"
                onClick={() => toggle(t.tier_id)}
                className={`w-full flex items-center gap-2.5 rounded-full border px-4 py-2.5 transition-all duration-200 text-left ${tierCardClass(checked)}`}
              >
                <span className="min-w-0 flex-1 text-xs font-medium text-[#f9fafb]">
                  {t.title}
                  {typeof t.amount_cents === "number" && t.amount_cents > 0 ? (
                    <span className="ml-1.5 text-[#9ca3af]">
                      ${(t.amount_cents / 100).toFixed(2)}/mo
                    </span>
                  ) : null}
                </span>
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
                  style={{ background: checked ? "#00aa6f" : "#2a2a2a" }}
                >
                  {checked && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                      <path d="M2 5L4.2 7.5L8 2.5" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
