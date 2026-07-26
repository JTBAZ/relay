"use client";

import Link from "next/link";
import {
  Eye,
  EyeOff,
  Lock,
  Wallet,
  type LucideIcon
} from "lucide-react";
import type { ViewerEntitlementState } from "@/lib/relay-api";

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function GatedTile({
  creatorId,
  label,
  state,
  requiredTierIds,
  source
}: {
  creatorId: string;
  label: string;
  state: ViewerEntitlementState;
  requiredTierIds: string[];
  source: string;
}) {
  const isFullyVisible = state === "visible";
  const isPreview = state === "preview";
  const isUnlockable = state === "unlockable";
  const blur = isFullyVisible ? "0px" : isPreview ? "6px" : "14px";
  const dim = isFullyVisible ? 1 : 0.55;

  return (
    <div
      className="group relative overflow-hidden rounded-lg border"
      style={{ borderColor: "#2A2A2A", background: "#0d0d0d" }}
    >
      <div
        aria-hidden
        className="aspect-[4/5] w-full"
        style={{
          background:
            "linear-gradient(135deg, #1d2433 0%, #2a1d3a 50%, #1d2433 100%)",
          filter: `blur(${blur})`,
          opacity: dim,
          transition: "filter 200ms ease, opacity 200ms ease"
        }}
      />

      <div className="absolute left-2 top-2">
        <EntitlementBadge state={state} />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2">
        <span
          className="truncate text-[10px]"
          style={{ color: "#9CA3AF" }}
          title={creatorId}
        >
          {creatorId}
        </span>
        <span className="truncate text-[11px]" style={{ color: "#E5E7EB" }}>
          {label}
        </span>
      </div>

      {!isFullyVisible ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center"
          style={{ background: "rgba(10,10,10,0.45)" }}
        >
          <GateCallout
            state={state}
            requiredTierIds={requiredTierIds}
            source={source}
          />
          {isUnlockable ? (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-md border px-3 py-1.5 text-[11px] font-medium opacity-90"
              style={{
                background: "#2D6A4F",
                borderColor: "#40916C",
                color: "#F9FAFB"
              }}
              title="Tip-to-unlock arrives in PE-L."
            >
              Tip to unlock (soon)
            </button>
          ) : null}
          {state === "locked" ? (
            <Link
              href={`/${encodeURIComponent(creatorId)}`}
              className="rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors hover:border-[#40916C] hover:text-[#F9FAFB]"
              style={{ borderColor: "#2A2A2A", color: "#E5E7EB" }}
            >
              Upgrade tier
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EntitlementBadge({ state }: { state: ViewerEntitlementState }) {
  const config: Record<
    ViewerEntitlementState,
    { label: string; color: string; bg: string; border: string; Icon: LucideIcon }
  > = {
    visible: {
      label: "Visible",
      color: "#86efac",
      bg: "rgba(20, 35, 25, 0.85)",
      border: "#1f3d2c",
      Icon: Eye
    },
    preview: {
      label: "Preview",
      color: "#93c5fd",
      bg: "rgba(20, 25, 40, 0.85)",
      border: "#1e3a5f",
      Icon: EyeOff
    },
    unlockable: {
      label: "Tip to unlock",
      color: "#fcd34d",
      bg: "rgba(40, 30, 10, 0.85)",
      border: "#3a3315",
      Icon: Wallet
    },
    locked: {
      label: "Locked",
      color: "#fca5a5",
      bg: "rgba(40, 18, 18, 0.85)",
      border: "#5a1f1f",
      Icon: Lock
    }
  };
  const { label, color, bg, border, Icon } = config[state];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{ background: bg, borderColor: border, color }}
    >
      <Icon size={10} aria-hidden />
      {label}
    </span>
  );
}

export function GateCallout({
  state,
  requiredTierIds,
  source
}: {
  state: ViewerEntitlementState;
  requiredTierIds: string[];
  source: string;
}) {
  const tierBlurb =
    requiredTierIds.length === 0
      ? null
      : `Tier${requiredTierIds.length === 1 ? "" : "s"}: ${requiredTierIds
          .map(shortId)
          .join(", ")}`;
  const sourceBlurb =
    source === "inactive_snapshot"
      ? "Your tier here lapsed."
      : source === "missing_snapshot"
        ? "We don't have an active tier for this creator yet."
        : null;
  const headline =
    state === "preview"
      ? "Preview only"
      : state === "unlockable"
        ? "Available with a tip"
        : "Locked";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold" style={{ color: "#F9FAFB" }}>
        {headline}
      </span>
      {tierBlurb ? (
        <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
          {tierBlurb}
        </span>
      ) : null}
      {sourceBlurb ? (
        <span className="text-[10px]" style={{ color: "#fca5a5" }}>
          {sourceBlurb}
        </span>
      ) : null}
    </div>
  );
}
