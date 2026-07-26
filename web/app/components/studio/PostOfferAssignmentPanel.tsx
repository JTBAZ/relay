"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AudiencePersonaKey } from "@/lib/audience-promotion-contracts";
import {
  type GateCatalogTier,
  resolveMinimumGateRelayTierId
} from "@/lib/effective-promo";
import {
  buildOfferTrackedLinkUrl,
  listCreatorDiscountCodes,
  listCreatorTierPromotionDefaults,
  listPostMarketingOffers,
  upsertPostMarketingOffer,
  type CreatorDiscountCodeRecord,
  type PostMarketingOfferRecord,
  type TierPromotionDefaultRecord
} from "@/lib/relay-api";
import OfferTrackedLinkPanel from "@/app/components/studio/OfferTrackedLinkPanel";

type PersonaOption = { persona_key: AudiencePersonaKey; label: string };

type OfferSource = "explicit" | "tier_default" | "none";

type Props = {
  creatorId: string;
  postId: string;
  personas: PersonaOption[];
  selectedPersonaKey: AudiencePersonaKey;
  postTierIds: string[];
  catalogTiers: GateCatalogTier[];
  studioWriteBlocked: boolean;
  onOfferSaved?: (offer: PostMarketingOfferRecord) => void;
};

const TIER_DEFAULT_SEGMENT = "unpermissioned";

