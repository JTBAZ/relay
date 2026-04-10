"use client";

import type { PatronFeedDataSource } from "@/lib/relay-fixtures";

const RELAY_API_BASE = (process.env.NEXT_PUBLIC_RELAY_API_URL ?? "http://127.0.0.1:8787").replace(
  /\/+$/,
  ""
);

export function PatronFeedDevTools({
  dataSource,
  onDataSourceChange,
  liveLoading,
  liveError,
}: {
  dataSource: PatronFeedDataSource;
  onDataSourceChange: (next: PatronFeedDataSource) => void;
  liveLoading: boolean;
  liveError: string | null;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[min(100vw-2rem,17rem)] rounded-lg border border-[#222222] bg-[#111111] p-2.5 shadow-xl">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5A5A5A]">
        Dev · patron feed
      </p>
      <label className="sr-only" htmlFor="relay-patron-feed-data-source">
        Feed data source
      </label>
      <select
        id="relay-patron-feed-data-source"
        value={dataSource}
        onChange={(e) => {
          const v = e.target.value;
          onDataSourceChange(v === "live" ? "live" : "fixtures");
        }}
        className="w-full rounded-md border border-[#222222] bg-[#0A0A0A] px-2 py-1.5 text-[11px] text-[#C8C8C8]"
      >
        <option value="fixtures">Mock fixtures</option>
        <option value="live">Live API (Bearer)</option>
      </select>
      {liveLoading ? (
        <p className="mt-1.5 text-[9px] text-[#6B7280]">Loading feed…</p>
      ) : liveError ? (
        <p className="mt-1.5 text-[9px] leading-snug text-[#B45353]" title={liveError}>
          {liveError.length > 120 ? `${liveError.slice(0, 120)}…` : liveError}
        </p>
      ) : null}
      <p className="mt-1.5 text-[9px] leading-snug text-[#5A5A5A]">
        <span className="text-[#3A3A3A]">GET</span>{" "}
        <code className="text-[8px] text-[#6B7280]">/api/v1/patron/relay_feed</code>
      </p>
      <p className="mt-1 text-[9px] leading-snug text-[#5A5A5A]">
        API: <code className="text-[8px] text-[#6B7280]">{RELAY_API_BASE}</code>
      </p>
    </div>
  );
}
