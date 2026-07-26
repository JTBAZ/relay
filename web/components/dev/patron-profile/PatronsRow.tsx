"use client";

import { useEffect, useState } from "react";
import { fetchPatronFollows, type PatronFollowApiItem } from "@/lib/patron-follows-api";
import { PATRON_PROFILE_DRAFT_PATRONAGE } from "./patron-profile-draft-fixtures";

type PatronageRow = {
  id: string;
  name: string;
  avatarUrl: string;
  tierLabel: string;
  sourceLabel: string;
};

function fallbackPatronageRows(): PatronageRow[] {
  return PATRON_PROFILE_DRAFT_PATRONAGE.map((patron, index) => ({
    id: patron.id,
    name: patron.name,
    avatarUrl: patron.avatarUrl,
    tierLabel: index === 1 ? "Backstage" : "Supporter",
    sourceLabel: "Dev OAuth preview"
  }));
}

function apiPatronageRow(item: PatronFollowApiItem): PatronageRow {
  const id = item.relay_creator_id.trim();
  const short = id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id || "creator";
  return {
    id,
    name: item.creator?.display_name?.trim() || item.creator?.handle?.trim() || short,
    avatarUrl: item.creator?.avatar_url?.trim() || "/placeholder.svg?height=128&width=128",
    tierLabel: item.entitlement?.tier_label?.trim() || "Free",
    sourceLabel: item.entitlement?.active ? "OAuth pledge" : "Followed"
  };
}

export function PatronProfileDraftPatronsRow() {
  const [rows, setRows] = useState<PatronageRow[]>(() => fallbackPatronageRows());
  const [source, setSource] = useState<"loading" | "live" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;
    setSource("loading");
    void fetchPatronFollows({ suppressAuthRedirect: true })
      .then((payload) => {
        if (cancelled) return;
        if (payload.items.length === 0) {
          setRows(fallbackPatronageRows());
          setSource("fallback");
          return;
        }
        setRows(payload.items.map(apiPatronageRow));
        setSource("live");
      })
      .catch(() => {
        if (cancelled) return;
        setRows(fallbackPatronageRows());
        setSource("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Patronage
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            {source === "live"
              ? "Detected from this patron’s OAuth-backed follows and entitlement snapshots."
              : source === "loading"
                ? "Checking this patron’s OAuth-backed memberships…"
                : "Showing dev fallback rows until a signed-in patron session has OAuth-backed rows."}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {source === "live" ? "Live DB" : "Dev fallback"}
        </span>
      </div>
      <div className="flex gap-5 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {rows.map((patron) => (
          <button
            key={patron.id}
            type="button"
            className="group flex shrink-0 flex-col items-center gap-2 transition-transform duration-500 [transition-timing-function:var(--ease-elegant)] hover:-translate-y-1"
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-full ring-1 ring-border transition-all duration-500 group-hover:ring-primary group-hover:shadow-[var(--shadow-glow)] md:h-20 md:w-20">
              {/* eslint-disable-next-line @next/next/no-img-element -- draft fixture */}
              <img
                src={patron.avatarUrl}
                alt={patron.name}
                width={512}
                height={512}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <span className="text-[11px] tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
              {patron.name}
            </span>
            <span className="rounded-full border border-[#1B4332]/70 bg-[#0D1F17] px-2 py-0.5 text-[10px] text-[#40916C]">
              {patron.tierLabel}
            </span>
            <span className="sr-only">{patron.sourceLabel}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
