import type { Metadata } from "next";
import { Suspense } from "react";
import { PatronStartClient } from "./PatronStartClient";

export const metadata: Metadata = {
  title: "Relay · Supporter",
  description:
    "Verify your email and connect Patreon to unlock your supporter feed."
};

/**
 * PE-A Skeletal UI (BO-P1-02) — Post-login empty patron shell.
 *
 * Single-purpose landing page that decides which gate to show:
 *   1. Not signed in           → CTA to /login?role=supporter
 *   2. Signed in, email unverified → "Verify your email" gate
 *   3. Signed in + verified, no Patreon → "Connect Patreon" CTA
 *   4. Fully ready             → "Open your feed" CTA → /patron/feed
 *
 * Dev tools (?state=) override the live session so each gate can be inspected
 * without going through the full auth + Patreon flow.
 */
export default function PatronStartPage() {
  return (
    <Suspense fallback={null}>
      <PatronStartClient />
    </Suspense>
  );
}
