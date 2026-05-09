"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import "./feed/patron-mock.css";
import { PatronTopNav } from "./PatronTopNav";

/**
 * Patron route layout (P6-patron-002 — dedicated supporter shell, not studio / designer chrome).
 *
 * The shared `<PatronTopNav />` mounts on every authenticated patron page so navigation
 * flows seamlessly between feed / library / discover / inbox / settings / profile.
 *
 * Hidden on:
 *   - /patron/onboarding -- the wizard owns its own immersive chrome.
 *   - /patron/c/[handle] -- public creator profile is share-friendly without the logged-in shell.
 *
 * The nav is `position: sticky` and only 48px tall; pages below it keep their existing
 * layout. RelayApp on /patron/feed renders its full shell beneath the nav (the existing
 * left-sidebar + top-bar coexist; we don't deep-edit RelayShell here -- nav unification is
 * the cross-cutting layer, RelayShell stays the in-feed surface).
 */
function navHiddenFor(pathname: string): boolean {
  if (pathname === "/patron/onboarding") return true;
  if (pathname.startsWith("/patron/onboarding/")) return true;
  if (pathname.startsWith("/patron/c/")) return true;
  // The /patron landing redirector (PatronStartClient) is also chromeless.
  if (pathname === "/patron") return true;
  return false;
}

export default function PatronLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const showNav = !navHiddenFor(pathname);
  return (
    <div className="patron-mock-root dark min-h-screen bg-background text-foreground antialiased">
      {showNav ? <PatronTopNav /> : null}
      {children}
    </div>
  );
}
