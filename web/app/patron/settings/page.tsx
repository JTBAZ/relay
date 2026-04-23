import type { Metadata } from "next";
import { Suspense } from "react";
import { PatronSettingsClient } from "./PatronSettingsClient";

export const metadata: Metadata = {
  title: "Relay · Settings",
  description:
    "Account-wide settings: export your data, leave a creator, or schedule account deletion."
};

/**
 * PE-J Skeletal UI (BO-P4-03) — patron settings shell.
 *
 * Three sections:
 *   1. Export — one-click download of the account's full data bundle (JSON).
 *   2. Per-creator unwind — list of creators the patron has a membership with; "Leave"
 *      button triggers the destructive-confirm dialog and calls the per-creator delete API.
 *   3. Account deletion — request / cancel the 7-day grace flow, with status pill when pending.
 *
 * The `?state=` dev switcher lets design / QA review every state without seeded data.
 *
 * Notification preferences live on a sibling page (/patron/notifications/preferences). Profile
 * fields (handle / bio / avatar) land with PE-K Rest's profile wiring; this page intentionally
 * scopes to data-rights actions so the cognitive load stays low for high-risk choices.
 */
export default function PatronSettingsPage() {
  return (
    <Suspense fallback={null}>
      <PatronSettingsClient />
    </Suspense>
  );
}
