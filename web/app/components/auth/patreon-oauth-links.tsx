"use client";

import Link from "next/link";
import { ArrowRight, Palette, Users } from "lucide-react";

/**
 * Real navigation to Patreon OAuth flows (no demo timers).
 * Creator flow requires an existing Relay session — /patreon/connect explains that.
 */
export function PatreonOAuthLinks() {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed" style={{ color: "#9CA3AF" }}>
        Studio sign-in above creates your <strong style={{ color: "#E5E7EB" }}>account in Relay’s database</strong> and
        your Library. Link Patreon <strong style={{ color: "#E5E7EB" }}>after</strong> that to sync posts (OAuth on
        Patreon’s site).
      </p>
      <Link
        href="/patreon/connect"
        className="group flex w-full items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
        style={{ background: "#111111", borderColor: "#2A2A2A", color: "#F9FAFB" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ background: "#0D1F17" }}
        >
          <Palette size={16} style={{ color: "#40916C" }} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
            Creator — connect Patreon
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "#9CA3AF" }}>
            OAuth on patreon.com, then return to your Library
          </p>
        </div>
        <ArrowRight
          size={16}
          className="shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: "#9CA3AF" }}
          aria-hidden
        />
      </Link>

      <Link
        href="/patreon/patron/connect"
        className="group flex w-full items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
        style={{ background: "#111111", borderColor: "#2A2A2A", color: "#F9FAFB" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ background: "#0D1F17" }}
        >
          <Users size={16} style={{ color: "#40916C" }} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
            Supporter — connect Patreon
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "#9CA3AF" }}>
            Patron OAuth and feed access
          </p>
        </div>
        <ArrowRight
          size={16}
          className="shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: "#9CA3AF" }}
          aria-hidden
        />
      </Link>
    </div>
  );
}
