"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Images,
  Layers3,
  MessageCircle,
  Sparkles,
  X,
} from "lucide-react";
import SnipIcon from "@/app/components/icons/SnipIcon";
import { RadialMenuMediaScrubBar } from "@/components/dev/hybrid-media-bar/RadialMenuMediaScrubBar";

type ConceptProps = {
  activeDot?: number;
  count?: number;
};

function MediaDots({
  count = 3,
  activeDot = 0,
  compact = false,
}: {
  count?: number;
  activeDot?: number;
  compact?: boolean;
}) {
  return (
    <span className="relative flex items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => (
        <span
          key={`dot-${idx}`}
          className="block rounded-full transition-all duration-300"
          style={{
            width: compact ? "0.26rem" : "0.3rem",
            height:
              idx === activeDot
                ? compact
                  ? "0.48rem"
                  : "0.55rem"
                : compact
                  ? "0.26rem"
                  : "0.3rem",
            backgroundColor:
              idx === activeDot
                ? "rgba(64,145,108,0.95)"
                : "rgba(255,255,255,0.55)",
            boxShadow:
              idx === activeDot ? "0 0 8px rgba(64,145,108,0.7)" : "none",
          }}
        />
      ))}
    </span>
  );
}

function ConceptShell({
  title,
  rationale,
  children,
  allowOverflow = false,
  spanFull = false,
}: {
  title: string;
  rationale: string;
  children: React.ReactNode;
  allowOverflow?: boolean;
  spanFull?: boolean;
}) {
  return (
    <article
      className={[
        "flex flex-col rounded-xl border border-[#242424] bg-[#131313]",
        allowOverflow ? "overflow-visible" : "overflow-hidden",
        spanFull ? "lg:col-span-3" : "",
      ].join(" ")}
    >
      <div
        className={[
          "relative border-b border-[#1C1C1C] bg-[#0E0E0E]",
          allowOverflow ? "h-48" : "h-28",
        ].join(" ")}
      >
        <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-[#666]">
          Media preview
        </div>
        <div className="absolute inset-x-0 bottom-0 border-t border-[#1A1A1A] bg-[#0B1013]/95 py-2">
          <div className="flex justify-center">{children}</div>
        </div>
      </div>
      <div className="space-y-1 px-4 py-3">
        <h3 className="text-sm font-semibold text-[#F0F0F0]">{title}</h3>
        <p className="text-xs leading-relaxed text-[#777]">{rationale}</p>
      </div>
    </article>
  );
}

function ConceptNavSubscript() {
  return (
    <ConceptShell
      title="1 · Nav icon + actions subscript"
      rationale="Lead with a recognizable gallery icon; keep “actions” as quiet supporting copy below."
    >
      <button
        type="button"
        className="flex min-w-[92px] flex-col items-center gap-0.5 rounded-full border border-[#1B9B6E]/35 bg-[#07100D]/85 px-4 py-2 text-[#A7F3D0] transition-colors hover:border-[#1B9B6E]/65 hover:bg-[#0A1510]"
        aria-label="Browse media actions"
      >
        <Images className="h-4 w-4 text-[#52d99c]" aria-hidden="true" />
        <MediaDots />
        <span className="text-[9px] font-medium lowercase tracking-wide text-[#6B7280]">
          actions
        </span>
      </button>
    </ConceptShell>
  );
}

function ConceptBrowseMedia() {
  return (
    <ConceptShell
      title="2 · Browse media"
      rationale="Sentence-case, social-friendly phrasing replaces the shouty ACTIONS label."
    >
      <button
        type="button"
        className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/55 px-3.5 py-2 text-[#D1D5DB] transition-colors hover:border-[#1B9B6E]/45 hover:text-[#E5FFF4]"
        aria-label="Browse media"
      >
        <MediaDots />
        <span className="text-[11px] font-medium">Browse media</span>
      </button>
    </ConceptShell>
  );
}

function ConceptFilmstripCount({ activeDot = 0, count = 3 }: ConceptProps) {
  return (
    <ConceptShell
      title="3 · Filmstrip + count"
      rationale="Position as navigation first — users instantly know there are multiple pieces."
    >
      <button
        type="button"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-2 transition-colors hover:border-[#1B9B6E]/45"
        aria-label={`View media ${activeDot + 1} of ${count}`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#2A2A2A] bg-[#101010]">
          <Layers3 className="h-3.5 w-3.5 text-[#40916C]" aria-hidden="true" />
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="text-[11px] font-semibold text-[#E5E7EB]">
            {activeDot + 1} of {count}
          </span>
          <span className="mt-0.5 text-[9px] text-[#6B7280]">tap to explore</span>
        </span>
      </button>
    </ConceptShell>
  );
}

function ConceptSwipeHint() {
  return (
    <ConceptShell
      title="4 · Swipe hint"
      rationale="Chevrons signal horizontal movement; copy stays conversational."
    >
      <button
        type="button"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-2.5 py-2 transition-colors hover:border-[#1B9B6E]/45"
        aria-label="Swipe through media and interact"
      >
        <ChevronLeft className="h-3.5 w-3.5 text-[#555]" aria-hidden="true" />
        <div className="flex flex-col items-center gap-0.5">
          <MediaDots compact />
          <span className="text-[9px] font-medium text-[#8B949E]">swipe & interact</span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-[#555]" aria-hidden="true" />
      </button>
    </ConceptShell>
  );
}

function ConceptSocialGhost() {
  return (
    <ConceptShell
      title="5 · Social ghost cluster"
      rationale="Faint reaction icons preview what opens on tap — feels like a social feed affordance."
    >
      <button
        type="button"
        className="relative flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3.5 py-2 transition-colors hover:border-[#1B9B6E]/45"
        aria-label="Explore and interact with media"
      >
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 opacity-20"
          aria-hidden="true"
        >
          <Heart className="h-3 w-3" />
          <SnipIcon className="h-3 w-3" />
          <MessageCircle className="h-3 w-3" />
        </span>
        <span className="relative z-[1] flex items-center gap-2">
          <MediaDots />
          <span className="text-[11px] font-medium text-[#D1D5DB]">Explore</span>
        </span>
      </button>
    </ConceptShell>
  );
}

function ConceptSparkMinimal() {
  return (
    <ConceptShell
      title="6 · Spark minimal"
      rationale="Ultra-light pill — dots do the talking; a tiny sparkle hints that more is hidden."
    >
      <button
        type="button"
        className="group flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-2 transition-all hover:border-[#1B9B6E]/40 hover:bg-black/60"
        aria-label="Open media controls"
      >
        <MediaDots />
        <Sparkles className="h-3 w-3 text-[#40916C] opacity-70 transition-opacity group-hover:opacity-100" aria-hidden="true" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-[10px] text-[#8B949E] opacity-0 transition-all duration-200 group-hover:max-w-[72px] group-hover:opacity-100">
          interact
        </span>
      </button>
    </ConceptShell>
  );
}

function ConceptSparkUnfurlHybrid() {
  return (
    <ConceptShell
      title="7 · Spark unfurl hybrid (1 + 6)"
      rationale="Minimal collapsed pill unfurls on hover — sparkle leads, three-node rail sits beneath."
    >
      <button
        type="button"
        className="group relative flex h-9 min-w-[44px] items-center justify-center"
        aria-label="Open media controls"
      >
        <span
          className={[
            "absolute flex items-center justify-center rounded-full border border-white/10 bg-black/45 px-2.5 py-1.5 transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
            "group-hover:pointer-events-none group-hover:translate-y-0.5 group-hover:scale-90 group-hover:opacity-0",
          ].join(" ")}
          aria-hidden="true"
        >
          <Sparkles className="h-3 w-3 text-[#40916C] opacity-80" />
        </span>

        <span
          className={[
            "flex flex-col items-center gap-1 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
            "pointer-events-none translate-y-1 scale-95 opacity-0",
            "group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:border-[#1B9B6E]/40",
          ].join(" ")}
        >
          <Sparkles
            className="h-3.5 w-3.5 text-[#52d99c] transition-transform duration-300 group-hover:scale-110"
            aria-hidden="true"
          />
          <MediaDots />
        </span>
      </button>
    </ConceptShell>
  );
}

function ConceptActionsSubscriptOnly() {
  return (
    <ConceptShell
      title="8 · Actions + node bar"
      rationale="Stripped-down take on concept 1 — no gallery icon, just the node rail with quiet “actions” beneath."
    >
      <button
        type="button"
        className="flex min-w-[72px] flex-col items-center gap-1 rounded-full border border-[#1B9B6E]/30 bg-[#07100D]/80 px-4 py-2 transition-colors hover:border-[#1B9B6E]/55 hover:bg-[#0A1510]"
        aria-label="Media actions"
      >
        <MediaDots />
        <span className="text-[9px] font-medium lowercase tracking-wide text-[#6B7280]">
          actions
        </span>
      </button>
    </ConceptShell>
  );
}

function ConceptSparkInstructionMorph() {
  return (
    <ConceptShell
      title="9 · Spark-to-instruction morph"
      rationale="Default reads like concept 7's activated state; hover widens into the live clickable rail while the cue copy replaces the icon."
    >
      <button
        type="button"
        className={[
          "group flex h-[58px] w-[82px] flex-col items-center justify-center overflow-hidden rounded-full border border-[#1B9B6E]/30 bg-[#07100D]/80 px-4 py-2 transition-all duration-300",
          "[transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:w-[244px] hover:border-[#1B9B6E]/55 hover:bg-[#0A1510]",
        ].join(" ")}
        aria-label="Click a dot for actions"
      >
        <span className="relative flex h-4 w-full items-center justify-center">
          <Sparkles
            className="absolute h-3.5 w-3.5 text-[#52d99c] opacity-100 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:scale-90 group-hover:opacity-0"
            aria-hidden="true"
          />
          <span className="absolute translate-y-0.5 whitespace-nowrap text-[10px] font-medium tracking-wide text-[#A7F3D0] opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            Click a dot for actions
          </span>
        </span>

        <span className="relative flex h-6 w-full items-center justify-center">
          <span className="absolute left-4 right-4 top-1/2 h-px -translate-y-1/2 bg-white/0 transition-colors duration-300 group-hover:bg-white/15" />
          <span className="relative z-[1] flex w-[42px] items-center justify-between transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:w-[190px]">
            {[0, 1, 2].map((idx) => {
              const active = idx === 0;
              return (
                <span
                  key={`concept-nine-dot-${idx}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-200 group-hover:hover:scale-105"
                  aria-hidden="true"
                >
                  <span
                    className="block rounded-full transition-all duration-300"
                    style={{
                      width: active ? "0.34rem" : "0.3rem",
                      height: active ? "0.86rem" : "0.3rem",
                      backgroundColor: active
                        ? "rgba(64,145,108,0.98)"
                        : "rgba(255,255,255,0.55)",
                      boxShadow: active ? "0 0 9px rgba(64,145,108,0.72)" : "none",
                    }}
                  />
                </span>
              );
            })}
          </span>
        </span>
      </button>
    </ConceptShell>
  );
}

function ConceptCircleSparkInstructionMorph() {
  return (
    <ConceptShell
      title="10 · Circle spark morph"
      rationale="Same interaction as 9, but the resting state is a compact circular CTA before widening into the rail."
    >
      <button
        type="button"
        className={[
          "group flex h-[70px] w-[70px] flex-col items-center justify-center overflow-hidden rounded-full border border-[#1B9B6E]/45 bg-[#07100D]/80 px-2 py-2 transition-all duration-300",
          "[transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:w-[244px] hover:border-[#1B9B6E]/70 hover:bg-[#0A1510]",
        ].join(" ")}
        aria-label="Click a dot for actions"
      >
        <span className="relative flex h-5 w-full items-center justify-center">
          <Sparkles
            className="absolute h-[18px] w-[18px] text-[#52d99c] opacity-100 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:scale-90 group-hover:opacity-0"
            aria-hidden="true"
          />
          <span className="absolute translate-y-0.5 whitespace-nowrap text-[10px] font-medium tracking-wide text-[#A7F3D0] opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            Click a dot for actions
          </span>
        </span>

        <span className="relative flex h-6 w-full items-center justify-center">
          <span className="absolute left-4 right-4 top-1/2 h-px -translate-y-1/2 bg-[#1B9B6E]/0 transition-colors duration-300 group-hover:bg-[#1B9B6E]/22" />
          <span className="relative z-[1] flex w-8 items-center justify-between transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:w-[190px]">
            {[0, 1, 2].map((idx) => {
              const active = idx === 0;
              return (
                <span
                  key={`concept-ten-dot-${idx}`}
                  className="flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-200 group-hover:hover:scale-105"
                  aria-hidden="true"
                >
                  <span
                    className="block rounded-full transition-all duration-300"
                    style={{
                      width: active ? "0.28rem" : "0.24rem",
                      height: active ? "0.68rem" : "0.24rem",
                      backgroundColor: active
                        ? "rgba(64,145,108,0.98)"
                        : "rgba(255,255,255,0.55)",
                      boxShadow: active ? "0 0 9px rgba(64,145,108,0.72)" : "none",
                    }}
                  />
                </span>
              );
            })}
          </span>
        </span>
      </button>
    </ConceptShell>
  );
}

function ConceptCircleSparkOnly() {
  return (
    <ConceptShell
      title="12 · Spark-only circle"
      rationale="A stripped-down take on 10 — the resting state is just the sparkle in a circle; dots and copy appear only on hover."
    >
      <button
        type="button"
        className={[
          "group relative flex h-[70px] w-[70px] items-center justify-center overflow-hidden rounded-full border border-[#1B9B6E]/45 bg-[#07100D]/80 transition-all duration-300",
          "[transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:w-[244px] hover:border-[#1B9B6E]/70 hover:bg-[#0A1510]",
        ].join(" ")}
        aria-label="Click a dot for actions"
      >
        <Sparkles
          className="h-[18px] w-[18px] text-[#52d99c] transition-all duration-200 group-hover:scale-90 group-hover:opacity-0"
          aria-hidden="true"
        />

        <span
          className={[
            "pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 opacity-0 transition-all duration-300",
            "group-hover:opacity-100",
          ].join(" ")}
          aria-hidden="true"
        >
          <span className="mb-1 whitespace-nowrap text-[10px] font-medium tracking-wide text-[#A7F3D0]">
            Click a dot for actions
          </span>

          <span className="relative flex h-6 w-full items-center justify-center">
            <span className="absolute left-4 right-4 top-1/2 h-px -translate-y-1/2 bg-[#1B9B6E]/22" />
            <span className="relative z-[1] flex w-[190px] items-center justify-between">
              {[0, 1, 2].map((idx) => {
                const active = idx === 0;
                return (
                  <span
                    key={`concept-twelve-dot-${idx}`}
                    className="flex h-5 w-5 scale-75 items-center justify-center rounded-full opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
                    style={{ transitionDelay: `${80 + idx * 55}ms` }}
                  >
                    <span
                      className="block rounded-full transition-all duration-300"
                      style={{
                        width: active ? "0.28rem" : "0.24rem",
                        height: active ? "0.68rem" : "0.24rem",
                        backgroundColor: active
                          ? "rgba(64,145,108,0.98)"
                          : "rgba(255,255,255,0.55)",
                        boxShadow: active ? "0 0 9px rgba(64,145,108,0.72)" : "none",
                      }}
                    />
                  </span>
                );
              })}
            </span>
          </span>
        </span>
      </button>
    </ConceptShell>
  );
}

function RelayNetworkRingMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="52 18 96 124"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        cx="100"
        cy="96"
        r="74"
        stroke="#52d99c"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="415.88 49.08"
        strokeDashoffset="-24.54"
        transform="rotate(90 100 96)"
      />
      <line x1="100" y1="94" x2="66" y2="68" stroke="#52d99c" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="100" y1="94" x2="134" y2="68" stroke="#52d99c" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="100" y1="94" x2="100" y2="136" stroke="#52d99c" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="100" cy="94" r="10" fill="#52d99c" />
    </svg>
  );
}

const UNFURL_NODES = [
  { key: "left", restX: -10, restY: -8, railX: -95, railY: 5, active: true, delay: "0ms" },
  { key: "center", restX: 0, restY: 10, railX: 0, railY: 5, active: false, delay: "60ms" },
  { key: "right", restX: 10, restY: -8, railX: 95, railY: 5, active: false, delay: "120ms" },
] as const;

const RADIAL_PREVIEW = [
  {
    key: "favorite",
    Icon: Heart,
    x: -34,
    y: -46,
    delay: "200ms",
    hoverTransform: "group-hover:[transform:translate(-34px,-46px)_scale(1)]",
  },
  {
    key: "snip",
    Icon: SnipIcon,
    x: 0,
    y: -56,
    delay: "245ms",
    hoverTransform: "group-hover:[transform:translate(0px,-56px)_scale(1)]",
  },
  {
    key: "comment",
    Icon: MessageCircle,
    x: 34,
    y: -46,
    delay: "290ms",
    hoverTransform: "group-hover:[transform:translate(34px,-46px)_scale(1)]",
  },
] as const;

function ConceptRelayLogoUnfold() {
  return (
    <ConceptShell
      title="11 · Relay logo unfold"
      rationale="Resting state is the Relay node mark; hover unfurls logo nodes into the media rail with a radial action preview on the active dot."
      allowOverflow
    >
      <button
        type="button"
        className={[
          "group relative flex h-[70px] w-[70px] flex-col items-center justify-center overflow-visible rounded-full border border-[#1B9B6E]/45 bg-[#07100D]/80 shadow-[0_0_18px_rgba(27,155,110,0.22)] transition-all duration-300",
          "[transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:h-[88px] hover:w-[244px] hover:rounded-[28px] hover:border-[#1B9B6E]/70 hover:bg-[#0A1510] hover:shadow-[0_0_24px_rgba(27,155,110,0.28)]",
        ].join(" ")}
        aria-label="Open media controls"
      >
        <span
          className={[
            "pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
            "group-hover:scale-[1.08] group-hover:opacity-0",
          ].join(" ")}
          aria-hidden="true"
        >
          <RelayNetworkRingMark className="h-10 w-10" />
        </span>

        {UNFURL_NODES.map(({ key, restX, restY, railX, railY, active, delay }) => (
          <span
            key={key}
            className={[
              "pointer-events-none absolute left-1/2 top-1/2 z-[2] flex items-center justify-center transition-all duration-400 [transition-timing-function:cubic-bezier(0.34,1.2,0.64,1)]",
              "[transform:translate(calc(-50%+var(--rest-x)),calc(-50%+var(--rest-y)))]",
              "group-hover:[transform:translate(calc(-50%+var(--rail-x)),calc(-50%+var(--rail-y)))]",
            ].join(" ")}
            style={
              {
                transitionDelay: delay,
                "--rest-x": `${restX}px`,
                "--rest-y": `${restY}px`,
                "--rail-x": `${railX}px`,
                "--rail-y": `${railY}px`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            <span
              className={[
                "block rounded-full transition-all duration-400 [transition-timing-function:cubic-bezier(0.34,1.2,0.64,1)]",
                active
                  ? "h-3.5 w-3.5 bg-[#52d99c] group-hover:h-[0.68rem] group-hover:w-[0.28rem] group-hover:bg-[rgba(64,145,108,0.98)] group-hover:shadow-[0_0_9px_rgba(64,145,108,0.72)]"
                  : "h-3.5 w-3.5 bg-[#52d99c] group-hover:h-[0.24rem] group-hover:w-[0.24rem] group-hover:bg-[rgba(255,255,255,0.55)] group-hover:shadow-none",
              ].join(" ")}
              style={{ transitionDelay: delay }}
            />
          </span>
        ))}

        <span
          className={[
            "pointer-events-none absolute inset-x-0 top-[18px] whitespace-nowrap text-center text-[10px] font-medium tracking-wide text-[#A7F3D0] opacity-0 transition-all duration-250",
            "group-hover:opacity-100",
          ].join(" ")}
          aria-hidden="true"
        >
          Click a dot for actions
        </span>

        <span
          className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-px w-0 bg-[#1B9B6E]/22 opacity-0 transition-all duration-300 group-hover:w-[190px] group-hover:opacity-100"
          style={{ transform: "translate(-50%, 5px)" }}
          aria-hidden="true"
        />

        <span
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-0 w-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ transform: "translate(calc(-50% - 95px), calc(-50% + 5px))" }}
          aria-hidden="true"
        >
          {RADIAL_PREVIEW.map(({ key, Icon, delay, hoverTransform }) => (
            <span
              key={key}
              className={[
                "absolute left-0 top-0 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#1B9B6E]/55 bg-[#101010] text-[#52d99c] opacity-0 transition-all duration-300 [transform:translate(0px,8px)_scale(0.35)] [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] group-hover:opacity-100",
                hoverTransform,
              ].join(" ")}
              style={{ transitionDelay: delay }}
            >
              <Icon className="h-3 w-3" />
            </span>
          ))}
          <span
            className="absolute left-0 top-0 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#1B9B6E] bg-[#101010] text-[#52d99c] opacity-0 transition-all duration-250 [transform:translate(0px,8px)_scale(0.6)] group-hover:opacity-100 group-hover:[transform:translate(0px,-2px)_scale(1)]"
            aria-hidden="true"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </span>
        </span>
      </button>
    </ConceptShell>
  );
}

function ConceptRadialMenuDesign() {
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <ConceptShell
      title="13 · Relay logo radial menu (design spec)"
      rationale="Ported from radial-menu-design — collapsed Relay node mark expands into a five-dot scrub bar on hover; click a dot to open the radial Favorite / Snip / Comment menu."
      allowOverflow
      spanFull
    >
      <RadialMenuMediaScrubBar
        mediaCount={5}
        currentIndex={currentIndex}
        onHoverIndex={() => {}}
        onSelectIndex={setCurrentIndex}
      />
    </ConceptShell>
  );
}

function ConceptRingBadgeRadialMenu() {
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <ConceptShell
      title="14 · Compact ring-badge radial menu"
      rationale="Same mechanics as 13, but the resting control is a smaller three-ring badge that stays tool-like and unobtrusive until needed."
      allowOverflow
      spanFull
    >
      <RadialMenuMediaScrubBar
        mediaCount={5}
        currentIndex={currentIndex}
        onHoverIndex={() => {}}
        onSelectIndex={setCurrentIndex}
        variant="ringBadge"
        compact
      />
    </ConceptShell>
  );
}

function CurrentReference() {
  return (
    <ConceptShell
      title="Current · ACTIONS pill"
      rationale="Functional baseline — technical uppercase label and divider feel dashboard-like."
    >
      <button
        type="button"
        className="flex items-center gap-2 rounded-full border border-[#1B9B6E]/45 bg-[#07100D]/85 px-3.5 py-2 text-[#A7F3D0]"
        aria-label="Open media actions"
      >
        <MediaDots />
        <span className="h-4 w-px bg-white/15" aria-hidden="true" />
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
          Actions
          <span
            className="mt-0.5 h-1.5 w-1.5 -rotate-45 border-r border-t border-current opacity-80"
            aria-hidden="true"
          />
        </span>
      </button>
    </ConceptShell>
  );
}

export function HybridMediaBarConceptGrid() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#40916C]">
          Hybrid media bar · CTA concepts
        </p>
        <h1 className="text-2xl font-semibold text-[#F5F5F5]">
          Collapsed call-to-action explorations
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[#888]">
          Fourteen social-friendly alternatives to the current ACTIONS pill. Each mock sits in the
          same footer slot beneath media so you can compare invite vs. utility at a glance.
        </p>
      </header>

      <div className="mb-6">
        <CurrentReference />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ConceptNavSubscript />
        <ConceptBrowseMedia />
        <ConceptFilmstripCount />
        <ConceptSwipeHint />
        <ConceptSocialGhost />
        <ConceptSparkMinimal />
        <ConceptSparkUnfurlHybrid />
        <ConceptActionsSubscriptOnly />
        <ConceptSparkInstructionMorph />
        <ConceptCircleSparkInstructionMorph />
        <ConceptCircleSparkOnly />
        <ConceptRelayLogoUnfold />
        <ConceptRadialMenuDesign />
        <ConceptRingBadgeRadialMenu />
      </div>
    </div>
  );
}
