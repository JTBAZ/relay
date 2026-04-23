"use client";

import { usePathname } from "next/navigation";
import { useStudioSession } from "@/lib/studio-session-context";
import AppNav from "./AppNav";

const authDisabled = process.env.NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED === "1";

/** Full-page flows (e.g. onboarding) supply their own chrome. */
export default function ConditionalAppNav() {
  const pathname = usePathname();
  const { ready, hasRelaySession } = useStudioSession();

  if (
    /** Patron routes (feed, onboarding, etc.) — full-page patron chrome */
    pathname.startsWith("/patron/") ||
    /**
     * Patron Patreon OAuth bridge pages (`/patreon/patron/connect`,
     * `/patreon/patron/callback`). These are public-facing patron flows and must
     * not inherit the studio AppNav. They mount `<PatronTopNav />` via
     * `web/app/patreon/patron/layout.tsx` instead.
     */
    pathname.startsWith("/patreon/patron/") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/auth/confirm" ||
    pathname.startsWith("/auth/confirm/") ||
    pathname === "/collections" ||
    pathname.startsWith("/collections/")
  ) {
    return null;
  }

  // Marketing landing at `/` when logged out — no studio chrome.
  if (pathname === "/" && ready && !authDisabled && !hasRelaySession) {
    return null;
  }

  return <AppNav />;
}