export default function PostOfferAssignmentPanel({
  creatorId,
  postId,
  personas,
  selectedPersonaKey,
  postTierIds,
  catalogTiers,
  studioWriteBlocked,
  onOfferSaved
}: Props) {
  const [codes, setCodes] = useState<CreatorDiscountCodeRecord[]>([]);
  const [offers, setOffers] = useState<PostMarketingOfferRecord[]>([]);
  const [tierDefaults, setTierDefaults] = useState<TierPromotionDefaultRecord[]>([]);
  const [headline, setHeadline] = useState("");
  const [cta, setCta] = useState("");
  const [codeId, setCodeId] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [overrideDraft, setOverrideDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const gateRelayTierId = useMemo(
    () => resolveMinimumGateRelayTierId(postTierIds, catalogTiers),
    [postTierIds, catalogTiers]
  );

  const tierDefault = useMemo(
    () =>
      tierDefaults.find(
        (d) =>
          d.active &&
          d.segment === TIER_DEFAULT_SEGMENT &&
          gateRelayTierId != null &&
          d.gate_relay_tier_id.trim() === gateRelayTierId
      ) ?? null,
    [tierDefaults, gateRelayTierId]
  );

  const explicitOffer = useMemo(
    () => offers.find((o) => o.audience_key === selectedPersonaKey && o.active) ?? null,
    [offers, selectedPersonaKey]
  );

  const effectiveSource: OfferSource = explicitOffer
    ? "explicit"
    : tierDefault
      ? "tier_default"
      : "none";

  const editingOverride = effectiveSource === "explicit" || overrideDraft;

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [c, o, d] = await Promise.all([
        listCreatorDiscountCodes(creatorId),
        listPostMarketingOffers({ creatorId, postId }),
        listCreatorTierPromotionDefaults(creatorId)
      ]);
      setCodes(c.filter((x) => x.active));
      setOffers(o);
      setTierDefaults(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [creatorId, postId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setOverrideDraft(false);
    setOk(false);
  }, [selectedPersonaKey]);

  useEffect(() => {
    if (explicitOffer) {
      setHeadline(explicitOffer.headline ?? "");
      setCta(explicitOffer.cta_text ?? "");
      setCodeId(explicitOffer.discount_code_id ?? "");
      setDestinationUrl(explicitOffer.patreon_destination_url ?? "");
      return;
    }
    if (overrideDraft && tierDefault) {
      setHeadline(tierDefault.headline ?? "");
      setCta(tierDefault.cta_text ?? "");
      setCodeId(tierDefault.discount_code_id ?? "");
      setDestinationUrl(tierDefault.patreon_destination_url ?? "");
      return;
    }
    setHeadline("");
    setCta("");
    setCodeId("");
    setDestinationUrl("");
  }, [explicitOffer, overrideDraft, tierDefault, selectedPersonaKey]);

  const personaLabel =
    personas.find((p) => p.persona_key === selectedPersonaKey)?.label ?? selectedPersonaKey;

  const beginOverride = () => {
    setOverrideDraft(true);
    setOk(false);
    if (tierDefault) {
      setHeadline(tierDefault.headline ?? "");
      setCta(tierDefault.cta_text ?? "");
      setCodeId(tierDefault.discount_code_id ?? "");
      setDestinationUrl(tierDefault.patreon_destination_url ?? "");
    }
  };

  const returnToDefault = async () => {
    if (studioWriteBlocked || busy) return;
    if (!explicitOffer) {
      setOverrideDraft(false);
      setOk(false);
      return;
    }
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await upsertPostMarketingOffer({
        creatorId,
        postId,
        audience_key: selectedPersonaKey,
        active: false
      });
      setOverrideDraft(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (studioWriteBlocked || busy) return;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const offer = await upsertPostMarketingOffer({
        creatorId,
        postId,
        audience_key: selectedPersonaKey,
        discount_code_id: codeId || null,
        headline,
        cta_text: cta,
        patreon_destination_url: destinationUrl.trim() || null,
        active: true
      });
      setOverrideDraft(false);
      onOfferSaved?.(offer);
      await reload();
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sourceLabel =
    effectiveSource === "explicit"
      ? "Post override"
      : effectiveSource === "tier_default"
        ? "Tier default"
        : "No offer";

  const tierDefaultTrackedUrl = tierDefault?.redirect_slug
    ? buildOfferTrackedLinkUrl(tierDefault.redirect_slug)
    : null;

  return (
    <div
      className="space-y-2 px-3"
      data-post-offer-assignment
      data-offer-source={effectiveSource}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] leading-relaxed text-[#6a726e]">
          Assign one offer to the selected simulator persona ({personaLabel}). Codes come from your
          library above.
        </p>
        <span
          className="shrink-0 rounded-md border border-[#2a302d] px-2 py-0.5 text-[10px] text-[#9bf0c4]"
          data-testid="offer-source-badge"
        >
          {sourceLabel}
        </span>
      </div>

      {effectiveSource === "tier_default" && !overrideDraft ? (
        <div className="space-y-2 rounded-lg border border-[#1f1f1f] bg-[#0e0e0e] p-2">
          {tierDefault?.code_missing ? (
            <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100">
              Linked tier-default code is missing — edit in Promos hub or override for this post.
            </p>
          ) : null}
          <p className="text-[10px] text-[#68706c]">
            Locked viewers inherit this offer from your tier promotion defaults.
          </p>
          <dl className="space-y-1.5 text-[11px] text-[#e8eee9]">
            <div>
              <dt className="text-[10px] text-[#555]">Headline</dt>
              <dd>{tierDefault?.headline?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-[#555]">CTA</dt>
              <dd>{tierDefault?.cta_text?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-[#555]">Discount code</dt>
              <dd>
                {tierDefault?.discount_code
                  ? `${tierDefault.discount_code.code} (${tierDefault.discount_code.percent_off}%)`
                  : "None"}
              </dd>
            </div>
          </dl>
          {tierDefaultTrackedUrl ? (
            <p className="break-all font-mono text-[10px] text-[#9bf0c4]">{tierDefaultTrackedUrl}</p>
          ) : null}
          <button
            type="button"
            disabled={studioWriteBlocked || busy}
            data-testid="override-for-post"
            onClick={beginOverride}
            className="w-full rounded-lg border border-[#9bf0c43d] bg-[#9bf0c414] py-1.5 text-[11px] text-[#9bf0c4] disabled:opacity-40"
          >
            Override for this post
          </button>
        </div>
      ) : (
        <>
          {explicitOffer?.code_missing ? (
            <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100">
              Linked code is missing or was removed — reattach a code from your library.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-2 py-1.5 text-[10px] text-red-200">
              {error}
            </p>
          ) : null}
          <label className="block text-[10px] text-[#68706c]">
            Headline
            <input
              value={headline}
              maxLength={200}
              disabled={studioWriteBlocked || busy}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-[11px] text-[#e8eee9] disabled:opacity-40"
            />
          </label>
          <label className="block text-[10px] text-[#68706c]">
            CTA
            <input
              value={cta}
              maxLength={120}
              disabled={studioWriteBlocked || busy}
              onChange={(e) => setCta(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-[11px] text-[#e8eee9] disabled:opacity-40"
            />
          </label>
          <label className="block text-[10px] text-[#68706c]">
            Discount code
            <select
              value={codeId}
              disabled={studioWriteBlocked || busy}
              onChange={(e) => setCodeId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-[11px] text-[#e8eee9] disabled:opacity-40"
            >
              <option value="">None</option>
              {codes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} ({c.percent_off}%)
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] text-[#68706c]">
            Patreon destination (HTTPS)
            <input
              value={destinationUrl}
              disabled={studioWriteBlocked || busy}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://www.patreon.com/…"
              className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-[11px] text-[#e8eee9] disabled:opacity-40"
            />
          </label>
          {ok ? <p className="text-[10px] text-[#9bf0c4]">Offer saved for this persona.</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={studioWriteBlocked || busy}
              onClick={() => void save()}
              className="min-w-0 flex-1 rounded-lg border border-[#9bf0c43d] bg-[#9bf0c414] py-1.5 text-[11px] text-[#9bf0c4] disabled:opacity-40"
            >
              {busy ? "Saving…" : editingOverride ? "Save override" : "Save offer for persona"}
            </button>
            {explicitOffer || overrideDraft ? (
              <button
                type="button"
                disabled={studioWriteBlocked || busy || !tierDefault}
                data-testid="return-to-default"
                title={tierDefault ? undefined : "No tier default to inherit"}
                onClick={() => void returnToDefault()}
                className="shrink-0 rounded-lg border border-[#2a302d] px-2.5 py-1.5 text-[11px] text-[#aab3ae] disabled:opacity-40"
              >
                Return to default
              </button>
            ) : null}
          </div>
          <div className="pt-2">
            <OfferTrackedLinkPanel
              key={explicitOffer?.id ?? selectedPersonaKey}
              creatorId={creatorId}
              postId={postId}
              offer={explicitOffer}
              studioWriteBlocked={studioWriteBlocked}
            />
          </div>
          {effectiveSource === "none" && !overrideDraft ? (
            <button
              type="button"
              disabled={studioWriteBlocked || busy}
              data-testid="override-for-post"
              onClick={beginOverride}
              className="w-full rounded-lg border border-[#2a302d] py-1.5 text-[11px] text-[#aab3ae] disabled:opacity-40"
            >
              Override for this post
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
