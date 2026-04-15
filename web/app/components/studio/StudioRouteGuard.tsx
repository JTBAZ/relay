"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStudioSession } from "@/lib/studio-session-context";

const authDisabled = process.env.NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED === "1";

/**
 * MT-036: Require a Relay session for studio routes unless
 * `NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED=1` (local legacy only).
 */
export function StudioRouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, hasRelaySession } = useStudioSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !ready || authDisabled) return;
    if (hasRelaySession) return;
    router.replace(`/login?returnTo=${encodeURIComponent(pathname || "/")}`);
  }, [mounted, ready, hasRelaySession, router, pathname]);

  if (!mounted || !ready) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-[var(--relay-fg-muted)]">
        Loading studio…
      </div>
    );
  }
  if (!authDisabled && !hasRelaySession) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-[var(--relay-fg-muted)]">
        Redirecting to sign-in…
      </div>
    );
  }
  return <>{children}</>;
}
