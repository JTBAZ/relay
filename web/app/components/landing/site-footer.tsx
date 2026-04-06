"use client";

import Link from "next/link";
import { RelayWordmark } from "@/app/components/landing/wordmark";

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Cookie Policy", href: "/legal/cookies" }
];

const ENTRY_LINKS = [
  { label: "Creator sign-up", href: "/patreon/connect" },
  { label: "Supporter sign in", href: "/login" }
];

export function SiteFooter() {
  return (
    <footer className="w-full" style={{ borderTop: "1px solid #2A2A2A" }} aria-label="Site footer">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <RelayWordmark />

          <div className="flex flex-wrap gap-6">
            {ENTRY_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="text-sm transition-colors duration-150"
                style={{ color: "#9CA3AF" }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#F9FAFB")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#9CA3AF")}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="h-px" style={{ background: "#2A2A2A" }} />

        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xs" style={{ color: "#6B7280" }}>
            &copy; {new Date().getFullYear()} Relay. All rights reserved.
          </p>

          <nav className="flex flex-wrap gap-4" aria-label="Legal links">
            {LEGAL_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="text-xs transition-colors duration-150"
                style={{ color: "#6B7280" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#9CA3AF")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#6B7280")}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
