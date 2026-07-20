"use client";

import { Eye, Info, TicketPercent, TrendingUp, Users, WalletCards } from "lucide-react";
import type { PromotionHubSummary } from "@/lib/relay-api";

export type PromoPerformancePanelProps = {
  summary: PromotionHubSummary | null;
  pieceCount: number;
  activeCodeCount: number;
};

type Kpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
  icon: typeof Eye;
  emphasize?: boolean;
};

/**
 * Cumulative performance overview — secondary to the Promo Pool hero.
 * Does not invent attributed views/earnings; those stay unavailable until
 * conversion ingestion owns real numbers.
 */
export default function PromoPerformancePanel({
  summary,
  pieceCount,
  activeCodeCount
}: PromoPerformancePanelProps) {
  const matchedRules =
    summary?.rules.filter((r) => r.inherited_piece_count > 0).length ?? 0;
  const unmatched =
    (summary?.unmatched.missing_post_count ?? 0) +
    (summary?.unmatched.public_or_ungated_count ?? 0) +
    (summary?.unmatched.no_matching_default_count ?? 0);

  const kpis: Kpi[] = [
    {
      id: "views",
      label: "Promo views",
      value: "—",
      hint: "Attributed impressions are not wired yet. Per-piece health will surface first.",
      icon: Eye
    },
    {
      id: "clicks",
      label: "Offer clicks",
      value: "—",
      hint: "Tracked offer clicks land here once placement and conversion ingestion ship.",
      icon: TrendingUp
    },
    {
      id: "members",
      label: "New members",
      value: "—",
      hint: "Member conversions attributed to promo pieces are not ingested yet.",
      icon: Users
    },
    {
      id: "earnings",
      label: "Promo earnings",
      value: "—",
      hint: "Earnings stay unavailable until Patreon conversion attribution exists.",
      icon: WalletCards,
      emphasize: true
    }
  ];

  return (
    <section className="flex flex-col gap-6" data-promos-performance>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a928e]">
          Performance overview
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#e8eee9]">
          Cumulative pool summary
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[#8a928e]">
          Pool-wide totals live here. Day-to-day work stays on each promo piece in the
          pool — open a card to inspect individual health.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article
            key={kpi.id}
            className={`rounded-2xl border p-4 ${
              kpi.emphasize
                ? "border-[#00AA6F]/35 bg-[#00AA6F]/[0.06]"
                : "border-[#24332c] bg-[#0e1411]/70"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`flex size-8 items-center justify-center rounded-lg border ${
                    kpi.emphasize
                      ? "border-[#00AA6F]/30 bg-[#00AA6F]/10 text-[#9bf0c4]"
                      : "border-[#24332c] bg-[#101815] text-[#8fa39b]"
                  }`}
                >
                  <kpi.icon className="size-4" aria-hidden />
                </div>
                <p className="text-[12px] text-[#8a928e]">{kpi.label}</p>
              </div>
              <span
                className="rounded-md text-[#68706c]"
                title={kpi.hint}
                aria-label={kpi.hint}
              >
                <Info className="size-3.5" aria-hidden />
              </span>
            </div>
            <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[#e8eee9]">
              {kpi.value}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-[#68706c]">{kpi.hint}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-[#24332c] bg-[#0e1411]/70 p-4">
          <p className="text-[12px] text-[#8a928e]">Active promo pieces</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[#e8eee9]">
            {pieceCount}
            <span className="text-base text-[#68706c]"> / 5</span>
          </p>
        </article>
        <article className="rounded-2xl border border-[#24332c] bg-[#0e1411]/70 p-4">
          <p className="text-[12px] text-[#8a928e]">Tier rules covering pieces</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[#e8eee9]">
            {matchedRules}
          </p>
        </article>
        <article className="rounded-2xl border border-[#24332c] bg-[#0e1411]/70 p-4">
          <div className="flex items-center gap-2">
            <TicketPercent className="size-4 text-[#9bf0c4]" aria-hidden />
            <p className="text-[12px] text-[#8a928e]">Active discount codes</p>
          </div>
          <p className="mt-1 font-mono text-2xl font-semibold text-[#e8eee9]">
            {activeCodeCount}
          </p>
          {unmatched > 0 ? (
            <p className="mt-2 text-[11px] text-amber-200/90">
              {unmatched} pool piece{unmatched === 1 ? "" : "s"} without a matching
              tier default.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-[#68706c]">
              Structural coverage from your current hub state.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
