"use client";



import { useCallback, useEffect, useId, useMemo, useState } from "react";

import {

  fetchRelayComposeTiers,

  patchPostAudienceAccess,

  type GalleryItem,

  type RelayComposeTierRow,

  type TierFacet

} from "@/lib/relay-api";

import {

  diffAudienceAccessTiers,

  formatAudienceAccessConfirmCopy,

  LIBRARY_CREATE_POST_PUBLIC_TIER

} from "@/lib/audience-access-tier-diff";

import { AudienceAccessConfirmDialog } from "./AudienceAccessConfirmDialog";



export function accessTiersFromGalleryItem(

  item: GalleryItem,

  tierTitleById: Record<string, string> = {}

): TierFacet[] {

  return item.tier_ids.map((tier_id) => ({

    tier_id,

    title:

      tierTitleById[tier_id]?.trim() ||

      (tier_id.startsWith("patreon_tier_")

        ? tier_id.slice("patreon_tier_".length)

        : tier_id.startsWith("relay_tier_")

          ? tier_id.slice("relay_tier_".length)

          : tier_id)

  }));

}



export function matchComposeTierForAccess(

  access: TierFacet[],

  catalog: RelayComposeTierRow[]

): string {

  if (access.length === 0) {

    return LIBRARY_CREATE_POST_PUBLIC_TIER;

  }

  const gateId = access[0]!.tier_id;

  const row =

    catalog.find((t) => t.relay_tier_id === gateId) ??

    catalog.find((t) => t.tier_id === gateId);

  return row?.tier_id ?? "";

}



type Props = {

  creatorId: string;

  postId: string;

  accessTiers: TierFacet[];

  onSaved: () => Promise<void>;

  disabled?: boolean;

  selectClassName?: string;

  /** When true, omits inline save status messages (for compact popovers). */

  compact?: boolean;

};



