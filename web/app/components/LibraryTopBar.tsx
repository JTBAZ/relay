"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Check, Eye, PenLine, RefreshCw } from "lucide-react";

type SyncStatus = "synced" | "syncing" | "error";

type Props = {
  /** Relay chosen display name (account setup); always the main title — not the Patreon URL slug. */
  creatorDisplayName?: string;
  /** Patreon campaign vanity (lowercase). When set, a `patreon.com/…` link is shown under the title. */
  patreonName?: string;
  syncStatus?: SyncStatus;
  /** One-line detail under the title row when sync needs attention (from GET sync-state health). */
  syncIssueDetail?: string;
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
      box: "border-[var(--lib-success)]/35 bg-[var(--lib-success)]/12",
      title: "Patreon sync is up to date with your last scrape health."
    },
    syncing: {
      label: "Syncing",
      dot: "",
      box: "border-[var(--lib-warning)]/35 bg-[var(--lib-warning)]/10",
      title: "A Patreon scrape or sync is in progress."
    },
    error: {
      label: "Sync issue",
      dot: "bg-[var(--lib-destructive)]",
      box: "border-[var(--lib-destructive)]/35 bg-[var(--lib-destructive)]/10",
      title: "OAuth or last scrape needs attention — open the Patreon menu."
    }
  }[status];

  return (
    <div
      role="status"
      title={cfg.title}
      aria-label={`Patreon sync: ${cfg.label}`}
      className={`flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium tracking-wide text-[var(--lib-fg)] ${cfg.box}`}
    >
      {status === "syncing" ? (
        <RefreshCw className="h-2.5 w-2.5 animate-spin text-[var(--lib-warning)]" aria-hidden />
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
  campaignImageSmallUrl,
  campaignBannerUrl,
  revenueLabel = "—",
  trailingActions
}: Props) {
  const relayDisplayName =
    creatorDisplayName?.trim() ||
    process.env.NEXT_PUBLIC_RELAY_CREATOR_DISPLAY_NAME?.trim() ||
    "Your studio";

  const patreonSlug = patreonName?.trim().toLowerCase();
  const patreonProfileHref = patreonSlug ? `https://www.patreon.com/${patreonSlug}` : null;

  return (
    <header className="relative z-40 shrink-0 border-b border-[var(--lib-border)] bg-[var(--lib-card)]">
      <div className="flex min-h-[3.75rem] flex-wrap items-start justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <div className="relative flex w-full shrink-0 items-center gap-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--lib-selection)_22%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-muted)_58%,transparent)] px-3 py-2 shadow-[0_1px_0_rgba(255,255,255,0.03)] lg:w-[14.5rem]">
            {campaignBannerUrl ? (
              <div
                className="absolute inset-y-1 right-1 hidden w-20 overflow-hidden rounded-xl opacity-20 sm:block"
                title="Patreon campaign banner"
                aria-hidden
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- remote Patreon campaign asset */}
                <img
                  src={campaignBannerUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--lib-muted)] via-[var(--lib-muted)]/75 to-transparent" />
              </div>
            ) : null}
            <div className="relative z-10 flex min-w-0 items-center gap-2.5">
              {campaignImageSmallUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote Patreon campaign asset URL
                <img
                  src={campaignImageSmallUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="h-10 w-10 shrink-0 rounded-full border border-[color-mix(in_srgb,var(--lib-selection)_35%,var(--lib-border))] bg-[var(--lib-muted)] object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--lib-selection)_35%,var(--lib-border))] bg-[var(--lib-muted)] text-sm font-semibold text-[var(--lib-selection)]">
                  {relayDisplayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="max-w-[11rem] truncate text-sm font-semibold tracking-tight text-[var(--lib-fg)] lg:max-w-[7rem]">
                    {relayDisplayName}
                  </h1>
                </div>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                  {patreonProfileHref ? (
                    <a
                      href={patreonProfileHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="max-w-[12rem] truncate underline-offset-2 hover:text-[var(--lib-fg)] hover:underline lg:max-w-[8.5rem]"
                    >
                      patreon.com/{patreonSlug}
                    </a>
                  ) : null}
                  <span className="tabular-nums text-[var(--lib-primary)]">{`$${revenueLabel}/mo`}</span>
                </div>
                {syncIssueDetail?.trim() && syncStatus === "error" ? (
                  <p
                    className="mt-1 max-w-[20rem] truncate text-[10px] leading-snug text-[var(--lib-destructive)]"
                    title={syncIssueDetail.trim()}
                  >
                    {syncIssueDetail.trim()}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex shrink-0 flex-wrap items-center justify-end gap-2">
          <SyncPill status={syncStatus} />
          {trailingActions}
          <Link
            href="/new-post"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 text-xs font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/50"
            title="New Relay post — compose (shell)"
          >
            <PenLine className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
            New post
          </Link>
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
