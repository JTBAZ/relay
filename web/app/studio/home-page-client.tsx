"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  clearPendingOAuthCallbackTarget,
  readPendingOAuthCallbackTarget,
} from "@/lib/oauth-pending-callback";
import { useStudioSession } from "@/lib/studio-session-context";
import { LandingPageShell } from "@/app/components/landing/landing-page-shell";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import GalleryView from "./GalleryView";
import { studioAuthDisabled } from "@/lib/dev-auth-flags";

const authDisabled = studioAuthDisabled();

export default function HomePageClient() {
  const { ready, hasRelaySession, activeRole } = useStudioSession();
  const router = useRouter();
  const oauthShimRan = useRef(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || oauthShimRan.current) return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code")?.trim();
    const state = url.searchParams.get("state")?.trim();
    if (!code || !state) return;
    const dedupeKey = `relay_oauth_root_shim_${code}`;
    if (sessionStorage.getItem(dedupeKey)) return;
    const target = readPendingOAuthCallbackTarget();
    if (!target) return;
    sessionStorage.setItem(dedupeKey, "1");
    clearPendingOAuthCallbackTarget();
    oauthShimRan.current = true;
    const q = url.searchParams.toString();
    const path =
      target === "subscribestar-creator"
        ? "/connect/subscribestar/creator/callback"
        : "/connect/patreon/callback";
    window.location.replace(`${window.location.origin}${path}?${q}`);
  }, []);

  const shouldRedirectToFeed =
    ready && hasRelaySession && !authDisabled && activeRole === "supporter";

  useEffect(() => {
    if (shouldRedirectToFeed) {
      router.replace("/feed");
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
