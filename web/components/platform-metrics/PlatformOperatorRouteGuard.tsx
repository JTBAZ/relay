"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRequireLoggedIn } from "@/lib/use-require-logged-in";
import { platformMetricsAuthDisabled } from "@/lib/dev-auth-flags";

// [R-SEC-08 @security-review 2026-06] Hard-ignored in production builds; dev behavior unchanged.
const authDisabled = platformMetricsAuthDisabled();

function PlatformMetricsLoadingShell({ message }: { message: string }) {
  return (
    <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-[#9A9A9A]">
      {message}
    </div>
  );
}

/**
 * PMD-070 — Require a Relay session for `/platform-metrics` unless dev auth is disabled.
 */
export function PlatformOperatorRouteGuard({ children }: { children: ReactNode }) {
  if (authDisabled) {
    return <PlatformOperatorDevBypassGate>{children}</PlatformOperatorDevBypassGate>;
  }

  return <PlatformOperatorSessionGate>{children}</PlatformOperatorSessionGate>;
}

/** Defer dashboard until mount so SSR and first client paint both show the loading shell. */
function PlatformOperatorDevBypassGate({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PlatformMetricsLoadingShell message="Loading platform metrics…" />;
  }

  return <>{children}</>;
}

function PlatformOperatorSessionGate({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { ready, blocked } = useRequireLoggedIn("/login");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !ready || blocked) {
    return (
      <PlatformMetricsLoadingShell
        message={blocked ? "Redirecting to sign-in…" : "Loading platform metrics…"}
      />
    );
  }

  return <>{children}</>;
}
