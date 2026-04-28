"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStudioSession } from "@/lib/studio-session-context";
import { LandingPageShell } from "./components/landing/landing-page-shell";
import { StudioRouteGuard } from "./components/studio/StudioRouteGuard";
import GalleryView from "./GalleryView";

const authDisabled = process.env.NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED === "1";

/**
 * Logged-out `/` shows marketing landing; logged-in shows Library (creator) or redirects to
 * `/patron/feed` (supporter). The `relay_active_role` cookie (UI lens) drives the branch.
 */
export default function HomePageClient() {
  const { ready, hasRelaySession, activeRole } = useStudioSession();
  const router = useRouter();

  const shouldRedirectToFeed =
    ready && hasRelaySession && !authDisabled && activeRole === "supporter";

  useEffect(() => {
    if (shouldRedirectToFeed) {
      router.replace("/patron/feed");
    }
  }, [shouldRedirectToFeed, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-[var(--relay-fg-muted)]">
        Loading…
      </div>
    );
  }

  if (shouldRedirectToFeed) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-[var(--relay-fg-muted)]">
        Loading…
      </div>
    );
  }

  if (authDisabled || hasRelaySession) {
    return (
      <StudioRouteGuard>
        <GalleryView />
      </StudioRouteGuard>
    );
  }

  return <LandingPageShell />;
}
