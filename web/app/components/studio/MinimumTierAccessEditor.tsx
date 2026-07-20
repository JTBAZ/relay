"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchRelayComposeTiers,
  patchPostAudienceAccess,
  type RelayComposeTierRow,
  type TierFacet
} from "@/lib/relay-api";
import { PILOT_PERMISSION_AUDIENCE_HINT } from "@/lib/pilot-permission-copy";
import {
  LIBRARY_CREATE_POST_PUBLIC_TIER,
  diffAudienceAccessTiers,
  formatAudienceAccessConfirmCopy
} from "@/lib/audience-access-tier-diff";
import { matchComposeTierForAccess } from "@/app/components/audience-access-tier-select";
import {
  buildMinimumTierAccessState,
  buildTierLadderRows
} from "@/lib/minimum-tier-ladder";

type Props = {
  creatorId: string;
  postId: string;
  /** Upstream gallery tier facets / ids for this post (relay keys). */
  accessTiers: TierFacet[];
  studioWriteBlocked: boolean;
  onRefresh: () => Promise<void>;
};

/**
 * Layer A — Public or one minimum required synced tier.
 * Writes only via PATCH `/audience-access`. Inline staged confirm (no modal).
 */
export default function MinimumTierAccessEditor({
  creatorId,
  postId,
  accessTiers,
  studioWriteBlocked,
  onRefresh
}: Props) {
  const [catalog, setCatalog] = useState<RelayComposeTierRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedTierId, setSavedTierId] = useState(LIBRARY_CREATE_POST_PUBLIC_TIER);
  const [stagedTierId, setStagedTierId] = useState(LIBRARY_CREATE_POST_PUBLIC_TIER);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const { tiers } = await fetchRelayComposeTiers(creatorId);
        if (!cancelled) setCatalog(tiers);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setCatalog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  useEffect(() => {
    if (!catalog) return;
    const matched = matchComposeTierForAccess(accessTiers, catalog);
    const next = matched || LIBRARY_CREATE_POST_PUBLIC_TIER;
    setSavedTierId(next);
    if (!reviewOpen) setStagedTierId(next);
  }, [accessTiers, catalog, reviewOpen]);

  const gate = useMemo(() => {
    const upstream = accessTiers.map((t) => t.tier_id);
    return buildMinimumTierAccessState(upstream, catalog ?? []);
  }, [accessTiers, catalog]);

  const ladderRows = useMemo(() => {
    if (!catalog) return [];
    const stagedGate =
      stagedTierId === LIBRARY_CREATE_POST_PUBLIC_TIER
        ? { is_public: true, minimum_tier_id: null, upstream_tier_ids: gate.upstream_tier_ids }
        : {
            is_public: false,
            minimum_tier_id: stagedTierId,
            upstream_tier_ids: gate.upstream_tier_ids
          };
    return buildTierLadderRows(catalog, stagedGate);
  }, [catalog, stagedTierId, gate.upstream_tier_ids]);

  const confirmCopy = useMemo(() => {
    if (!catalog || !reviewOpen) return null;
    const diff = diffAudienceAccessTiers(accessTiers, stagedTierId, catalog);
    return formatAudienceAccessConfirmCopy(diff, {
      multiTierCollapse: accessTiers.length > 1
    });
  }, [accessTiers, catalog, reviewOpen, stagedTierId]);

  const dirty = stagedTierId !== savedTierId;

  const save = useCallback(async () => {
    if (studioWriteBlocked || saveBusy) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const isPublic = stagedTierId === LIBRARY_CREATE_POST_PUBLIC_TIER;
      await patchPostAudienceAccess({
        relayCreatorId: creatorId,
        postId,
        is_public: isPublic,
        tier_ids: isPublic ? [] : [stagedTierId]
      });
      await onRefresh();
      setSavedTierId(stagedTierId);
      setReviewOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  }, [creatorId, postId, stagedTierId, studioWriteBlocked, saveBusy, onRefresh]);

  const writesDisabled =
    studioWriteBlocked || loading || saveBusy || Boolean(loadError) || !catalog;

  return (
    <div className="space-y-2" data-minimum-tier-access-editor>
      <p className="px-3 text-[10px] leading-relaxed text-[#6a726e]">
        {PILOT_PERMISSION_AUDIENCE_HINT}
      </p>

      {accessTiers.length > 1 ? (
        <p className="mx-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100">
          This post currently has multiple tier gates ({accessTiers.length}). Saving applies a single
          minimum tier; higher-priced tiers stay implied.
        </p>
      ) : null}

      {studioWriteBlocked ? (
        <p className="mx-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[10px] text-amber-100/90">
          Sync must be healthy before changing Patreon access. Current gate stays visible below.
        </p>
      ) : null}

      {loadError ? (
        <p className="mx-3 rounded-lg border border-red-800/50 bg-red-950/40 px-2 py-1.5 text-[10px] text-red-200">
          {loadError}
        </p>
      ) : null}

      {loading ? (
        <p className="px-3 text-[11px] text-[#555]">Loading synced tiers…</p>
      ) : (
        <fieldset disabled={writesDisabled} className="space-y-1 px-1">
          <legend className="sr-only">Minimum Patreon access</legend>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[#141414]">
            <input
              type="radio"
              name="minimum-tier"
              className="accent-[#9bf0c4]"
              checked={stagedTierId === LIBRARY_CREATE_POST_PUBLIC_TIER}
              onChange={() => {
                setStagedTierId(LIBRARY_CREATE_POST_PUBLIC_TIER);
                setReviewOpen(false);
              }}
            />
            <span className="text-[11px] text-[#e8eee9]">Public (open web)</span>
          </label>
          {ladderRows.map((row) => (
            <label
              key={row.tier_id}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-[#141414]"
            >
              <input
                type="radio"
                name="minimum-tier"
                className="mt-0.5 accent-[#9bf0c4]"
                checked={stagedTierId === row.tier_id}
                onChange={() => {
                  setStagedTierId(row.tier_id);
                  setReviewOpen(false);
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#e8eee9]">
                  {row.label}
                  {row.state === "minimum" ? (
                    <span className="rounded-full border border-[#9bf0c43d] px-1.5 py-0 text-[9px] text-[#9bf0c4]">
                      Minimum
                    </span>
                  ) : null}
                  {row.state === "implied" ? (
                    <span className="rounded-full border border-[#2a2a2a] px-1.5 py-0 text-[9px] text-[#68706c]">
                      Implied
                    </span>
                  ) : null}
                  {row.state === "locked_out" && stagedTierId !== LIBRARY_CREATE_POST_PUBLIC_TIER ? (
                    <span className="rounded-full border border-[#2a2a2a] px-1.5 py-0 text-[9px] text-[#555]">
                      Below minimum
                    </span>
                  ) : null}
                </span>
                {row.amount_cents != null ? (
                  <span className="block text-[9px] text-[#555]">
                    ${(row.amount_cents / 100).toFixed(2)}/mo
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {dirty && !reviewOpen ? (
        <div className="flex gap-2 px-3 pt-1">
          <button
            type="button"
            disabled={writesDisabled}
            onClick={() => setReviewOpen(true)}
            className="flex-1 rounded-lg border border-[#9bf0c43d] bg-[#9bf0c414] py-1.5 text-[11px] text-[#9bf0c4] disabled:opacity-40"
          >
            Review &amp; save
          </button>
          <button
            type="button"
            disabled={saveBusy}
            onClick={() => {
              setStagedTierId(savedTierId);
              setReviewOpen(false);
            }}
            className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-[11px] text-[#68706c]"
          >
            Reset
          </button>
        </div>
      ) : null}

      {reviewOpen && confirmCopy ? (
        <div
          className="mx-3 space-y-2 rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-3"
          data-minimum-tier-review
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#68706c]">
            Confirm access change
          </p>
          <p className="text-[11px] leading-snug text-[#c8d0cb]">{confirmCopy.summaryLine}</p>
          <p className="text-[10px] text-[#9a6b6b]">{confirmCopy.losingLine}</p>
          <p className="text-[10px] text-[#6a9a7a]">{confirmCopy.gainingLine}</p>
          {confirmCopy.multiTierNote ? (
            <p className="text-[10px] text-amber-200/90">{confirmCopy.multiTierNote}</p>
          ) : null}
          {saveError ? (
            <p className="text-[10px] text-red-300">{saveError}</p>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={writesDisabled}
              onClick={() => void save()}
              className="flex-1 rounded-lg border border-[#9bf0c43d] bg-[#9bf0c414] py-1.5 text-[11px] text-[#9bf0c4] disabled:opacity-40"
            >
              {saveBusy ? "Saving…" : "Save access"}
            </button>
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => setReviewOpen(false)}
              className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-[11px] text-[#68706c]"
            >
              Back
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
