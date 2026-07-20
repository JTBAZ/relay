"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GalleryItem } from "@/lib/relay-api";
import {
  fetchAudienceSimulation,
  listPostMarketingOffers,
  patchPostPresentation,
  type AudienceSimulationEnvelope,
  type PostMarketingOfferRecord
} from "@/lib/relay-api";
import type { AudiencePersonaKey, PreviewTreatment } from "@/lib/audience-promotion-contracts";
import {
  outcomeLabel,
  parseTierPreviewSettingsClient,
  personasFromSimulationEnvelope,
  type SimulatorPersonaOption
} from "@/lib/audience-simulation-client";
import AudienceSimulatorPreviewCard from "@/app/components/studio/AudienceSimulatorPreviewCard";

const PREVIEW_STYLES: Array<{ id: PreviewTreatment; label: string }> = [
  { id: "default", label: "Default" },
  { id: "partial-unblur", label: "Partial unblur" },
  { id: "free-cta", label: "Free + CTA" },
  { id: "partial-unlock", label: "Partial unlock" }
];

type Props = {
  creatorId: string;
  postId: string;
  selectedItem: GalleryItem | null;
  postTitle: string;
  studioWriteBlocked: boolean;
  onRefresh: () => Promise<void>;
  /** Controlled persona selection shared with Promotion Studio. */
  personaKey?: AudiencePersonaKey;
  onPersonaChange?: (key: AudiencePersonaKey) => void;
  onPersonasLoaded?: (personas: Array<{ persona_key: AudiencePersonaKey; label: string }>) => void;
  offerRefreshToken?: number;
};

