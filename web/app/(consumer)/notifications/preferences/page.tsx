import type { Metadata } from "next";
import { Suspense } from "react";
import { PatronNotificationPreferencesClient } from "./PatronNotificationPreferencesClient";

export const metadata: Metadata = {
  title: "Relay · Notification preferences",
  description:
    "Per-creator, per-type toggles for what arrives in your notifications inbox."
};

/**
 * PE-G Skeletal UI (BO-P3-04) — patron notification preferences.
 *
 * Wires:
 *   - GET   /api/v1/patron/notifications/preferences
 *   - PATCH /api/v1/patron/notifications/preferences
 *
 * UI is grouped by `relay_creator_id`; each group exposes the canonical preference types as
 * toggles. Default state for any (creator, type) without a row is ENABLED -- the backend's
 * `isPreferenceEnabled` policy. The UI surfaces this with a "default" pill so users know which
 * rows have been explicitly written vs which are inheriting the default.
 *
 * The `?state=` dev switcher (mixed | empty | error) lets design / QA review without seeded data.
 */
export default function PatronNotificationPreferencesPage() {
  return (
    <Suspense fallback={null}>
      <PatronNotificationPreferencesClient />
    </Suspense>
  );
}