export function AudienceAccessTierSelect({

  creatorId,

  postId,

  accessTiers,

  onSaved,

  disabled = false,

  selectClassName,

  compact = false

}: Props) {

  const selectId = useId();

  const [catalog, setCatalog] = useState<RelayComposeTierRow[] | null>(null);

  const [loading, setLoading] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [savedTierId, setSavedTierId] = useState("");

  const [selectedTierId, setSelectedTierId] = useState("");

  const [saveBusy, setSaveBusy] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  const [saveOk, setSaveOk] = useState(false);

  const [multiTierNotice, setMultiTierNotice] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [pendingTierId, setPendingTierId] = useState<string | null>(null);



  useEffect(() => {

    if (!creatorId.trim()) {

      setCatalog(null);

      return;

    }

    let cancelled = false;

    setLoading(true);

    setLoadError(null);

    void (async () => {

      try {

        const { tiers } = await fetchRelayComposeTiers(creatorId.trim());

        if (!cancelled) {

          setCatalog(tiers);

        }

      } catch (e) {

        if (!cancelled) {

          setLoadError(e instanceof Error ? e.message : String(e));

          setCatalog(null);

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

  }, [creatorId]);



  useEffect(() => {

    setMultiTierNotice(accessTiers.length > 1);

    if (!catalog) {

      return;

    }

    const matched = matchComposeTierForAccess(accessTiers, catalog);

    setSavedTierId(matched);

    if (!confirmOpen) {

      setSelectedTierId(matched);

    }

  }, [accessTiers, catalog, confirmOpen]);



  const options = useMemo(() => {

    const rows = catalog ?? [];

    const sorted = [...rows].sort((a, b) => {

      const ac = a.amount_cents ?? 0;

      const bc = b.amount_cents ?? 0;

      if (ac !== bc) return ac - bc;

      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

    });

    return [

      { id: LIBRARY_CREATE_POST_PUBLIC_TIER, label: "Public (open web)" },

      ...sorted.map((t) => ({

        id: t.tier_id,

        label: t.title,

        amount_cents: t.amount_cents

      }))

    ];

  }, [catalog]);



  const confirmCopy = useMemo(() => {

    if (!catalog || pendingTierId === null) return null;

    const diff = diffAudienceAccessTiers(accessTiers, pendingTierId, catalog);

    return formatAudienceAccessConfirmCopy(diff, {

      multiTierCollapse: accessTiers.length > 1

    });

  }, [accessTiers, catalog, pendingTierId]);



  const save = useCallback(

    async (nextTierId: string) => {

      setSaveBusy(true);

      setSaveError(null);

      setSaveOk(false);

      try {

        const isPublic = nextTierId === LIBRARY_CREATE_POST_PUBLIC_TIER;

        await patchPostAudienceAccess({

          relayCreatorId: creatorId,

          postId,

          is_public: isPublic,

          tier_ids: isPublic ? [] : [nextTierId]

        });

        await onSaved();

        setSavedTierId(nextTierId);

        setSelectedTierId(nextTierId);

        setSaveOk(true);

        setMultiTierNotice(false);

        setConfirmOpen(false);

        setPendingTierId(null);

      } catch (error) {

        setSaveError(error instanceof Error ? error.message : String(error));

      } finally {

        setSaveBusy(false);

      }

    },

    [creatorId, postId, onSaved]

  );



  const handleCancelConfirm = useCallback(() => {

    setConfirmOpen(false);

    setPendingTierId(null);

    setSelectedTierId(savedTierId || LIBRARY_CREATE_POST_PUBLIC_TIER);

  }, [savedTierId]);



  const handleProceedConfirm = useCallback(() => {

    if (pendingTierId === null) return;

    void save(pendingTierId);

  }, [pendingTierId, save]);



  const selectDisabled = disabled || loading || saveBusy || Boolean(loadError) || !catalog?.length;



  return (

    <div className="space-y-2">

      {!compact && multiTierNotice ? (

        <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100">

          This post currently has multiple tier gates. Saving picks a single tier (lowest-select wins in the

          picker).

        </p>

      ) : null}

      {loadError ? (

        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">

          {loadError}

        </p>

      ) : null}

      <label htmlFor={selectId} className="sr-only">

        Audience access tier

      </label>

      <select

        id={selectId}

        disabled={selectDisabled}

        value={selectedTierId || LIBRARY_CREATE_POST_PUBLIC_TIER}

        onChange={(e) => {

          const next = e.target.value;

          if (next === (savedTierId || LIBRARY_CREATE_POST_PUBLIC_TIER)) {

            return;

          }

          if (!catalog?.length) {

            return;

          }

          setSelectedTierId(next);

          setPendingTierId(next);

          setConfirmOpen(true);

          setSaveError(null);

          setSaveOk(false);

        }}

        className={

          selectClassName ??

          "w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-2.5 py-2 text-xs text-[var(--lib-fg)] outline-none focus:border-[var(--lib-primary)] disabled:opacity-50"

        }

      >

        {loading ? (

          <option value="">Loading tiers…</option>

        ) : (

          options.map((opt) => (

            <option key={opt.id} value={opt.id}>

              {opt.label}

              {"amount_cents" in opt && typeof opt.amount_cents === "number" && opt.amount_cents > 0

                ? ` — $${(opt.amount_cents / 100).toFixed(2)}/mo`

                : ""}

            </option>

          ))

        )}

      </select>

      {confirmCopy ? (

        <AudienceAccessConfirmDialog

          open={confirmOpen}

          title="Change audience access?"

          summaryLine={confirmCopy.summaryLine}

          losingLine={confirmCopy.losingLine}

          gainingLine={confirmCopy.gainingLine}

          multiTierNote={confirmCopy.multiTierNote}

          busy={saveBusy}

          onCancel={handleCancelConfirm}

          onProceed={handleProceedConfirm}

        />

      ) : null}

      {!compact && saveBusy ? (

        <p className="text-[10px] text-[var(--lib-fg-muted)]" role="status">

          Saving audience access…

        </p>

      ) : null}

      {!compact && saveError ? (

        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">

          {saveError}

        </p>

      ) : null}

      {!compact && saveOk ? (

        <p className="rounded-lg border border-[color-mix(in_srgb,var(--lib-primary)_35%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_12%,var(--lib-card))] px-2 py-1.5 text-xs text-[var(--lib-fg)]">

          Audience access updated.

        </p>

      ) : null}

      {compact && saveBusy ? (

        <p className="text-[10px] text-[var(--lib-fg-muted)]" role="status">

          Saving…

        </p>

      ) : null}

      {compact && saveError ? (

        <p className="text-[10px] text-red-300">{saveError}</p>

      ) : null}

    </div>

  );

}

