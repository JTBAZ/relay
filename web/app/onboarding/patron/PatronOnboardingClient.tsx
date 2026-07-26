"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Legacy patron OAuth entry. MB-15C redirects into the main wizard so plan education
 * cannot be bypassed. Campaign query is preserved for Patreon connect.
 */
function PatronOnboardingRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("path", "supporter");
    params.set("step", "3");
    const campaign = searchParams.get("campaign")?.trim();
    if (campaign) params.set("campaign", campaign);
    router.replace(`/onboarding?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center text-sm text-[var(--relay-fg-muted)]"
      data-testid="patron-onboarding-redirect"
    >
      <p>Continuing in Relay onboarding…</p>
      <p className="text-xs">
        You&apos;ll connect Patreon, then choose how you support — free stays available.
      </p>
    </div>
  );
}

export function PatronOnboardingClient({
  initialClientId
}: {
  initialClientId: string;
}) {
  void initialClientId;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--relay-fg-muted)]">
          Loading…
        </div>
      }
    >
      <PatronOnboardingRedirect />
    </Suspense>
  );
}
