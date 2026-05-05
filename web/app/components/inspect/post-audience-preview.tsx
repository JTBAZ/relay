"use client";

import { useState } from "react";
import { BarChart3, ChevronDown, Lock, MousePointerClick, Save, Sparkles, Users } from "lucide-react";
import type { GalleryItem, GalleryPostDetail, TierFacet } from "@/lib/relay-api";
import { InspectAssetPreview } from "./inspect-asset-preview";

export type PreviewStyle = "default" | "partial-unblur" | "free-cta" | "partial-unlock";
export type AudiencePreviewPreference = {
  previewStyle: PreviewStyle;
  ctaText: string;
  locked: boolean;
};

type AudienceOption = {
  id: string;
  label: string;
  amountCents?: number;
};

type Metrics = {
  views: number;
  discoveryTips: number;
  conversions: number;
};

const FALLBACK_AUDIENCES: AudienceOption[] = [
  { id: "free", label: "Free", amountCents: 0 },
  { id: "basic", label: "Basic", amountCents: 500 },
  { id: "advanced", label: "Advanced", amountCents: 1200 },
  { id: "goku", label: "Goku Rank", amountCents: 2500 }
];

const PREVIEW_STYLES: Array<{ id: PreviewStyle; label: string; helper: string }> = [
  { id: "default", label: "Default Preview", helper: "Use the current lock treatment." },
  { id: "partial-unblur", label: "Partial Unblur", helper: "Show more of the image behind the gate." },
  { id: "free-cta", label: "Free + CTA", helper: "Give free viewers a stronger upgrade nudge." },
  { id: "partial-unlock", label: "Partial Unlock", helper: "Let lower tiers see a limited version." }
];

export function buildAudienceOptions(accessTiers: TierFacet[]): AudienceOption[] {
  const byLabel = new Map<string, AudienceOption>();
  for (const option of FALLBACK_AUDIENCES) byLabel.set(normalizeTierLabel(option.label), option);
  for (const tier of accessTiers) {
    const title = tier.title.trim();
    if (!title) continue;
    const normalized = normalizeTierLabel(title);
    const id = tier.tier_id || normalized;
    if (normalized === "public" || normalized === "all-patrons") continue;
    // Prefer ingested Patreon tiers over fallback mock tiers when labels match.
    byLabel.set(normalized, { id, label: title, amountCents: tier.amount_cents });
  }
  return Array.from(byLabel.values());
}

export function audienceCanView(item: GalleryItem, audienceId: string, options: AudienceOption[]): boolean {
  if (item.visibility === "hidden" || item.visibility === "review") return false;
  if (item.tier_ids.length === 0) return true;
  if (audienceId === "free") {
    return item.tier_ids.some((tierId) => isFreeAccessTierId(tierId, options));
  }
  const selected = options.find((option) => option.id === audienceId);
  if (!selected) return false;
  const selectedLabel = normalizeTierLabel(selected.label);
  const selectedAmount = selected.amountCents ?? 0;
  const exactMatch = item.tier_ids.some((tierId) => {
    const normalized = tierId.toLowerCase();
    const tierLabel = normalizeTierLabel(tierId);
    return (
      normalized === audienceId.toLowerCase() ||
      tierLabel === selectedLabel ||
      normalized.includes(selectedLabel.replace(/-/g, "_")) ||
      normalized.includes(selectedLabel)
    );
  });
  if (exactMatch) return true;

  const gatedAmounts = item.tier_ids
    .map((tierId) => {
      const normalizedId = tierId.toLowerCase();
      const normalizedLabel = normalizeTierLabel(tierId);
      return options.find((option) => {
        const optionLabel = normalizeTierLabel(option.label);
        return option.id.toLowerCase() === normalizedId || optionLabel === normalizedLabel;
      })?.amountCents;
    })
    .filter((amount): amount is number => typeof amount === "number" && amount > 0);

  if (gatedAmounts.length === 0) return false;
  return selectedAmount >= Math.min(...gatedAmounts);
}

