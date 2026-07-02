import type { Metadata } from "next";
import { Suspense } from "react";
import { PatronSettingsClient } from "./PatronSettingsClient";

export const metadata: Metadata = {
  title: "Relay · Settings",
  description:
    "Account settings: profile, notifications, or schedule account deletion."
};

/**
 * PE-J Skeletal UI (BO-P4-03) — patron settings shell.
 *
 * Core sections:
 *   1. Profile — display name and bio.
 *   2. Notifications — weekly or monthly digest + browse time window.
 *   3. Account deletion — request / cancel the 7-day grace flow, with status pill when pending.
 *
 * Data export and per-creator unwind are intentionally omitted from the patron UI for MVP.
 */
export default function PatronSettingsPage() {
  return (
    <Suspense fallback={null}>
      <PatronSettingsClient />
    </Suspense>
  );
}
