"use client";

import { useState } from "react";
import { RelayLogo } from "@/app/components/auth/relay-logo";
import { TrustMarks } from "@/app/components/auth/trust-marks";
import { PatreonPanel } from "@/app/components/auth/patreon-panel";
import { EmailPanel } from "@/app/components/auth/email-panel";

type AuthTab = "patreon" | "email";

const PatreonIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="14.5" cy="9.5" r="6.5" />
    <rect x="3" y="3" width="3.5" height="18" rx="1" />
  </svg>
);

export function AuthHub() {
  const [tab, setTab] = useState<AuthTab>("patreon");

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-12"
      style={{ background: "#0A0A0A" }}
    >
      <div className="w-full max-w-[400px] space-y-8">
        <div className="flex flex-col items-center gap-3">
          <RelayLogo size="md" />
          <p className="text-center text-sm" style={{ color: "#9CA3AF" }}>
            Your creative intelligence platform
          </p>
        </div>

        <div className="space-y-5 rounded-xl border p-6" style={{ background: "#111111", borderColor: "#2A2A2A" }}>
          <div className="space-y-1">
            <h1 className="font-sans text-base font-semibold" style={{ color: "#F9FAFB" }}>
              Access Relay
            </h1>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>
              Connect your Patreon or sign in with email.
            </p>
          </div>

          <div
            className="flex gap-0.5 rounded-lg p-0.5"
            style={{ background: "#0A0A0A", border: "1px solid #2A2A2A" }}
            role="tablist"
            aria-label="Sign-in path"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "patreon"}
              aria-controls="panel-patreon"
              onClick={() => setTab("patreon")}
              className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
              style={
                tab === "patreon"
                  ? { background: "#1A1A1A", color: "#F9FAFB", border: "1px solid #2A2A2A" }
                  : { color: "#9CA3AF", border: "1px solid transparent" }
              }
            >
              <PatreonIcon size={13} />
              Patreon
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "email"}
              aria-controls="panel-email"
              onClick={() => setTab("email")}
              className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
              style={
                tab === "email"
                  ? { background: "#1A1A1A", color: "#F9FAFB", border: "1px solid #2A2A2A" }
                  : { color: "#9CA3AF", border: "1px solid transparent" }
              }
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M1.5 3.5l5.5 4 5.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Email
            </button>
          </div>

          <div id="panel-patreon" role="tabpanel" aria-label="Patreon sign-in" hidden={tab !== "patreon"}>
            {tab === "patreon" && <PatreonPanel />}
          </div>
          <div id="panel-email" role="tabpanel" aria-label="Email sign-in" hidden={tab !== "email"}>
            {tab === "email" && <EmailPanel />}
          </div>

          {tab === "patreon" && (
            <div className="flex items-center gap-3 pt-1">
              <div className="h-px flex-1" style={{ background: "#2A2A2A" }} />
              <button
                type="button"
                onClick={() => setTab("email")}
                className="whitespace-nowrap text-xs transition-colors"
                style={{ color: "#6B7280" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#6B7280")}
              >
                Or use email instead
              </button>
              <div className="h-px flex-1" style={{ background: "#2A2A2A" }} />
            </div>
          )}
        </div>

        <TrustMarks />

        <p className="text-center text-xs" style={{ color: "#6B7280" }}>
          Need help?{" "}
          <a
            href="mailto:support@relay.example"
            className="underline transition-colors"
            style={{ color: "#9CA3AF" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "#40916C")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "#9CA3AF")}
          >
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
