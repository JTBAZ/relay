"use client";

import Link from "next/link";
import { X } from "lucide-react";
import {
  shouldPromptConnectCampaign,
  type PatronConnectCampaignPayload
} from "@/lib/patron-connect-campaign-prompt";

function truncateId(id: string): string {
  if (id.length <= 18) return id;
  return `${id.slice(0, 10)}…${id.slice(-4)}`;
}

interface ConnectCampaignModalProps {
  isOpen: boolean;
  /** Null = generic “link a creator campaign” copy (e.g. opened from Settings with no snapshot). */
  payload: PatronConnectCampaignPayload | null;
  onClose: () => void;
}

export function ConnectCampaignModal({ isOpen, payload, onClose }: ConnectCampaignModalProps) {
  if (!isOpen) return null;

  const hasDetail = payload && shouldPromptConnectCampaign(payload);
  const unmapped = payload?.unmapped_patreon_campaign_ids ?? [];
  const ownedId = payload?.owned_relay_creator_id?.trim() ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_0.2s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-campaign-title"
    >
      <div className="absolute inset-0 bg-black/95" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-xl border border-[#1A1A1A] bg-[#0E0E0E] p-6 shadow-2xl animate-[scaleIn_0.2s_ease-out]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="connect-campaign-title"
            className="text-lg font-semibold text-[#E0E0E0]"
          >
            Connect your Patreon campaign
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1 text-[#555555] transition-colors hover:text-[#888888]"
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-[#A1A1A1]">
          {!hasDetail ? (
            <p>
              Link your Patreon creator account in Relay when you&apos;re ready to publish as an
              artist. You can connect from creator onboarding anytime.
            </p>
          ) : (
            <>
              {unmapped.length > 0 ? (
                <p>
                  Relay found Patreon campaign
                  {unmapped.length === 1 ? "" : "s"} that aren&apos;t linked to a Relay creator
                  profile yet. When you publish on Patreon, connect your campaign so Relay can treat
                  you as a creator.
                </p>
              ) : null}
              {unmapped.length > 0 ? (
                <ul className="list-inside list-disc space-y-1 font-mono text-xs text-[#888888]">
                  {unmapped.map((id) => (
                    <li key={id}>{truncateId(id)}</li>
                  ))}
                </ul>
              ) : null}
              {ownedId ? (
                <p>
                  Your Patreon campaign is linked to Relay as creator{" "}
                  <span className="text-[#C8C8C8]">{truncateId(ownedId)}</span>. Open Relay Studio to
                  manage your page and posts.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#2A2A2A] px-4 py-2 text-xs font-medium text-[#C8C8C8] transition-colors hover:bg-[#141414]"
          >
            Not now
          </button>
          {ownedId ? (
            <Link
              href="/designer"
              className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#40916C]"
              onClick={onClose}
            >
              Open Relay Studio
            </Link>
          ) : (
            <Link
              href="/creator/connect"
              className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#40916C]"
              onClick={onClose}
            >
              Creator connect
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
