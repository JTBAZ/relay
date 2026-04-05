"use client";

import { useState } from "react";
import { Users, Palette, CheckCircle2, Loader2 } from "lucide-react";

type PatreonMode =
  | "choose"
  | "creator-pending"
  | "patron-pending"
  | "creator-success"
  | "patron-success"
  | "error";

export function PatreonPanel() {
  const [mode, setMode] = useState<PatreonMode>("choose");

  const handleConnect = (type: "creator" | "patron") => {
    setMode(type === "creator" ? "creator-pending" : "patron-pending");
    setTimeout(() => {
      setMode(type === "creator" ? "creator-success" : "patron-success");
    }, 2000);
  };

  const handleError = () => setMode("error");
  const handleReset = () => setMode("choose");

  return (
    <div className="space-y-4">
      {mode === "choose" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleConnect("creator")}
            className="group flex w-full items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--relay-green-600)]"
            style={{
              background: "#111111",
              borderColor: "#2A2A2A",
              color: "#F9FAFB"
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2D6A4F";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2A2A2A";
            }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              style={{ background: "#0D1F17" }}
            >
              <Palette size={16} style={{ color: "#40916C" }} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
                Connect as Creator
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "#9CA3AF" }}>
                Link your Patreon creator account
              </p>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0 transition-transform group-hover:translate-x-0.5"
              style={{ color: "#9CA3AF" }}
              aria-hidden
            >
              <path
                d="M6 12l4-4-4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => handleConnect("patron")}
            className="group flex w-full items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--relay-green-600)]"
            style={{
              background: "#111111",
              borderColor: "#2A2A2A",
              color: "#F9FAFB"
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2D6A4F";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2A2A2A";
            }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              style={{ background: "#0D1F17" }}
            >
              <Users size={16} style={{ color: "#40916C" }} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
                Connect as Patron
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "#9CA3AF" }}>
                Link your Patreon supporter account
              </p>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0 transition-transform group-hover:translate-x-0.5"
              style={{ color: "#9CA3AF" }}
              aria-hidden
            >
              <path
                d="M6 12l4-4-4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleError}
            className="w-full pt-1 text-center text-xs transition-colors"
            style={{ color: "#6B7280" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#6B7280")}
          >
            Preview error state →
          </button>
        </div>
      )}

      {(mode === "creator-pending" || mode === "patron-pending") && (
        <div
          className="flex flex-col items-center justify-center gap-4 rounded-lg border py-8"
          style={{ background: "#111111", borderColor: "#2A2A2A" }}
        >
          <Loader2 size={28} className="animate-spin" style={{ color: "#2D6A4F" }} aria-hidden />
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
              Connecting to Patreon…
            </p>
            <p className="mt-1 text-xs" style={{ color: "#9CA3AF" }}>
              {mode === "creator-pending" ? "Authorizing creator account" : "Authorizing patron account"}
            </p>
          </div>
        </div>
      )}

      {(mode === "creator-success" || mode === "patron-success") && (
        <div
          className="flex flex-col items-center justify-center gap-4 rounded-lg border py-8"
          style={{ background: "#0D1F17", borderColor: "#1B4332" }}
        >
          <CheckCircle2 size={28} style={{ color: "#40916C" }} aria-hidden />
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
              {mode === "creator-success" ? "Creator account connected" : "Patron account connected"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "#40916C" }}>
              Redirecting to your dashboard…
            </p>
          </div>
          <button type="button" onClick={handleReset} className="text-xs transition-colors" style={{ color: "#9CA3AF" }}>
            Reset demo
          </button>
        </div>
      )}

      {mode === "error" && (
        <div
          className="space-y-3 rounded-lg border px-4 py-4"
          style={{ background: "#1A0A0A", borderColor: "#7F1D1D" }}
        >
          <div className="flex items-start gap-3">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="mt-0.5 shrink-0"
              aria-hidden
            >
              <circle cx="8" cy="8" r="7" stroke="#FCA5A5" strokeWidth="1.2" />
              <path d="M8 5v4" stroke="#FCA5A5" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.75" fill="#FCA5A5" />
            </svg>
            <div>
              <p className="text-sm font-medium" style={{ color: "#FCA5A5" }}>
                Connection failed
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "#9CA3AF" }}>
                Patreon returned an error. Please try again or contact support.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ background: "#2A2A2A", color: "#F9FAFB" }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
