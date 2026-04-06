"use client";

import Link from "next/link";
import { RelayWordmark } from "@/app/components/landing/wordmark";

/** Optional top nav for standalone use; `/landing` uses global `AppNav` instead. */
export function SiteNav() {
  return (
    <header className="relay-animate-fade-in" style={{ animationDelay: "0ms" }}>
      <div
        className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6"
        style={{
          borderBottom: "1px solid #1E1E1E",
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(12px)"
        }}
      >
        <Link href="/landing" aria-label="Relay home">
          <RelayWordmark />
        </Link>

        <nav className="hidden items-center gap-6 sm:flex" aria-label="Primary" />

        <Link
          href="/login"
          className="hidden items-center rounded-md border px-4 py-1.5 text-sm transition-colors duration-150 sm:inline-flex"
          style={{
            borderColor: "#2D6A4F",
            color: "#40916C",
            background: "transparent"
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "#0D1F17";
            el.style.borderColor = "#40916C";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "transparent";
            el.style.borderColor = "#2D6A4F";
          }}
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}
