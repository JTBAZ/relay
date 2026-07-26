"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Megaphone, RefreshCw } from "lucide-react";
import DiscountCodeLibraryPanel from "@/app/components/studio/DiscountCodeLibraryPanel";
import { useStudioSession } from "@/lib/studio-session-context";
import {
  fetchCreatorPromoSlots,
  fetchPromotionHubSummary,
  fetchRelayComposeTiers,
  listCreatorDiscountCodes,
  listCreatorTierPromotionDefaults,
  type CreatorDiscountCodeRecord,
  type CreatorPromoSlotRow,
  type PromotionHubSummary,
  type RelayComposeTierRow,
  type TierPromotionDefaultRecord
} from "@/lib/relay-api";
import PromoPiecesPanel from "./PromoPiecesPanel";
import PromoPerformancePanel from "./PromoPerformancePanel";
import PromoPreviewPanel from "./PromoPreviewPanel";
import TierRulesPanel from "./TierRulesPanel";
import { emptyTierRuleDraft, type TierRuleDraft } from "./tier-rule-model";

/** Pool is the hero. Performance is the cumulative secondary surface. */
type HubTab = "pool" | "performance" | "rules" | "codes" | "preview";

export default function PromosHubView() {
  const { creatorId, ready } = useStudioSession();
  const searchParams = useSearchParams();
  const deepLinkPostId = searchParams.get("post_id")?.trim() || null;

  const [tab, setTab] = useState<HubTab>(deepLinkPostId ? "preview" : "pool");
  const [slots, setSlots] = useState<CreatorPromoSlotRow[]>([]);
  const [tiers, setTiers] = useState<RelayComposeTierRow[]>([]);
  const [defaults, setDefaults] = useState<TierPromotionDefaultRecord[]>([]);
  const [codes, setCodes] = useState<CreatorDiscountCodeRecord[]>([]);
  const [hubSummary, setHubSummary] = useState<PromotionHubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy] = useState(false);

  const [selectedPromoPieceId, setSelectedPromoPieceId] = useState<string | null>(
    null
  );
  const [ruleDraft, setRuleDraft] = useState<TierRuleDraft>(emptyTierRuleDraft());
  /** When set, successful code create returns to Tier Rules and preselects the new code. */
  const [returnToRulesAfterCode, setReturnToRulesAfterCode] = useState(false);

  const reload = useCallback(async () => {
    if (!creatorId) return;
    setLoading(true);
    setError(null);
    try {
      const [slotsData, tiersData, defaultsData, codesData, summaryData] = await Promise.all([
        fetchCreatorPromoSlots(),
        fetchRelayComposeTiers(creatorId),
        listCreatorTierPromotionDefaults(creatorId),
        listCreatorDiscountCodes(creatorId),
        fetchPromotionHubSummary().catch(() => null)
      ]);
      setSlots(slotsData.slots ?? []);
      setTiers(tiersData.tiers ?? []);
      setDefaults(defaultsData);
      setCodes(Array.isArray(codesData) ? codesData : []);
      setHubSummary(summaryData);
      setRuleDraft((prev) => {
        if (prev.gate_relay_tier_id) return prev;
        const first = tiersData.tiers?.[0];
        return emptyTierRuleDraft((first?.relay_tier_id || first?.tier_id || "").trim());
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load promos hub.");
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    if (!ready || !creatorId) return;
    void reload();
  }, [ready, creatorId, reload]);

  useEffect(() => {
    if (!selectedPromoPieceId) return;
    if (!slots.some((s) => s.promo_piece_id === selectedPromoPieceId)) {
      setSelectedPromoPieceId(null);
    }
  }, [slots, selectedPromoPieceId]);

  const refreshSummary = useCallback(async () => {
    try {
      const summaryData = await fetchPromotionHubSummary();
      setHubSummary(summaryData);
    } catch {
      /* non-fatal — cards fall back to zero counts */
    }
  }, []);

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--lib-fg-muted)]">
        Loading session…
      </div>
    );
  }
  if (!creatorId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--lib-fg-muted)]">
        Sign in with a creator studio to manage promos.
      </div>
    );
  }

  const primaryTabs: Array<{ id: HubTab; label: string }> = [
    { id: "pool", label: "Promo pool" },
    { id: "performance", label: "Performance" }
  ];
  const secondaryTabs: Array<{ id: HubTab; label: string }> = [
    { id: "rules", label: "Tier rules" },
    { id: "codes", label: "Codes" },
    { id: "preview", label: "Preview" }
  ];

  const activeCodeCount = codes.filter((c) => c.active).length;

  return (
    <div
      className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      data-promos-hub
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1a2620] pb-6">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6a8f7c]">
            <Megaphone size={14} aria-hidden />
            Promos
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[#e8eee9] sm:text-4xl">
            Promo pool
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#8a928e]">
            Watch what each piece is doing. Open a card to inspect health; switch to
            Performance only when you want the cumulative summary.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#24332c] bg-[#0e1411] px-3 py-1.5 text-[11px] text-[#9bf0c4]"
        >
          <RefreshCw size={12} aria-hidden />
          Refresh
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-1.5 rounded-full border border-[#1a2620] bg-[#070a09] p-1"
          role="tablist"
          aria-label="Promos primary"
        >
          {primaryTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setReturnToRulesAfterCode(false);
                setTab(t.id);
              }}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                tab === t.id
                  ? "bg-[#00AA6F] text-[#03120d]"
                  : "text-[#8fa39b] hover:bg-[#101815] hover:text-[#E0E0E0]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap gap-1.5 rounded-full border border-[#1a2620]/80 bg-transparent p-1"
          role="tablist"
          aria-label="Promos setup"
        >
          {secondaryTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                if (t.id !== "codes") setReturnToRulesAfterCode(false);
                setTab(t.id);
              }}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                tab === t.id
                  ? "bg-[#1a2620] text-[#E0E0E0]"
                  : "text-[#68706c] hover:bg-[#101815] hover:text-[#8fa39b]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-[12px] text-red-200">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-[#68706c]">Loading…</p>
      ) : null}

      {tab === "pool" ? (
        <PromoPiecesPanel
          creatorId={creatorId}
          slots={slots}
          busy={busy}
          hero
          onInspectPiece={(promoPieceId) => {
            setSelectedPromoPieceId(promoPieceId);
            setTab("preview");
          }}
          onSlotsChange={(next) => {
            setSlots(next);
            void refreshSummary();
          }}
          onError={setError}
        />
      ) : null}

      {tab === "performance" ? (
        <PromoPerformancePanel
          summary={hubSummary}
          pieceCount={slots.length}
          activeCodeCount={activeCodeCount}
        />
      ) : null}

      {tab === "rules" ? (
        <TierRulesPanel
          creatorId={creatorId}
          tiers={tiers}
          defaults={defaults}
          codes={codes}
          summary={hubSummary}
          draft={ruleDraft}
          onDraftChange={setRuleDraft}
          onDefaultsChange={(next) => {
            setDefaults(next);
            void refreshSummary();
          }}
          onError={setError}
          onAddCode={() => {
            setReturnToRulesAfterCode(true);
            setTab("codes");
          }}
          onPreviewPiece={(promoPieceId) => {
            setSelectedPromoPieceId(promoPieceId);
            setTab("preview");
          }}
        />
      ) : null}

      {tab === "codes" ? (
        <section data-promos-codes>
          <DiscountCodeLibraryPanel
            creatorId={creatorId}
            studioWriteBlocked={false}
            codes={codes}
            usageSummaries={hubSummary?.code_usage}
            onCodesChanged={setCodes}
            onCodeCreated={(row) => {
              setCodes((prev) =>
                [...prev.filter((c) => c.id !== row.id), row].sort((a, b) =>
                  a.code.localeCompare(b.code)
                )
              );
              setRuleDraft((d) => ({ ...d, discount_code_id: row.id }));
              void refreshSummary();
              if (returnToRulesAfterCode) {
                setReturnToRulesAfterCode(false);
                setTab("rules");
              }
            }}
            onCodeUpdated={(row) => {
              setCodes((prev) =>
                [...prev.filter((c) => c.id !== row.id), row].sort((a, b) =>
                  a.code.localeCompare(b.code)
                )
              );
              void refreshSummary();
            }}
          />
        </section>
      ) : null}

      {tab === "preview" ? (
        <PromoPreviewPanel
          creatorId={creatorId}
          slots={slots}
          summary={hubSummary}
          defaults={defaults}
          codes={codes}
          selectedPromoPieceId={selectedPromoPieceId}
          deepLinkPostId={deepLinkPostId}
          onSelectPromoPieceId={setSelectedPromoPieceId}
        />
      ) : null}
    </div>
  );
}
