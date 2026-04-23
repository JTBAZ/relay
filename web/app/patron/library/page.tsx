import type { Metadata } from "next";
import { Suspense } from "react";
import { PatronLibraryClient } from "./PatronLibraryClient";

export const metadata: Metadata = {
  title: "Relay · Your library",
  description:
    "Cross-creator favorites and saved collections, with live tier-aware visibility per item."
};

/**
 * PE-D Skeletal UI (BO-P2-02) — patron library shell.
 *
 * Renders the supporter's favorites + saved collections across **all** creators they patron,
 * pulled from the cross-creator endpoints shipped in BO-P2-01:
 *   - GET /api/v1/patron/favorites/all
 *   - GET /api/v1/patron/collections/all
 *
 * Each item carries a `viewer_entitlement` decision the backend computed LIVE against the
 * viewer's current PatronEntitlementSnapshot. The skeletal UI surfaces all four states:
 *
 *   visible    → full thumbnail
 *   preview    → blurred thumbnail with a "Preview" pill (reserved; PE-L)
 *   unlockable → blurred thumbnail with a "Tip to unlock" CTA stub (reserved; PE-L)
 *   locked     → blurred thumbnail with an "Upgrade tier" CTA
 *
 * The `?state=` dev switcher injects a fixture set so a designer can review every state
 * without needing live data behind the gate.
 */
export default function PatronLibraryPage() {
  return (
    <Suspense fallback={null}>
      <PatronLibraryClient />
    </Suspense>
  );
}
