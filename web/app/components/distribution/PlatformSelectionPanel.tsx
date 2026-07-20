"use client";

import { useEffect, useState } from "react";
import {
  fetchConnectedPlatforms,
  type ConnectedPlatformWire,
  type DistributionDestination
} from "@/lib/relay-api";

type Props = {
  selected: DistributionDestination[];
  assistantByDestination: Record<string, boolean>;
  onSelectedChange: (next: DistributionDestination[]) => void;
  onAssistantChange: (dest: DistributionDestination, enabled: boolean) => void;
  postingAssistantAllowed?: boolean;
};

export function PlatformSelectionPanel({
  selected,
  assistantByDestination,
  onSelectedChange,
  onAssistantChange,
  postingAssistantAllowed = true
}: Props) {
  const [platforms, setPlatforms] = useState<ConnectedPlatformWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const { platforms: rows } = await fetchConnectedPlatforms();
        if (!cancelled) setPlatforms(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (dest: DistributionDestination) => {
    onSelectedChange(
      selected.includes(dest) ? selected.filter((d) => d !== dest) : [...selected, dest]
    );
  };

  if (loading) {
    return <p className="text-xs text-[#9ca3af]">Loading connected platforms…</p>;
  }
  if (error) {
    return <p className="text-xs text-red-300" role="alert">{error}</p>;
  }

  return (
    <div className="space-y-3">
      {platforms.map((platform) => {
        const checked = selected.includes(platform.destination);
        const disabled = platform.readiness === "disabled" || platform.readiness === "unsupported";
        return (
          <div
            key={platform.destination}
            className="rounded-xl border p-3"
            style={{ borderColor: checked ? "rgba(0,170,111,0.4)" : "#2a2a2a", background: "#0a0a0a" }}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(platform.destination)}
                className="mt-1"
              />
              <span className="flex-1">
                <span className="text-sm font-medium text-[#f9fafb]">{platform.label}</span>
                <span className="block text-[11px] text-[#6b7280] mt-0.5">{platform.detail}</span>
                <span className="block text-[10px] text-[#4b5563] mt-0.5 capitalize">
                  {platform.readiness.replace(/_/g, " ")} · {platform.handoff}
                </span>
              </span>
            </label>
            {checked ? (
              <label className="mt-2 ml-7 flex items-center gap-2 text-xs text-[#9ca3af]">
                <input
                  type="checkbox"
                  checked={Boolean(assistantByDestination[platform.destination])}
                  disabled={!postingAssistantAllowed}
                  onChange={(e) => onAssistantChange(platform.destination, e.target.checked)}
                />
                Posting Assistant optimization
                {!postingAssistantAllowed ? (
                  <span className="text-[10px] text-[#6b7280]">
                    (upgrade required —{" "}
                    <a
                      href="/studio/settings/billing?feature=posting_assistant"
                      className="text-[#00AA6F] underline-offset-2 hover:underline"
                      data-testid="platform-assistant-billing-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View plans
                    </a>
                    )
                  </span>
                ) : null}
              </label>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
