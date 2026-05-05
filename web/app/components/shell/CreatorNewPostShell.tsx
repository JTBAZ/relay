"use client";

import Link from "next/link";
import { PenLine, Sparkles } from "lucide-react";
import { CreatorRelayPostComposer } from "./CreatorRelayPostComposer";

type Props = {
  /** Relay `creator_id` from studio session (required for upload/publish). */
  creatorId?: string;
  /** When true (e.g. `/new-post` page), show a link back to Library. */
  showBackLink?: boolean;
  /** Pre-fill composer with staged media ids (e.g. `?media_ids=` from Discord flow). */
  initialMediaIds?: string[];
};

/**
 * T-6.1 / T-6.3 — In-page shell for Relay-native compose (presigned upload + `POST /api/v1/relay/posts`).
 * Primary placement: Creator Library (`/`) directly under `LibraryTopBar`.
 */
export function CreatorNewPostShell({ creatorId, showBackLink, initialMediaIds }: Props) {
  return (
    <section
      data-relay-creator-id={creatorId ?? ""}
      id="creator-new-post-shell"
      aria-labelledby="creator-new-post-heading"
      className="shrink-0 border-b border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_88%,var(--lib-bg))] px-4 py-3"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--lib-primary)]" aria-hidden />
            <h2
              id="creator-new-post-heading"
              className="text-sm font-semibold tracking-tight text-[var(--lib-fg)]"
            >
              New post
            </h2>
            <span className="rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)]/40 px-2 py-px text-[10px] font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
              Relay
            </span>
          </div>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--lib-fg-muted)]">
            Upload media to R2 or publish staged Discord captures, then ship a native Relay post. The Library
            grid updates after a refresh or navigation.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
          {showBackLink ? (
            <Link
              href="/"
              className="inline-flex h-8 items-center rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 text-xs font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/50"
            >
              ← Library
            </Link>
          ) : (
            <Link
              href="/new-post"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 text-xs font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/50"
            >
              <PenLine className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
              Full page
            </Link>
          )}
        </div>
      </div>

      <div
        className="mx-auto mt-3 max-w-5xl rounded-lg border border-dashed border-[var(--lib-border)] bg-[var(--lib-muted)]/20 px-4 py-4"
        role="region"
        aria-label="Relay compose"
      >
        <CreatorRelayPostComposer
          creatorId={creatorId ?? ""}
          initialMediaIds={initialMediaIds}
        />
        <p className="mt-4 border-t border-[var(--lib-border)]/60 pt-3 text-center text-[11px] text-[var(--lib-fg-muted)]/90">
          Patreon-mirrored posts use the post card menu; this path is for new Relay uploads only.
        </p>
      </div>
    </section>
  );
}
