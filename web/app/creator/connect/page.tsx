"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Zap
} from "lucide-react";
import { RELAY_API_BASE } from "@/lib/relay-api";

const PATREON_OAUTH_HREF = "/patreon/connect";

/* Pre-defined outside JSX — avoids JSX inside array literals (SWC parser issue). */
const OAUTH_BENEFITS = [
  { icon: ShieldCheck, label: "Proves you own the account" },
  { icon: Lock, label: "Preserves tier structure and paywalls" },
  { icon: RefreshCw, label: "Keeps tokens fresh automatically" }
] as const;

/* ── Shared step card ───────────────────────────────────────────── */
function StepCard({
  n,
  label,
  children
}: {
  n: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        background: "#141414",
        borderColor: "#252525",
        boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)"
      }}
    >
      <div
        className="flex items-center gap-3 border-b px-6 py-4"
        style={{ borderColor: "#222222", background: "#161616" }}
      >
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: "#1A1A1A", color: "#6B7280", border: "1px solid #333333" }}
        >
          {n}
        </div>
        <span className="text-sm font-semibold" style={{ color: "#F9FAFB" }}>
          {label}
        </span>
      </div>
      <div className="px-6 py-6">{children}</div>
    </div>
  );
}

/* ── DevTools step row ──────────────────────────────────────────── */
function DevStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div
        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: "#0D1F17", color: "#40916C" }}
      >
        {n}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>{children}</p>
    </div>
  );
}

