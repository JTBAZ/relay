"use client";

import { motion } from "framer-motion";
import type { HeroInspectModel } from "@/lib/hero-inspect-data";

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString();
}

function StatRow({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b py-1.5" style={{ borderColor: "#1a2a20" }}>
      <span className="text-[12px]" style={{ color: "#667" }}>
        {label}
      </span>
      <span
        className="text-[16px] font-semibold tabular-nums"
        style={{ color: accent ? "#9bf0c4" : "#aaa" }}
      >
        {value}
      </span>
    </div>
  );
}

/** v0 RelayView — All Platforms + Ads/Teasers only (no Canonical panel). */
export default function HeroRelayPanels({
  relay
}: {
  relay: NonNullable<HeroInspectModel["relay"]>;
}) {
  const ads = relay.ads_teasers;
  const hasAds = ads.impressions > 0 || ads.likes > 0 || ads.comments > 0 || ads.total_reach > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex w-full flex-col gap-3"
    >
      <div
        className="rounded-2xl border p-5"
        style={{ background: "#0f1a14", borderColor: "#2a7a4a80" }}
      >
        <p className="mb-3 text-[10px] uppercase tracking-widest" style={{ color: "#4a9a6a" }}>
          All Platforms
        </p>
        <StatRow label="Impressions" value={fmt(relay.merged.impressions)} accent />
        <StatRow label="Likes" value={fmt(relay.merged.likes)} accent />
        <StatRow label="Comments" value={fmt(relay.merged.comments)} accent />
      </div>

      <div
        className="rounded-2xl border p-5"
        style={{ background: "#0d0d0d", borderColor: "#1f1f1f" }}
      >
        <p className="mb-3 text-[10px] uppercase tracking-widest" style={{ color: "#555" }}>
          Ads + Teasers performance
        </p>
        {hasAds ? (
          <>
            <StatRow label="Impressions" value={fmt(ads.impressions)} />
            <StatRow label="Likes" value={fmt(ads.likes)} />
            <StatRow label="Comments" value={fmt(ads.comments)} />
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "#444" }}>
            No ad or teaser variants tracked for this piece yet.
          </p>
        )}
      </div>
    </motion.div>
  );
}
