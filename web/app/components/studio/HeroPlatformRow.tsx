"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ExternalLink, RefreshCw } from "lucide-react";
import {
  CHIP_META,
  isPresenceDestination,
  PlatformIcon
} from "@/app/components/distribution/platform-presence-chips";
import type { HeroPlatformRow } from "@/lib/hero-inspect-data";

/** v0 PLATFORM_CONFIG colors (hero fidelity). */
export const HERO_PLATFORM_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  patreon: { label: "Patreon", color: "#F96854" },
  x: { label: "X / Twitter", color: "#3B82F6" },
  deviantart: { label: "DeviantArt", color: "#4ADE80" },
  bluesky: { label: "Bluesky", color: "#0085FF" },
  relay: { label: "Relay", color: "#9bf0c4" }
};

function platformMeta(destination: string): { label: string; color: string } {
  if (HERO_PLATFORM_CONFIG[destination]) return HERO_PLATFORM_CONFIG[destination]!;
  if (isPresenceDestination(destination)) {
    return { label: CHIP_META[destination].label, color: CHIP_META[destination].color };
  }
  return { label: destination, color: "#888" };
}

/** Present rows always show a number (0 when metrics are missing). */
function fmtPresent(n: number | undefined): string {
  const v = n ?? 0;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return v.toLocaleString();
}

function formatRetryHint(seconds: number | undefined): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  if (s <= 0) return "Refresh cooling down";
  if (s < 60) return `Try again in ${s}s`;
  const mins = Math.ceil(s / 60);
  return `Try again in ${mins}m`;
}

export function HeroPresentRow({
  row,
  delay = 0,
  onOpen,
  onRefresh,
  refreshBusy
}: {
  row: HeroPlatformRow;
  delay?: number;
  onOpen?: (externalUrl: string) => void;
  onRefresh?: (platformInstanceId: string) => void;
  refreshBusy?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [refreshedFlash, setRefreshedFlash] = useState(false);
  const wasBusyRef = useRef(false);
  const config = platformMeta(row.destination);
  const url = row.external_url?.trim() || null;
  const impressions = row.stats.impressions ?? row.stats.reach ?? 0;
  const showRefresh = Boolean(row.platform_instance_id) &&
    (Boolean(row.refresh_eligible) || Boolean(row.cooldown_active));
  const refreshDisabled =
    Boolean(refreshBusy) || Boolean(row.cooldown_active) || !row.refresh_eligible;
  const refreshTitle = row.cooldown_active
    ? formatRetryHint(row.retry_after_seconds)
    : `Refresh ${config.label}`;

  useEffect(() => {
    if (wasBusyRef.current && !refreshBusy) {
      setRefreshedFlash(true);
      const t = window.setTimeout(() => setRefreshedFlash(false), 1600);
      wasBusyRef.current = false;
      return () => window.clearTimeout(t);
    }
    wasBusyRef.current = Boolean(refreshBusy);
  }, [refreshBusy]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, delay, ease: [0.34, 1.06, 0.64, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="overflow-hidden rounded-xl border transition-all duration-200"
      style={{
        background: "#0c0c0c",
        borderColor: hovered ? `${config.color}60` : row.destination === "relay" ? "#2a3a33" : "#242424",
        boxShadow: hovered ? `0 0 16px ${config.color}18` : "none"
      }}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{ background: config.color }}
          />
          <PlatformIcon destination={row.destination} size={14} color={config.color} />
          <span className="text-[11px] font-semibold" style={{ color: config.color }}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {refreshedFlash && !refreshBusy ? (
            <span style={{ color: "#9bf0c4" }}>
              <Check size={10} />
            </span>
          ) : null}
          {showRefresh ? (
            <button
              type="button"
              disabled={refreshDisabled}
              title={refreshTitle}
              aria-label={refreshTitle}
              className="flex items-center justify-center rounded-lg transition-all duration-150 disabled:opacity-40"
              style={{
                width: 24,
                height: 24,
                border: "1px solid #2a2a2a",
                background: "#0a0a0a",
                color: refreshBusy ? "#9bf0c4" : "#555"
              }}
              onClick={() => {
                if (!row.platform_instance_id || !onRefresh || refreshDisabled) return;
                onRefresh(row.platform_instance_id);
              }}
              onMouseEnter={(e) => {
                if (!refreshDisabled) e.currentTarget.style.color = "#9bf0c4";
              }}
              onMouseLeave={(e) => {
                if (!refreshBusy) e.currentTarget.style.color = "#555";
              }}
            >
              <RefreshCw size={11} className={refreshBusy ? "animate-spin" : undefined} />
            </button>
          ) : null}
          {url ? (
            <button
              type="button"
              aria-label={`Open on ${config.label}`}
              className="flex items-center justify-center rounded-lg transition-all duration-150"
              style={{
                width: 24,
                height: 24,
                border: "1px solid #2a2a2a",
                background: "#0a0a0a",
                color: "#555"
              }}
              onClick={() => onOpen?.(url)}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#9bf0c4";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#555";
              }}
            >
              <ExternalLink size={11} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-4 px-3 pb-2.5">
        {[
          { label: "Impressions", value: fmtPresent(impressions) },
          { label: "Likes", value: fmtPresent(row.stats.likes) },
          { label: "Comments", value: fmtPresent(row.stats.comments) }
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <span
              className="text-[18px] font-semibold leading-none tabular-nums"
              style={{ color: "#ddd" }}
            >
              {s.value}
            </span>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: "#444" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
      {row.stats_missing && row.destination === "patreon" ? (
        <p className="px-3 pb-2.5 text-[10px] leading-snug" style={{ color: "#666" }}>
          No Insights data yet —{" "}
          <Link
            href="/studio/analytics"
            className="underline underline-offset-2 transition-colors"
            style={{ color: "#888" }}
          >
            upload a Patreon Insights CSV
          </Link>{" "}
          or refresh with the Relay extension.
        </p>
      ) : null}
    </motion.div>
  );
}

export function HeroGapRow({
  destination,
  delay = 0,
  onFill
}: {
  destination: string;
  delay?: number;
  onFill: (destination: string) => void;
}) {
  const config = platformMeta(destination);

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, delay, ease: [0.34, 1.06, 0.64, 1] }}
      className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
      style={{
        borderColor: `${config.color}30`,
        borderStyle: "dashed",
        background: "transparent"
      }}
    >
      <div className="opacity-35">
        <PlatformIcon destination={destination} size={16} color={config.color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px]" style={{ color: "#555" }}>
          Not on {config.label} yet
        </p>
      </div>
      <button
        type="button"
        onClick={() => onFill(destination)}
        className="flex-shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition-all duration-150"
        style={{
          borderColor: `${config.color}35`,
          color: config.color,
          background: `${config.color}0d`
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `${config.color}1a`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = `${config.color}0d`;
        }}
      >
        Cross-post
      </button>
    </motion.div>
  );
}
