"use client";

import {
  ArrowRight,
  FileText,
  Headphones,
  ImageIcon,
  Lock,
  Sparkles,
  Video,
} from "lucide-react";
import { formatFeedPublishedDate } from "@/lib/format-feed-published-date";
import type {
  PatronSearchHit,
  PatronSearchMatchField,
  PatronSearchMediaType,
} from "@/lib/patron-search-api";

const MEDIA_META: Record<
  PatronSearchMediaType,
  { label: string; icon: typeof FileText }
> = {
  writing: { label: "Writing", icon: FileText },
  photo: { label: "Photo", icon: ImageIcon },
  audio: { label: "Audio", icon: Headphones },
  video: { label: "Video", icon: Video },
};

function normalizeTierLabel(label: string): string {
  return label.trim().toLowerCase();
}

function tierChipClassName(label: string): string {
  if (normalizeTierLabel(label) === "free") {
    return "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#0D1F17] text-[#2D6A4F] border border-[#1B4332]/50 shrink-0";
  }
  return "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#0D1F17] text-[#40916C] border border-[#1B4332]/70 shrink-0";
}

function relativePublishedLabel(raw: string): string {
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return raw;
  const diffMs = Date.now() - time;
  if (diffMs < 60_000) return "Just now";
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) return `${Math.max(1, diffHours)}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  return formatFeedPublishedDate(raw);
}

const MATCH_FIELD_LABELS: Partial<Record<PatronSearchMatchField, string>> = {
  title: "Title",
  tag: "Tag",
  description: "Description",
  theme_tag: "Theme",
  creator: "Creator",
};

function matchFieldLabels(fields: PatronSearchMatchField[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const field of fields) {
    const label = MATCH_FIELD_LABELS[field];
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

type PatronSearchRowProps = {
  hit: PatronSearchHit;
  onSelect: (hit: PatronSearchHit) => void;
};

/** Accessible hit — compact feed-card body + classic thumbnail. */
export function PatronSearchAccessibleRow({ hit, onSelect }: PatronSearchRowProps) {
  const meta = MEDIA_META[hit.media_type] ?? MEDIA_META.writing;
  const Icon = meta.icon;
  const tierLabel = hit.tier_label?.trim() || "Free";
  const matchLabels = matchFieldLabels(hit.match_fields);
  const hasCover = Boolean(hit.cover_url_path);

  return (
    <button
      type="button"
      onClick={() => onSelect(hit)}
      className="group w-full rounded-lg text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D6A4F]/60"
      aria-label={`Open ${hit.title} by ${hit.creator.display_name}`}
    >
      <article className="rounded-lg border border-[#242424] bg-[#161616] p-3 transition-colors duration-150 group-hover:border-[#2E2E2E]">
        <div className="mb-2.5 flex items-center gap-2.5 min-w-0">
          <img
            src={hit.creator.avatar_url}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full bg-[#2A2A2A] object-cover ring-1 ring-[#2A2A2A]"
            width={32}
            height={32}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-[#F0F0F0]">
                {hit.creator.display_name}
              </span>
              <span className={tierChipClassName(tierLabel)} aria-label={`Tier: ${tierLabel}`}>
                <span className="inline-block h-1 w-1 rounded-full bg-[#2D6A4F]" aria-hidden="true" />
                {tierLabel}
              </span>
            </div>
            <p className="truncate text-[11px] text-[#555555]">@{hit.creator.handle}</p>
          </div>
          <time
            className="shrink-0 text-[11px] text-[#444444] whitespace-nowrap"
            dateTime={hit.published_at}
          >
            {formatFeedPublishedDate(hit.published_at)}
          </time>
        </div>

        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="mb-1 line-clamp-2 text-[15px] font-semibold leading-snug text-[#F0F0F0] text-balance">
              {hit.title}
            </h3>
            {hit.excerpt ? (
              <p className="line-clamp-2 text-xs leading-relaxed text-[#5A5A5A]">{hit.excerpt}</p>
            ) : null}
          </div>

          {hasCover ? (
            <div
              className="h-[68px] w-[96px] shrink-0 overflow-hidden rounded-md bg-[#2A2A2A]"
              aria-hidden="true"
            >
              <img
                src={hit.cover_url_path!}
                alt=""
                className="h-full w-full object-cover opacity-85 transition-opacity duration-150 group-hover:opacity-100"
                width={96}
                height={68}
              />
            </div>
          ) : (
            <div
              className="flex h-[68px] w-[96px] shrink-0 items-center justify-center rounded-md border border-[#222222] bg-[#1A1A1A] text-[#4B5563]"
              aria-hidden="true"
            >
              <Icon size={18} />
            </div>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[#1C1C1C] pt-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-[#444444]">
            <Icon size={11} aria-hidden="true" />
            {meta.label}
          </span>
          {matchLabels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-[#1B4332]/40 bg-[#0D1F17]/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#40916C]"
            >
              {label}
            </span>
          ))}
        </div>
      </article>
    </button>
  );
}

/** Locked hit — what-you-missed carousel card styling (title-only, tier upsell). */
export function PatronSearchLockedRow({ hit, onSelect }: PatronSearchRowProps) {
  const meta = MEDIA_META[hit.media_type] ?? MEDIA_META.writing;
  const Icon = meta.icon;
  const tierName = hit.tier_label.trim() || "Paid";
  const unlockCta = `Unlock at ${tierName} Tier`;

  return (
    <button
      type="button"
      onClick={() => onSelect(hit)}
      className="group w-full rounded-xl text-left transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B358]/60"
      aria-label={`${unlockCta}: ${hit.title}`}
    >
      <article
        className={[
          "rounded-xl border border-[#352C1B] p-3",
          "bg-[linear-gradient(180deg,rgba(24,20,14,0.96),rgba(15,15,15,0.96))]",
          "transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-[#5B4A28]",
          "shadow-[0_8px_24px_rgba(0,0,0,0.22)] group-hover:shadow-[0_12px_32px_rgba(0,0,0,0.3)]",
        ].join(" ")}
      >
        <div className="flex items-center gap-2.5">
          <img
            src={hit.creator.avatar_url}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full border border-[#3B3322] bg-[#1D1D1D] object-cover"
            width={32}
            height={32}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-[#E5E7EB]">{hit.creator.display_name}</p>
            <p className="truncate text-[11px] text-[#6B7280]">@{hit.creator.handle}</p>
          </div>
          <Lock size={13} className="shrink-0 text-[#C5B358]" aria-hidden="true" />
        </div>

        <div className="mt-3 flex h-[52px] items-center rounded-xl border border-[#2E2617] bg-[radial-gradient(circle_at_10%_0%,rgba(197,179,88,0.13),transparent_42%),#17130D] px-3 transition-colors group-hover:border-[#4A3C23]">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-[#D6D3C6]">{hit.title}</p>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#2C3F33] bg-[#0D1F17]/80 px-2 py-0.5 font-medium text-[#9BC7AF]">
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {meta.label}
          </span>
          <span className="rounded-full border border-[#4A3C23] bg-[#1A150D] px-2 py-0.5 font-medium text-[#C5B358]">
            Tier: {tierName} required
          </span>
          <span className="text-[#6B7280]">{relativePublishedLabel(hit.published_at)}</span>
        </div>

        <div className="mt-2.5 flex items-center justify-between rounded-lg border border-[#4A3C23] bg-[#21190D] px-2.5 py-1.5 text-[11px] font-semibold text-[#F2DF8A] transition-colors group-hover:border-[#C5B358]/70 group-hover:bg-[#2A210F]">
          <span>{unlockCta}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </div>
      </article>
    </button>
  );
}

type PatronSearchResultSectionProps = {
  variant: "accessible" | "locked";
  label: string;
  count?: number;
  children: React.ReactNode;
};

export function PatronSearchResultSection({
  variant,
  label,
  count,
  children,
}: PatronSearchResultSectionProps) {
  if (variant === "locked") {
    return (
      <section
        className="mb-2 rounded-xl border border-[#302817] bg-[radial-gradient(circle_at_12%_0%,rgba(197,179,88,0.08),transparent_34%),#0E0D0B] p-2"
        aria-label={label}
      >
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-[#C5B358]" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C5B358]">
              {label}
            </span>
          </div>
          {count != null ? (
            <span className="text-[10px] text-[#7A7A72]">
              {count} {count === 1 ? "post" : "posts"}
            </span>
          ) : null}
        </div>
        <div className="space-y-2">{children}</div>
      </section>
    );
  }

  return (
    <section className="mb-2" aria-label={label}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="text-[10px] uppercase tracking-widest font-medium text-[#3D3D3D]">
          {label}
        </span>
        {count != null ? (
          <span className="text-[10px] text-[#333333]">
            {count} {count === 1 ? "post" : "posts"}
          </span>
        ) : null}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
