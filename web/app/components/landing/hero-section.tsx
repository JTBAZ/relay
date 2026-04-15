"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Zap, Users, ArrowRight } from "lucide-react";

const STUB = {
  /** Account + DB + Library first; Patreon OAuth is linked from /login or /patreon/connect after sign-in. */
  creatorStart: "/login",
  creatorConnect: "/creator/connect",
  supporterSignIn: "/login"
};

const PATHS = {
  creator: {
    eyebrow: "For Creators",
    title: "Your content. Your gallery. Your audience.",
    description:
      "Your Patreon library — posts, media, tiers, paywalls — backed up and presented in a gallery your fans will actually use. Searchable, browsable, and fully under your control.",
    highlights: [
      "Your content backed up with paywalls intact — always exportable, always yours.",
      "A real gallery fans can search, browse, and fall into — not a reverse-chronological feed.",
      "New audiences find you through Relay; existing fans stay closer."
    ],
    ctaLabel: "Create your studio",
    ctaHref: STUB.creatorStart,
    secondaryLabel: "Already signed in? Connect Patreon",
    secondaryHref: STUB.creatorConnect,
    icon: <Zap size={16} />
  },
  supporter: {
    eyebrow: "For Supporters",
    title: "All your artists. One place. No noise.",
    description:
      "Your Patreon subscriptions unlock here automatically. Browse every creator you support in one clean feed — then discover new ones.",
    highlights: [
      "Your Patreon tiers work here — no extra cost, no re-subscribing.",
      "Browse, search, and collect across every artist you follow.",
      "Discover new creators you'd never find in a chronological feed."
    ],
    ctaLabel: "Connect Patreon to explore",
    ctaHref: STUB.supporterSignIn,
    secondaryLabel: undefined,
    secondaryHref: undefined,
    icon: <Users size={16} />
  }
};

function WindowBar({ label, onBack }: { label?: string; onBack?: () => void }) {
  return (
    <div
      className="flex items-center gap-3 rounded-t-2xl px-4 py-2.5"
      style={{ background: "#161616", borderBottom: "1px solid #222222" }}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs transition-colors duration-150"
          style={{ color: "#6B7280" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#F9FAFB")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#6B7280")}
        >
          <ArrowLeft size={12} />
          Back
        </button>
      ) : (
        <span className="text-xs font-medium" style={{ color: "#4B5563" }}>
          {label ?? "relay.app"}
        </span>
      )}
    </div>
  );
}

export function HeroSection() {
  const [selected, setSelected] = useState<"creator" | "supporter" | null>(null);
  const isExpanded = selected !== null;
  const path = selected ? PATHS[selected] : null;

  return (
    <section
      className="relative flex min-h-screen w-full flex-col items-center justify-center px-5 py-12"
      aria-label="Welcome to Relay"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div
          className="h-[500px] w-[700px] rounded-full opacity-[0.07]"
          style={{
            background: "radial-gradient(ellipse at center, #2D6A4F 0%, transparent 70%)",
            filter: "blur(80px)"
          }}
        />
      </div>

      <div
        className="relative z-10 flex flex-col items-center gap-6 transition-all duration-300"
        style={{ width: "100%", maxWidth: isExpanded ? "640px" : "420px" }}
      >
        {!isExpanded && (
          <div className="flex flex-col gap-1.5 text-center">
            <h1
              className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
              style={{ color: "#F9FAFB" }}
            >
              Where are you joining from?
            </h1>
            <p className="text-sm" style={{ color: "#4B5563" }}>
              Relay works differently depending on your role.
            </p>
          </div>
        )}

        <div
          className="w-full overflow-hidden rounded-2xl"
          style={{
            background: "#141414",
            border: "1px solid #252525",
            boxShadow: "0 24px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)"
          }}
        >
          {!isExpanded ? (
            <>
              <WindowBar label="relay.app" />
              <div className="flex flex-col gap-1.5 p-2.5">
                <button
                  type="button"
                  onClick={() => setSelected("creator")}
                  className="group flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all duration-150"
                  style={{ background: "#1A1A1A" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#1F2B23";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#1A1A1A";
                  }}
                >
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ background: "#0D1F17", color: "#40916C" }}
                  >
                    <Zap size={16} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold" style={{ color: "#F9FAFB" }}>
                      I&apos;m a Creator
                    </span>
                    <span className="text-xs" style={{ color: "#6B7280" }}>
                      Backup, gallery, and grow your audience
                    </span>
                  </div>
                  <ArrowRight
                    size={14}
                    className="flex-shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ color: "#40916C" }}
                  />
                </button>

                <div className="mx-3 h-px" style={{ background: "#1E1E1E" }} />

                <button
                  type="button"
                  onClick={() => setSelected("supporter")}
                  className="group flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all duration-150"
                  style={{ background: "#1A1A1A" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#1F2B23";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#1A1A1A";
                  }}
                >
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ background: "#0D1F17", color: "#40916C" }}
                  >
                    <Users size={16} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold" style={{ color: "#F9FAFB" }}>
                      I&apos;m a Supporter
                    </span>
                    <span className="text-xs" style={{ color: "#6B7280" }}>
                      All your artists in one clean feed
                    </span>
                  </div>
                  <ArrowRight
                    size={14}
                    className="flex-shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ color: "#40916C" }}
                  />
                </button>
              </div>

              <div
                className="flex items-center justify-center px-5 py-2.5"
                style={{ borderTop: "1px solid #1E1E1E" }}
              >
                <span className="text-xs" style={{ color: "#374151" }}>
                  You can always switch later.
                </span>
              </div>
            </>
          ) : (
            <>
              <WindowBar onBack={() => setSelected(null)} />
              <div className="flex flex-col gap-6 p-7">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-lg"
                    style={{ background: "#0D1F17", color: "#40916C" }}
                  >
                    {path!.icon}
                  </div>
                  <span
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#40916C" }}
                  >
                    {path!.eyebrow}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <h2
                    className="text-balance text-2xl font-semibold leading-snug sm:text-3xl"
                    style={{ color: "#F9FAFB" }}
                  >
                    {path!.title}
                  </h2>
                  <p className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
                    {path!.description}
                  </p>
                </div>

                <ul
                  className="flex flex-col overflow-hidden rounded-xl"
                  style={{ border: "1px solid #222222" }}
                >
                  {path!.highlights.map((highlight, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 px-4 py-3.5 text-sm leading-relaxed"
                      style={{
                        color: "#9CA3AF",
                        borderTop: i > 0 ? "1px solid #1E1E1E" : undefined,
                        background: "#181818"
                      }}
                    >
                      <span className="mt-0.5 flex-shrink-0 text-xs font-bold" style={{ color: "#2D6A4F" }}>
                        ✓
                      </span>
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={path!.ctaHref}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold transition-colors duration-150"
                  style={{ background: "#2D6A4F", color: "#F9FAFB" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#40916C";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#2D6A4F";
                  }}
                >
                  {path!.ctaLabel}
                  <ArrowRight size={15} />
                </Link>
                {path!.secondaryHref && path!.secondaryLabel ? (
                  <Link
                    href={path!.secondaryHref}
                    className="text-center text-xs font-medium underline-offset-2 transition-colors"
                    style={{ color: "#6B7280" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "#9CA3AF";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "#6B7280";
                    }}
                  >
                    {path!.secondaryLabel}
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
