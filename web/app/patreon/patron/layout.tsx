"use client";

/**
 * BO-P4-05 follow-up — patron Patreon OAuth bridge layout.
 *
 * `/patreon/patron/connect` and `/patreon/patron/callback` are patron-facing flows that sit
 * outside the `/patron/*` route group, so they don't inherit `web/app/patron/layout.tsx`.
 * Without this layout they fall through to the root layout and render the legacy studio
 * `AppNav`, which is wrong for a public-facing patron flow.
 *
 * `<PatronTopNav />` self-hides when there's no session and shows a slim skeleton while
 * the session check is in flight, so this is safe for both signed-out (pre-OAuth) and
 * signed-in (callback) states.
 *
 * Note: `ConditionalAppNav` already excludes `/patreon/patron/*` to prevent double-stacked
 * nav.
 */

import type { ReactNode } from "react";

import "../../patron/feed/patron-mock.css";
import { PatronTopNav } from "../../patron/PatronTopNav";

export default function PatreonPatronLayout({ children }: { children: ReactNode }) {
  return (
    <div className="patron-mock-root dark min-h-screen bg-background text-foreground antialiased">
      <PatronTopNav />
      {children}
    </div>
  );
}