export function PostAudiencePreviewCard({
  item,
  postDetail,
  audience,
  canView,
  previewStyle,
  ctaText
}: {
  item: GalleryItem;
  postDetail: GalleryPostDetail | null;
  audience: AudienceOption;
  canView: boolean;
  previewStyle: PreviewStyle;
  ctaText: string;
}) {
  const description = stripHtml(postDetail?.description || item.description || "");
  const lockedTreatment =
    previewStyle === "partial-unblur"
      ? "Preview is partially unblurred for this audience."
      : previewStyle === "partial-unlock"
        ? "A limited preview is unlocked for this audience."
        : previewStyle === "free-cta"
          ? "Upgrade call-to-action is emphasized."
          : "Standard locked preview is shown.";

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,#2b2118_0%,var(--lib-bg)_44%,#070605_100%)] p-4">
      <article className="w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-[color-mix(in_srgb,var(--lib-border)_80%,white_10%)] bg-[color-mix(in_srgb,var(--lib-card)_88%,black)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--lib-border)] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
              Patron feed preview
            </p>
            <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-[var(--lib-fg)]">
              {postDetail?.title ?? item.title}
            </h3>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
              canView
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                : "border-amber-400/40 bg-amber-400/10 text-amber-100"
            }`}
          >
            {canView ? "Visible" : "Locked"} for {audience.label}
          </span>
        </div>

        <div className="relative bg-black/35">
          <div className={canView ? "" : previewStyle === "partial-unblur" ? "blur-[2px]" : "blur-md opacity-75"}>
            <div className="flex min-h-[17rem] items-center justify-center p-3">
              <InspectAssetPreview item={item} />
            </div>
          </div>
          {!canView ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-6">
              <div className="max-w-sm rounded-2xl border border-white/15 bg-black/70 p-4 text-center shadow-xl backdrop-blur-md">
                <Lock className="mx-auto h-6 w-6 text-amber-200" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-white">Locked for {audience.label}</p>
                <p className="mt-1 text-xs leading-5 text-white/70">{lockedTreatment}</p>
                <button
                  type="button"
                  className="mt-3 rounded-full bg-[var(--lib-primary)] px-4 py-2 text-xs font-semibold text-[var(--lib-primary-fg)]"
                >
                  {ctaText || "Unlock this post"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 px-4 py-4">
          <p className="text-xs leading-5 text-[var(--lib-fg-muted)]">
            {description || "No post copy has been synced for this preview yet."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(postDetail?.tag_ids ?? item.tag_ids).slice(0, 5).map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--lib-muted)] px-2 py-1 text-[10px] text-[var(--lib-fg-muted)]">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}

export function AudiencePreviewControls({
  item,
  audienceOptions,
  activeAudienceId,
  onAudienceChange,
  previewStyle,
  onPreviewStyleChange,
  ctaText,
  onCtaTextChange,
  savedPreferences,
  onSavePreference
}: {
  item: GalleryItem;
  audienceOptions: AudienceOption[];
  activeAudienceId: string;
  onAudienceChange: (id: string) => void;
  previewStyle: PreviewStyle;
  onPreviewStyleChange: (style: PreviewStyle) => void;
  ctaText: string;
  onCtaTextChange: (value: string) => void;
  savedPreferences: Record<string, AudiencePreviewPreference>;
  onSavePreference: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const metrics = audienceOptions.map((audience, index) => ({
    audience,
    canView: audienceCanView(item, audience.id, audienceOptions),
    metrics: mockMetrics(item.post_id, audience.id, index)
  }));
  const active = audienceOptions.find((option) => option.id === activeAudienceId) ?? audienceOptions[0]!;
  const activeMetric = metrics.find((entry) => entry.audience.id === active.id)?.metrics ?? mockMetrics(item.post_id, active.id, 0);
  const totalMetrics = metrics.reduce(
    (total, entry) => ({
      views: total.views + entry.metrics.views,
      discoveryTips: total.discoveryTips + entry.metrics.discoveryTips,
      conversions: total.conversions + entry.metrics.conversions
    }),
    { views: 0, discoveryTips: 0, conversions: 0 }
  );
  const activePreference = savedPreferences[active.id];

  return (
    <div className="space-y-4 border-b border-[var(--lib-border)] px-4 py-4">
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
            View as audience
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {audienceOptions.map((audience) => {
            const canView = audienceCanView(item, audience.id, audienceOptions);
            const activeChip = audience.id === activeAudienceId;
            return (
              <button
                key={audience.id}
                type="button"
                onClick={() => onAudienceChange(audience.id)}
                title={canView ? "This audience can see the full post" : "This audience sees a locked preview"}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  activeChip
                    ? "border-[var(--lib-primary)] bg-[color-mix(in_srgb,var(--lib-primary)_22%,var(--lib-card))] text-[var(--lib-fg)]"
                    : "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                }`}
              >
                {audience.label}
                {savedPreferences[audience.id]?.locked ? <span className="ml-1 text-[var(--lib-primary)]">saved</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <MetricTile
          icon={BarChart3}
          label="Total Views"
          value={totalMetrics.views.toLocaleString()}
          subvalue={`${activeMetric.views.toLocaleString()} from ${active.label}`}
        />
        <MetricTile
          icon={Sparkles}
          label="Discovery Tips"
          value={totalMetrics.discoveryTips.toLocaleString()}
          subvalue={`${activeMetric.discoveryTips.toLocaleString()} from ${active.label}`}
        />
        <MetricTile
          icon={MousePointerClick}
          label="Conversions"
          value={totalMetrics.conversions.toLocaleString()}
          subvalue={`${activeMetric.conversions.toLocaleString()} from ${active.label}`}
        />
      </section>

      <section className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-muted)]/25">
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
          aria-expanded={settingsOpen}
        >
          <span className="min-w-0">
            <span className="block text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
              Tier preview settings
            </span>
            {activePreference?.locked ? (
              <span className="mt-1 block text-[10px] text-[var(--lib-primary)]">Saved for {active.label}</span>
            ) : null}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--lib-fg-muted)] transition-transform ${settingsOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        <div
          className={`grid transition-all duration-300 ease-out ${
            settingsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-4 border-t border-[var(--lib-border)] px-3 pb-3 pt-3">
            <button
              type="button"
              onClick={onSavePreference}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lib-primary)]/45 bg-[color-mix(in_srgb,var(--lib-primary)_16%,var(--lib-card))] px-3 py-1.5 text-xs font-semibold text-[var(--lib-fg)] hover:border-[var(--lib-primary)]"
            >
              <Save className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
              Save {active.label} Preference
            </button>

            <div>
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
                Preview style
              </p>
              <div className="space-y-1.5">
                {PREVIEW_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => onPreviewStyleChange(style.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      previewStyle === style.id
                        ? "border-[var(--lib-primary)]/60 bg-[color-mix(in_srgb,var(--lib-primary)_14%,var(--lib-card))]"
                        : "border-[var(--lib-border)] bg-[var(--lib-muted)] hover:border-[var(--lib-primary)]/45"
                    }`}
                  >
                    <span className="block text-xs font-medium text-[var(--lib-fg)]">{style.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-[var(--lib-fg-muted)]">{style.helper}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
                Call to action
                <input
                  value={ctaText}
                  onChange={(event) => onCtaTextChange(event.target.value)}
                  placeholder="Unlock this post"
                  className="mt-2 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-xs normal-case tracking-normal text-[var(--lib-fg)] outline-none placeholder:text-[var(--lib-fg-muted)] focus:border-[var(--lib-primary)]"
                />
              </label>
            </div>
          </div>
          </div>
        </div>
      </section>

    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  subvalue
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  subvalue: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-muted)]/45 p-2">
      <Icon className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
      <p className="mt-2 text-sm font-semibold tabular-nums text-[var(--lib-fg)]">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">{label}</p>
      <p className="mt-1 text-[9px] leading-3 text-[var(--lib-primary)]">{subvalue}</p>
    </div>
  );
}

