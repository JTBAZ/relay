"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolvePostAuthPath } from "./post-login-redirect";
import { useStudioSession } from "./studio-session-context";

export type GuardState = { ready: boolean; blocked: boolean };

/**
 * Tier 1.4 — bounce authenticated users away from auth-entry routes.
 *
 * When `?returnTo=` is present it is validated by {@link resolvePostAuthPath}; otherwise
 * `redirectTo` (default `/`) is used.
 */
export function useRequireLoggedOut(redirectTo = "/"): GuardState {
  const router = useRouter();
  const search = useSearchParams();
  const { ready, hasRelaySession } = useStudioSession();

  useEffect(() => {
    if (!ready) return;
    if (!hasRelaySession) return;
    const raw = search.get("returnTo");
    const dest = raw !== null ? resolvePostAuthPath(raw) : resolvePostAuthPath(redirectTo);
    router.replace(dest);
  }, [ready, hasRelaySession, router, search, redirectTo]);

  return { ready, blocked: ready && hasRelaySession };
}
