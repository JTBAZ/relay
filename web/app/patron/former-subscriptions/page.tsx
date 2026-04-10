import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { FORMER_SUBSCRIPTIONS } from "@/lib/relay-fixtures";

export default function FormerSubscriptionsPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#C8C8C8]">
      <header className="flex items-center gap-4 border-b border-[#1A1A1A] px-4 py-4">
        <Link
          href="/patron/feed"
          className="text-sm text-[#2D6A4F] transition-colors hover:text-[#40916C]"
        >
          ← Back to feed
        </Link>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
        <div>
          <h1 className="text-lg font-semibold text-[#E5E5E5]">Former subscriptions</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Creators you supported before. Re-subscribe on Patreon when you are ready.
          </p>
        </div>
        <ul className="space-y-2">
          {FORMER_SUBSCRIPTIONS.map((row) => (
            <li
              key={row.id}
              className="flex gap-3 rounded-lg border border-[#222222] bg-[#111111] p-3"
            >
              <div
                className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#2A2A2A]"
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- fixture URLs */}
                <img
                  src={row.creator.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  width={44}
                  height={44}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[#C8C8C8]">{row.creator.displayName}</span>
                  <span className="rounded border border-[#2A2A2A] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[#6B7280]">
                    {row.tierLabel}
                  </span>
                </div>
                <p className="text-[11px] text-[#5A5A5A]">{row.endedAtLabel}</p>
                <a
                  href={row.patreonCreatorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#2D6A4F] hover:text-[#40916C]"
                >
                  Re-subscribe on Patreon
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