/* ── Session key save form ──────────────────────────────────────── */
function SessionKeyForm() {
  const defaultCreatorId = process.env.NEXT_PUBLIC_RELAY_CREATOR_ID ?? "dev_creator";
  const [sessionKey, setSessionKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSave() {
    if (!sessionKey.trim()) return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch(`${RELAY_API_BASE}/api/v1/patreon/cookie`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creator_id: defaultCreatorId, session_id: sessionKey.trim() })
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(json.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      setStatus("saved");
      setSessionKey("");
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error).message);
    }
  }

  if (status === "saved") {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-4"
        style={{ background: "#0D1F17", borderColor: "#2D6A4F" }}
      >
        <CheckCircle2 size={18} style={{ color: "#40916C" }} />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold" style={{ color: "#F9FAFB" }}>
            Session key saved
          </p>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            Your library will now sync with full media. Remove anytime from Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="password"
          value={sessionKey}
          onChange={(e) => setSessionKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="Paste session key here…"
          className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors"
          style={{
            background: "#0D0D0D",
            borderColor: sessionKey ? "#2D6A4F" : "#222222",
            color: "#F9FAFB"
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!sessionKey.trim() || status === "saving"}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors duration-150 disabled:opacity-40"
          style={{ background: "#2D6A4F", color: "#F9FAFB" }}
          onMouseEnter={(e) => {
            if (sessionKey.trim())
              (e.currentTarget as HTMLElement).style.background = "#40916C";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#2D6A4F";
          }}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
      {status === "error" && errorMsg && (
        <p className="text-xs" style={{ color: "#F87171" }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function CreatorConnectPage() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center px-5 py-12"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      {/* Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 flex items-center justify-center"
      >
        <div
          className="h-[500px] w-[700px] rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(ellipse at center, #2D6A4F 0%, transparent 70%)",
            filter: "blur(80px)"
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-2xl">

        {/* Back */}
        <Link
          href="/landing"
          className="mb-8 inline-flex items-center gap-1.5 text-xs transition-colors duration-150"
          style={{ color: "#6B7280" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#F9FAFB")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#6B7280")}
        >
          <ArrowRight size={12} className="rotate-180" />
          Back
        </Link>

        {/* Header */}
        <div className="mb-10 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: "#0D1F17", color: "#40916C" }}
            >
              <Zap size={14} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#40916C" }}>
              For Creators
            </span>
          </div>
          <h1
            className="text-balance text-3xl font-semibold leading-snug tracking-tight sm:text-4xl"
            style={{ color: "#F9FAFB" }}
          >
            Connect your Patreon
          </h1>
          <p className="max-w-lg text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
            Two steps bring your full archive — posts, media, tiers, paywalls — onto your own Relay server.
          </p>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-4">

          {/* ── Step 1: OAuth ─────────────────────────────── */}
          <StepCard n="1" label="Connect your account">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4">
                {OAUTH_BENEFITS.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "#0D1F17", color: "#40916C" }}
                    >
                      <Icon size={15} />
                    </div>
                    <span className="text-sm" style={{ color: "#9CA3AF" }}>{label}</span>
                  </div>
                ))}
              </div>
              <Link
                href={PATREON_OAUTH_HREF}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold transition-colors duration-150"
                style={{ background: "#2D6A4F", color: "#F9FAFB" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#40916C")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#2D6A4F")}
              >
                Continue to Patreon
                <ArrowRight size={15} />
              </Link>
            </div>
          </StepCard>

          {/* Connector */}
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-1">
              <div className="h-4 w-px" style={{ background: "#222222" }} />
              <span className="text-xs" style={{ color: "#374151" }}>then</span>
              <div className="h-4 w-px" style={{ background: "#222222" }} />
            </div>
          </div>

          {/* ── Step 2: Session key ───────────────────────── */}
          <StepCard n="2" label="Get your session key (optional)">
            <div className="flex flex-col gap-6">

              <p className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
                Patreon marks its session cookie as{" "}
                <code
                  className="rounded px-1 py-0.5 text-xs"
                  style={{ background: "#1A1A1A", color: "#9CA3AF", border: "1px solid #2A2A2A" }}
                >
                  HttpOnly
                </code>
                {" "}— which means browser extensions and scripts can&apos;t read it automatically.
                You&apos;ll need to copy it yourself from your browser&apos;s developer tools. It takes about 30 seconds.
              </p>

              {/* DevTools steps */}
              <div
                className="flex flex-col gap-1 rounded-2xl border"
                style={{ background: "#111111", borderColor: "#222222" }}
              >
                {/* Header */}
                <div
                  className="flex items-center gap-2.5 rounded-t-2xl border-b px-5 py-3.5"
                  style={{ borderColor: "#1E1E1E", background: "#161616" }}
                >
                  <Monitor size={14} style={{ color: "#40916C" }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>
                    From your browser — logged in to patreon.com
                  </span>
                </div>

                <div className="flex flex-col gap-4 p-5">
                  <DevStep n={1}>
                    Open{" "}
                    <a
                      href="https://www.patreon.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                      style={{ color: "#40916C" }}
                    >
                      patreon.com
                    </a>
                    {" "}and make sure you&apos;re logged in as the creator.
                  </DevStep>

                  <DevStep n={2}>
                    Press{" "}
                    <kbd
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={{ background: "#1A1A1A", color: "#D1D5DB", border: "1px solid #333" }}
                    >
                      F12
                    </kbd>
                    {" "}(or{" "}
                    <kbd
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={{ background: "#1A1A1A", color: "#D1D5DB", border: "1px solid #333" }}
                    >
                      Cmd+Option+I
                    </kbd>
                    {" "}on Mac) to open DevTools.
                  </DevStep>

                  <DevStep n={3}>
                    Click the{" "}
                    <strong style={{ color: "#F9FAFB" }}>Application</strong>
                    {" "}tab at the top of DevTools.
                  </DevStep>

                  <DevStep n={4}>
                    In the left sidebar: expand{" "}
                    <strong style={{ color: "#F9FAFB" }}>Storage</strong>
                    {" "}→{" "}
                    <strong style={{ color: "#F9FAFB" }}>Cookies</strong>
                    {" "}→ click{" "}
                    <strong style={{ color: "#F9FAFB" }}>https://www.patreon.com</strong>.
                  </DevStep>

                  <DevStep n={5}>
                    Find the row named{" "}
                    <code
                      className="rounded px-1 py-0.5 text-xs"
                      style={{ background: "#0D1F17", color: "#40916C", border: "1px solid #1B4332" }}
                    >
                      session_id
                    </code>
                    , click the value cell, select all, and copy.
                  </DevStep>
                </div>

                {/* Note about HttpOnly */}
                <div
                  className="flex items-start gap-2.5 rounded-b-2xl border-t px-5 py-3"
                  style={{ borderColor: "#1E1E1E", background: "#0D0D0D" }}
                >
                  <div className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: "#2D6A4F" }} />
                  <p className="text-xs leading-relaxed" style={{ color: "#6B7280" }}>
                    The Application tab is the only place you can see{" "}
                    <code
                      className="rounded px-1 py-0.5"
                      style={{ background: "#111111", color: "#6B7280" }}
                    >
                      HttpOnly
                    </code>
                    {" "}cookies — scripts and extensions can&apos;t reach them.
                  </p>
                </div>
              </div>

              <div className="h-px" style={{ background: "#1E1E1E" }} />

              {/* Paste field */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>
                  Paste your session key
                </p>
                <SessionKeyForm />
              </div>
            </div>
          </StepCard>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs" style={{ color: "#374151" }}>
          You can skip Step 2 and add the session key later from your library settings.
        </p>
      </div>
    </div>
  );
}
