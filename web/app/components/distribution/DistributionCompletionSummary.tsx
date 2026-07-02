"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchPostDistributionSummary,
  type DistributionSummaryWire
} from "@/lib/relay-api";

type Props = {
  postId: string;
};

const DEST_LABELS: Record<string, string> = {
  patreon: "Patreon",
  x: "X",
  deviantart: "DeviantArt",
  bluesky: "Bluesky"
};

export function DistributionCompletionSummary({ postId }: Props) {
  const [summary, setSummary] = useState<DistributionSummaryWire | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { summary: s } = await fetchPostDistributionSummary(postId);
        if (!cancelled) setSummary(s);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  if (loading) {
    return <p className="text-xs text-[#9ca3af]">Loading distribution status…</p>;
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#f9fafb]">Relay complete</h2>
        <p className="text-xs text-[#9ca3af] mt-1 font-mono">{postId}</p>
      </div>
      <div className="grid gap-3">
        {(summary?.destinations ?? []).map((row) => {
          const posted = row.variant_status === "posted" || row.attempt_status === "posted";
          return (
            <div
              key={row.destination}
              className="rounded-xl border p-3 flex items-center justify-between gap-3"
              style={{
                borderColor: posted ? "rgba(0,170,111,0.4)" : "#2a2a2a",
                background: "#0a0a0a"
              }}
            >
              <div>
                <p className="text-sm font-medium text-[#f9fafb]">
                  {DEST_LABELS[row.destination] ?? row.destination}
                </p>
                <p className="text-[11px] text-[#6b7280] capitalize">
                  {row.variant_status ?? "not planned"}
                  {row.attempt_status ? ` · ${row.attempt_status}` : ""}
                </p>
              </div>
              {row.external_url ? (
                <a
                  href={row.external_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#00aa6f] underline"
                >
                  Open post
                </a>
              ) : (
                <span className="text-[10px] text-[#4b5563]">{posted ? "Posted" : "Pending"}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3">
        <Link
          href="/studio"
          className="flex-1 flex items-center justify-center py-2.5 rounded-xl text-sm border"
          style={{ borderColor: "#2a2a2a", color: "#9ca3af" }}
        >
          Back to Library
        </Link>
        <Link
          href="/studio/autopost"
          className="flex-1 flex items-center justify-center py-2.5 rounded-xl text-sm font-medium"
          style={{ background: "#1a1a1a", color: "#f9fafb" }}
        >
          Start another
        </Link>
      </div>
    </div>
  );
}
