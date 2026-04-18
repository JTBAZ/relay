"use client";

import { Loader2 } from "lucide-react";
import { RelayLogo } from "./relay-logo";

export type AuthBootSplashProps = {
  /** Visible line under the spinner (e.g. email confirmation). Omit for generic boot. */
  message?: string;
};

/**
 * Tier 1.5 — neutral auth boot splash.
 *
 * Rendered while a guard hook (`useRequireLoggedIn` / `useRequireLoggedOut`)
 * is resolving its session check or while a redirect is in flight.
 *
 * Pure UI: no network calls, no auth-state reads, no role-based branching.
 */
export function AuthBootSplash({ message }: AuthBootSplashProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 px-4"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      <RelayLogo size="md" />
      <Loader2
        className="h-8 w-8 animate-spin"
        style={{ color: "#40916C" }}
        aria-hidden
      />
      {message ? (
        <p className="text-center text-sm" style={{ color: "#9CA3AF" }}>
          {message}
        </p>
      ) : (
        <span className="sr-only">Loading…</span>
      )}
    </div>
  );
}
