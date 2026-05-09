"use client";

import type { TierFacet } from "@/lib/relay-api";

export function PatronPostEntitlementStrip({ tiers }: { tiers: TierFacet[] }) {
  if (tiers.length === 0) {
    return (
      <div
        className="text-xs text-[#6B7280] leading-relaxed"
        data-testid="patron-post-entitlement-strip"
      >
        This post is available without a paid tier gate on Relay (public / free tier audience).
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      data-testid="patron-post-entitlement-strip"
    >
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#555555]">
        Included for
      </span>
      <div className="flex flex-wrap gap-1.5">
        {tiers.map((t) => (
          <span
            key={t.tier_id}
            className="rounded-md border border-[#2A2A2A] bg-[#111111] px-2.5 py-1 text-xs font-medium text-[#D1D5DB]"
          >
            {t.title}
            {typeof t.amount_cents === "number" && t.amount_cents > 0
              ? ` · $${(t.amount_cents / 100).toFixed(0)}+`
              : null}
          </span>
        ))}
      </div>
    </div>
  );
}
