"use client";

import Link from "next/link";

export function PatronEntitlementStaleBanner({
  staleSinceIso
}: {
  staleSinceIso: string | null;
}) {
  const dateHint =
    staleSinceIso != null
      ? ` Membership info may be out of date since ${new Date(staleSinceIso).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric"
        })}.`
      : "";

  return (
    <div
      className="shrink-0 border-b border-amber-800/45 bg-amber-950/40 px-4 py-3 lg:px-5"
      role="status"
      data-testid="patron-entitlement-stale-banner"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm text-amber-100/95">
          <span className="font-medium text-amber-50">Reconnect Patreon</span> to refresh your tier
          access.&nbsp;Relay may be using older membership data for someone you follow.{dateHint}
        </p>
        <Link
          href="/patreon/patron/connect"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-700/90 px-4 py-2 text-sm font-medium text-amber-50 transition-colors hover:bg-amber-600"
        >
          Reconnect Patreon
        </Link>
      </div>
    </div>
  );
}
