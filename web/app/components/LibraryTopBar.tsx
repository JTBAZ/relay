"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight, Eye, RefreshCw, Users } from "lucide-react";

type SyncStatus = "synced" | "syncing" | "error";

type Props = {
  /** Relay chosen display name (account setup); always the main title — not the Patreon URL slug. */
  creatorDisplayName?: string;
  /** Patreon campaign vanity (lowercase). When set, a `patreon.com/…` link is shown under the title. */
  patreonName?: string;
  syncStatus?: SyncStatus;
  /** One-line detail under the title row when sync needs attention (from GET sync-state health). */
  syncIssueDetail?: string;
  /** From Patreon campaign snapshot after sync (GET sync-state `campaign_display`). */
  patronCount?: number;
  /** Patreon campaign profile image URL (`image_small_url`). */
  campaignImageSmallUrl?: string;
  /** Patreon campaign banner URL (`image_url`); small badge beside the name row, whole image visible (letterboxed). */
  campaignBannerUrl?: string;
  /** Monthly revenue placeholder (e.g. display dollars when wired) */
  revenueLabel?: string;
  /** e.g. Patreon sync menu — rendered before Preview / Apply */
  trailingActions?: ReactNode;
};

function SyncPill({ status }: { status: SyncStatus }) {
  const cfg = {
    synced: {
      label: "Synced",
      dot: "bg-[var(--lib-success)]",
      box: "border-[var(--lib-success)]/35 bg-[var(--lib-success)]/12"
    },
    syncing: {
      label: "Syncing",
      dot: "",
      box: "border-[var(--lib-warning)]/35 bg-[var(--lib-warning)]/10"
    },
    error: {
      label: "Sync issue",
      dot: "bg-[var(--lib-destructive)]",
      box: "border-[var(--lib-destructive)]/35 bg-[var(--lib-destructive)]/10"
    }
  }[status];

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[var(--lib-fg)] ${cfg.box}`}
    >
      {status === "syncing" ? (
        <RefreshCw className="h-3 w-3 animate-spin text-[var(--lib-warning)]" aria-hidden />
      ) : (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden />
      )}
      {cfg.label}
    </div>
  );
}

export default function LibraryTopBar({
  creatorDisplayName,
  patreonName,
  syncStatus = "synced",
  syncIssueDetail,
  patronCount = 0,
  campaignImageSmallUrl,
  campaignBannerUrl,
  revenueLabel = "—",
  trailingActions
}: Props) {
  const relayDisplayName =
    creatorDisplayName?.trim() ||
    process.env.NEXT_PUBLIC_RELAY_CREATOR_DISPLAY_NAME?.trim() ||
    "Dev Creator";

  const patreonSlug = patreonName?.trim().toLowerCase();
  const patreonProfileHref = patreonSlug ? `https://www.patreon.com/${patreonSlug}` : null;

  return (
    <header className="relative z-40 shrink-0 border-b border-[var(--lib-border)] bg-[var(--lib-card)]">
      <div className="flex min-h-[3.75rem] items-center justify-between px-4 py-2">
        <div className="group relative flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 hover:bg-[var(--lib-muted)]/40">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {campaignImageSmallUrl ? (
              <img
                src={campaignImageSmallUrl}
                alt=""
                width={36}
                height={36}
                className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--lib-fg)] sm:text-xl">
                    {relayDisplayName}
                  </h1>
                  {patreonProfileHref ? (
                    <a
                      href={patreonProfileHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block truncate text-xs font-normal text-[var(--lib-fg-muted)] underline-offset-2 hover:text-[var(--lib-fg)] hover:underline"
                    >
                      patreon.com/{patreonSlug}
                    </a>
                  ) : null}
                </div>
                {campaignBannerUrl ? (
                  <div
                    className="flex h-[3.35rem] w-[5.75rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--lib-border)] bg-[var(--lib-muted)] sm:h-[3.75rem] sm:w-28"
                    title="Patreon campaign banner"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote Patreon campaign asset */}
                    <img
                      src={campaignBannerUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain object-center"
                      decoding="async"
                    />
                  </div>
                ) : null}
                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  <SyncPill status={syncStatus} />
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--lib-fg-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
              {syncIssueDetail?.trim() && syncStatus === "error" ? (
                <p
                  className="mt-1 max-w-full truncate text-[10px] leading-snug text-[var(--lib-destructive)]"
                  title={syncIssueDetail.trim()}
                >
                  {syncIssueDetail.trim()}
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                <span className="flex items-center gap-1 tabular-nums">
                  <Users className="h-3 w-3 shrink-0" aria-hidden />
                  {patronCount.toLocaleString()} patrons
                </span>
                <span className="hidden h-3 w-px bg-[var(--lib-border)] sm:inline" aria-hidden />
                <span className="tabular-nums text-[var(--lib-primary)]">{`$${revenueLabel}/mo`}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex shrink-0 items-center gap-2">
          {trailingActions}
          <Link
            href="/designer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 text-xs font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/55 hover:text-[var(--lib-fg)]"
          >
            <Eye className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
            Preview
          </Link>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--lib-primary)] px-3 text-xs font-medium text-[var(--lib-primary-fg)] opacity-75"
            disabled
            title="Publish to patron page — coming soon"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Apply
          </button>
        </div>
      </div>
    </header>
  );
}
