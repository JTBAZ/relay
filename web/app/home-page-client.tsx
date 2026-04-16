"use client";

import { useStudioSession } from "@/lib/studio-session-context";
import { LandingPageShell } from "./components/landing/landing-page-shell";
import GalleryView from "./GalleryView";

const authDisabled = process.env.NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED === "1";

/**
 * Logged-out `/` shows marketing landing; logged-in (or legacy auth bypass) shows Library.
 */
export default function HomePageClient() {
  const { ready, hasRelaySession } = useStudioSession();

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-[var(--relay-fg-muted)]">
        Loading…
      </div>
    );
  }

  if (authDisabled || hasRelaySession) {
    return <GalleryView />;
  }

  return <LandingPageShell />;
}