function mockMetrics(postId: string, audienceId: string, index: number): Metrics {
  const seed = Array.from(`${postId}:${audienceId}`).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const base = 220 + ((seed * (index + 3)) % 1300);
  return {
    views: base,
    discoveryTips: Math.max(3, Math.round(base * (0.025 + index * 0.012))),
    conversions: Math.max(1, Math.round(base * (0.006 + index * 0.003)))
  };
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeTierLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^patreon_tier_/, "")
    .replace(/^relay_tier_/, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isFreeAccessTierId(tierId: string, options: AudienceOption[]): boolean {
  const normalizedId = tierId.trim().toLowerCase();
  const normalizedLabel = normalizeTierLabel(tierId);
  if (
    normalizedId === "free" ||
    normalizedLabel === "free" ||
    normalizedLabel === "public" ||
    normalizedLabel === "all-patrons" ||
    normalizedId.includes("relay_tier_public") ||
    normalizedId.includes("relay_tier_all_patrons")
  ) {
    return true;
  }
  const matched = options.find((option) => {
    const optionLabel = normalizeTierLabel(option.label);
    return option.id.toLowerCase() === normalizedId || optionLabel === normalizedLabel;
  });
  return (matched?.amountCents ?? Number.POSITIVE_INFINITY) <= 0;
}