export default function AudienceSimulatorSection({
  creatorId,
  postId,
  selectedItem,
  postTitle,
  studioWriteBlocked,
  onRefresh,
  personaKey: controlledPersona,
  onPersonaChange,
  onPersonasLoaded,
  offerRefreshToken = 0
}: Props) {
  const [envelope, setEnvelope] = useState<AudienceSimulationEnvelope | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [internalPersona, setInternalPersona] = useState<AudiencePersonaKey>("anonymous");
  const personaKey = controlledPersona ?? internalPersona;
  const setPersonaKey = (key: AudiencePersonaKey) => {
    setInternalPersona(key);
    onPersonaChange?.(key);
  };
  const [previewStyle, setPreviewStyle] = useState<PreviewTreatment>("default");
  const [ctaText, setCtaText] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [activeOffer, setActiveOffer] = useState<PostMarketingOfferRecord | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAudienceSimulation({
        relayCreatorId: creatorId,
        postId
      });
      setEnvelope(data);
      const personas = personasFromSimulationEnvelope(data);
      onPersonasLoaded?.(personas.map((p) => ({ persona_key: p.persona_key, label: p.label })));
      setInternalPersona((prev) => {
        const current = controlledPersona ?? prev;
        const next = personas.some((p) => p.persona_key === current)
          ? current
          : (personas[0]?.persona_key ?? "anonymous");
        if (next !== current) onPersonaChange?.(next);
        return next;
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setEnvelope(null);
    } finally {
      setLoading(false);
    }
    // controlledPersona / onPersonaChange read at call time; reload on post identity only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, postId, onPersonasLoaded]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const offers = await listPostMarketingOffers({ creatorId, postId });
        if (cancelled) return;
        setActiveOffer(
          offers.find((o) => o.audience_key === personaKey && o.active) ?? null
        );
      } catch {
        if (!cancelled) setActiveOffer(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId, postId, personaKey, offerRefreshToken]);

  const personas: SimulatorPersonaOption[] = useMemo(
    () => (envelope ? personasFromSimulationEnvelope(envelope) : []),
    [envelope]
  );

  const active = personas.find((p) => p.persona_key === personaKey) ?? personas[0] ?? null;

  useEffect(() => {
    if (!envelope || !active) return;
    const settings = parseTierPreviewSettingsClient(envelope.tier_preview_settings);
    const saved = settings?.personas[active.persona_key];
    setPreviewStyle(saved?.preview_style ?? "default");
    setCtaText(saved?.cta_text ?? "");
    setSaveOk(false);
    setSaveError(null);
  }, [active?.persona_key, envelope]);

  const savePersonaSettings = async () => {
    if (!active || studioWriteBlocked || saveBusy) return;
    setSaveBusy(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const existing = parseTierPreviewSettingsClient(envelope?.tier_preview_settings) ?? {
        schema_version: 1 as const,
        personas: {}
      };
      const next = {
        schema_version: 1 as const,
        personas: {
          ...existing.personas,
          [active.persona_key]: {
            preview_style: previewStyle,
            cta_text: ctaText.slice(0, 120)
          }
        }
      };
      await patchPostPresentation({
        relayCreatorId: creatorId,
        postId,
        tier_preview_settings: next
      });
      await onRefresh();
      await reload();
      setSaveOk(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-audience-simulator-section>
      {loading ? (
        <p className="px-3 text-[11px] text-[#555]">Loading viewer simulation…</p>
      ) : null}
      {loadError ? (
        <p className="mx-3 rounded-lg border border-red-800/50 bg-red-950/40 px-2 py-1.5 text-[10px] text-red-200">
          {loadError}
        </p>
      ) : null}

      {personas.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3">
          {personas.map((p) => {
            const selected = p.persona_key === (active?.persona_key ?? personaKey);
            return (
              <button
                key={p.persona_key}
                type="button"
                onClick={() => setPersonaKey(p.persona_key)}
                className="rounded-full border px-2.5 py-1 text-[10px] transition-colors"
                style={{
                  borderColor: selected ? "#9bf0c43d" : "#2a2a2a",
                  background: selected ? "#9bf0c414" : "transparent",
                  color: selected ? "#9bf0c4" : "#8a928e"
                }}
                title={p.reason}
              >
                {p.label}
                <span className="ml-1 text-[#555]">· {outcomeLabel(p.outcome)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {active ? (
        <div className="px-3">
          <AudienceSimulatorPreviewCard
            item={selectedItem}
            title={postTitle}
            personaLabel={active.label}
            outcome={active.outcome}
            previewStyle={previewStyle}
            ctaText={ctaText}
            effectivePromo={active.effective_promo ?? null}
          />
        </div>
      ) : null}

      {active?.effective_promo ? (
        <div
          className="mx-3 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] px-3 py-2"
          data-simulator-active-offer
          data-promo-source={active.effective_promo.source}
        >
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#555]">
            Effective promo ·{" "}
            {active.effective_promo.source === "explicit" ? "override" : "tier default"}
          </p>
          <p className="mt-1 text-[11px] text-[#e8eee9]">
            {active.effective_promo.headline || "Untitled promo"}
          </p>
          {active.effective_promo.cta_text ? (
            <p className="text-[10px] text-[#9bf0c4]">{active.effective_promo.cta_text}</p>
          ) : null}
          {active.effective_promo.code ? (
            <p className="mt-1 text-[10px] text-[#68706c]">
              {active.effective_promo.code}
              {active.effective_promo.percent_off != null
                ? ` · ${active.effective_promo.percent_off}% off`
                : ""}
            </p>
          ) : null}
        </div>
      ) : activeOffer ? (
        <div
          className="mx-3 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] px-3 py-2"
          data-simulator-active-offer
        >
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#555]">
            Active offer for this persona
          </p>
          <p className="mt-1 text-[11px] text-[#e8eee9]">
            {activeOffer.headline || "Untitled offer"}
          </p>
          {activeOffer.cta_text ? (
            <p className="text-[10px] text-[#9bf0c4]">{activeOffer.cta_text}</p>
          ) : null}
          {activeOffer.code_missing ? (
            <p className="mt-1 text-[10px] text-amber-200/90">Linked code missing</p>
          ) : activeOffer.discount_code ? (
            <p className="mt-1 text-[10px] text-[#68706c]">
              {activeOffer.discount_code.code} · {activeOffer.discount_code.percent_off}% off
              {!activeOffer.discount_code.active ? " (inactive)" : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 px-3">
        <p className="text-[10px] text-[#6a726e]">
          Preview treatment &amp; CTA for this persona (saved on the post). Simulation reads still
          work when sync blocks writes.
        </p>
        <label className="block text-[10px] text-[#68706c]">
          Style
          <select
            value={previewStyle}
            disabled={studioWriteBlocked || saveBusy || !active}
            onChange={(e) => setPreviewStyle(e.target.value as PreviewTreatment)}
            className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-[11px] text-[#e8eee9] disabled:opacity-40"
          >
            {PREVIEW_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] text-[#68706c]">
          CTA text
          <input
            type="text"
            value={ctaText}
            maxLength={120}
            disabled={studioWriteBlocked || saveBusy || !active}
            onChange={(e) => setCtaText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-[11px] text-[#e8eee9] disabled:opacity-40"
            placeholder="Optional upgrade line"
          />
        </label>
        {studioWriteBlocked ? (
          <p className="text-[10px] text-amber-200/90">
            Sync blocked — you can still simulate viewers; saving treatments is disabled.
          </p>
        ) : null}
        {saveError ? <p className="text-[10px] text-red-300">{saveError}</p> : null}
        {saveOk ? <p className="text-[10px] text-[#9bf0c4]">Saved for this persona.</p> : null}
        <button
          type="button"
          disabled={studioWriteBlocked || saveBusy || !active}
          onClick={() => void savePersonaSettings()}
          className="w-full rounded-lg border border-[#9bf0c43d] bg-[#9bf0c414] py-1.5 text-[11px] text-[#9bf0c4] disabled:opacity-40"
        >
          {saveBusy ? "Saving…" : "Save preview settings"}
        </button>
      </div>
    </div>
  );
}
