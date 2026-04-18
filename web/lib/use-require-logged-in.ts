"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useStudioSession } from "./studio-session-context";

export type GuardState = { ready: boolean; blocked: boolean };

/**
 * Tier 1.4 — bounce unauthenticated users to `/login` (or `redirectTo`).
 *
 * - `ready`: true once the session check has resolved.
 * - `blocked`: true when `ready && !hasRelaySession` (redirect is in flight).
 *
 * Pages should wrap content in `BootSplashOr` (`app/components/auth/BootSplashOr.tsx`)
 * or render the boot splash from GR-T1-5 while `!ready || blocked`.
 */
export function useRequireLoggedIn(redirectTo = "/login"): GuardState {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { ready, hasRelaySession } = useStudioSession();

  useEffect(() => {
    if (!ready) return;
    if (hasRelaySession) return;
    const q = search.toString();
    const here = `${pathname}${q ? `?${q}` : ""}`;
    const url = `${redirectTo}?returnTo=${encodeURIComponent(here)}`;
    router.replace(url);
  }, [ready, hasRelaySession, redirectTo, router, pathname, search]);

  return { ready, blocked: ready && !hasRelaySession };
}
