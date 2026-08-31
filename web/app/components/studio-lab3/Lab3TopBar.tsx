"use client";

import Link from "next/link";
import { useStudioSession } from "@/lib/studio-session-context";

/**
 * Lab 3 identity bar — Relay + Lab 3 + account. No Goals, Automations,
 * Crossposter, Patreon Health, Distribution, or Autopost.
 */
export function Lab3TopBar() {
  const { creatorId } = useStudioSession();
  const initials = (creatorId.replace(/^creator[_-]?/i, "").slice(0, 2) || "CR").toUpperCase();

  return (
    <nav
      className="sticky top-0 z-40 flex h-10 shrink-0 items-center justify-between border-b border-[var(--lab3-hairline,#1c211f)] bg-[var(--lab3-bg,#050706)] px-5 sm:px-6"
      aria-label="Lab 3"
      data-lab3-top-bar
    >
      <div className="flex items-center gap-2">
        <Link
          href="/studio"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--lab3-hairline,#1c211f)] bg-[#0d0d0d] text-[var(--lab3-mint,#9bf0c4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)]"
          aria-label="Relay studio home (production)"
          title="Back to production Library"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M4 7C4 5.343 5.343 4 7 4C8.657 4 10 5.343 10 7C10 8.657 8.657 10 7 10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M7 10C5.343 10 4 8.657 4 7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeOpacity="0.4"
            />
          </svg>
        </Link>
        <span className="hidden text-[12px] font-medium tracking-tight text-[var(--lab3-text-strong,#e8e8e8)] sm:block">
          Relay
        </span>
        <span className="rounded-md border border-[#9bf0c433] bg-[#9bf0c40e] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--lab3-mint,#9bf0c4)]">
          Lab 3
        </span>
      </div>

      <div
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--lab3-hairline,#1c211f)] bg-[#1a1a1a]"
        aria-label={`Account ${initials}`}
      >
        <span className="text-[10px] font-medium text-[#666]">{initials}</span>
      </div>
    </nav>
  );
}
