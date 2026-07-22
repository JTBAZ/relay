"use client";

import Link from "next/link";
import { DistributionRulesSection } from "@/app/components/autopost/DistributionRulesSection";
import { PostingRoutinesSection } from "@/app/components/autopost/PostingRoutinesSection";

/**
 * Routines page host — composes extracted sections (VS7 / B17).
 */
export function AutopostRoutinesPanel() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-6" data-testid="autopost-routines-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
            Autopost
          </p>
          <h1 className="mt-1 text-xl font-semibold text-[var(--lib-fg)]">Routines &amp; rules</h1>
          <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">
            Recurring post slots stay lightweight on the calendar. Distribution rules prepare
            draft-only previews after Patreon publishes — never auto-publish.
          </p>
        </div>
        <Link
          href="/studio/autopost"
          className="rounded-md border border-[var(--lib-border)] px-3 py-1.5 text-xs text-[var(--lib-fg)]"
        >
          Composer
        </Link>
      </div>

      <PostingRoutinesSection />
      <DistributionRulesSection />
    </div>
  );
}
