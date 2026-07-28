"use client";

import Link from "next/link";
import { ArrowRight, Link2, Sparkles } from "lucide-react";
import { isSubscribeStarCreatorConnectUiEnabled } from "@/lib/subscribestar-connect-ui";

/**
 * Unified post-login Patreon entry (Unified Relay Identity).
 * One primary Connect Patreon action uses the session-first identity/membership grant.
 * Elevated Studio sync remains a separate consent after Enable Studio.
 * Return-user creator reconnect stays available as a secondary shortcut.
 */
export function PatreonOAuthLinks() {
  const showSubscribeStar = isSubscribeStarCreatorConnectUiEnabled();
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed" style={{ color: "#9CA3AF" }}>
        Sign in to Relay first, then connect Patreon once. Relay loads your memberships and
        owned campaign. Enabling Studio is a separate, explicit step with creator-only
        permissions.
      </p>
      <Link
        href="/connect/patreon/patron/connect"
        className="group flex w-full items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
        style={{ background: "#111111", borderColor: "#2A2A2A", color: "#F9FAFB" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ background: "#0D1F17" }}
        >
          <Link2 size={16} style={{ color: "#40916C" }} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
            Connect Patreon
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "#9CA3AF" }}>
            Link your Patreon identity, memberships, and optional Studio path
          </p>
        </div>
        <ArrowRight
          size={16}
          className="shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: "#9CA3AF" }}
          aria-hidden
        />
      </Link>

      <Link
        href="/connect/patreon/connect"
        className="group flex w-full items-center gap-4 rounded-lg border px-4 py-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
        style={{ background: "#0A0A0A", borderColor: "#1F1F1F", color: "#F9FAFB" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: "#D1D5DB" }}>
            Already have a Studio? Reconnect sync
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "#6B7280" }}>
            Elevated creator OAuth for posts, members, and webhooks
          </p>
        </div>
        <ArrowRight
          size={14}
          className="shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: "#6B7280" }}
          aria-hidden
        />
      </Link>

      {showSubscribeStar ? (
        <Link
          href="/connect/subscribestar/connect/creator"
          className="group flex w-full items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
          style={{ background: "#111111", borderColor: "#2A2A2A", color: "#F9FAFB" }}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
            style={{ background: "rgba(245, 158, 11, 0.12)" }}
          >
            <Sparkles size={16} style={{ color: "#F59E0B" }} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
              Connect SubscribeStar
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "#9CA3AF" }}>
              Outside Patreon-only pilot scope when disabled by env
            </p>
          </div>
          <ArrowRight
            size={16}
            className="shrink-0 transition-transform group-hover:translate-x-0.5"
            style={{ color: "#9CA3AF" }}
            aria-hidden
          />
        </Link>
      ) : null}
    </div>
  );
}
