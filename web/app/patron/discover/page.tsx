import type { Metadata } from "next";
import { Suspense } from "react";
import { PatronDiscoverClient } from "./PatronDiscoverClient";

export const metadata: Metadata = {
  title: "Relay · Discover",
  description:
    "Cross-creator recency feed of posts opted into Discover by their creators. v1: free posts only."
};

/**
 * PE-F Skeletal UI (BO-P3-02) — patron Discover surface.
 *
 * Wires `GET /api/v1/patron/discover` to a minimal grid with:
 *   - free-text search box
 *   - cursor pagination ("Load more" button)
 *   - empty / loading / error states
 *
 * The `?state=` dev switcher (gated by NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS + middleware
 * carve-out) lets design / QA inspect every state without seeded data.
 *
 * Out of scope for skeletal: studio-side toggle for marking a post discovery-eligible (the
 * PATCH /api/v1/gallery/posts/:post_id/discovery endpoint is shipped + unit-tested at the
 * server layer; UI integration into the gallery management surface is a polish item).
 */
export default function PatronDiscoverPage() {
  return (
    <Suspense fallback={null}>
      <PatronDiscoverClient />
    </Suspense>
  );
}
