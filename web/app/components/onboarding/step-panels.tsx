"use client";

import { useState } from "react";
import {
  Sparkles,
  Zap,
  Youtube,
  Twitter,
  Instagram,
  Music2
} from "lucide-react";
import { cn } from "@/app/lib/cn";

export function StepWelcome() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--relay-green-800)] bg-[var(--relay-green-950)]">
        <Sparkles className="h-7 w-7 text-[var(--relay-green-400)]" strokeWidth={1.5} />
      </div>
      <div className="max-w-sm space-y-2">
        <h2 className="text-balance text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Welcome to Relay
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Your all-in-one platform for building lasting connections with your audience.
          We&apos;ll have you set up in about two minutes.
        </p>
      </div>
      <ul className="w-full max-w-xs space-y-3 text-left">
        {["Unified patron management", "Real-time earnings insights", "Direct messaging & drops"].map(
          (item) => (
            <li key={item} className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--relay-green-400)]" />
              <span className="text-sm text-[var(--relay-fg-muted)]">{item}</span>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

export function StepProfile() {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [category, setCategory] = useState("");

  const categories = ["Music", "Art & Design", "Writing", "Podcasting", "Video", "Gaming"];

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Set up your profile
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          This is how patrons will discover and identify you on Relay.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name or alias"
            className="w-full rounded-md border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-2.5 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] transition-colors focus:border-[var(--relay-green-600)] focus:outline-none focus:ring-1 focus:ring-[var(--relay-green-600)]/30"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
            Handle
          </label>
          <div className="flex items-center gap-0 overflow-hidden rounded-md border border-[var(--relay-border)] bg-[var(--relay-surface-1)] transition-colors focus-within:border-[var(--relay-green-600)] focus-within:ring-1 focus-within:ring-[var(--relay-green-600)]/30">
            <span className="select-none border-r border-[var(--relay-border)] bg-[var(--relay-bg)] px-3 py-2.5 text-sm text-[var(--relay-fg-muted)]">
              relay.so/
            </span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="yourhandle"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
            Creator Category
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
                  category === cat
                    ? "border-[var(--relay-green-600)] bg-[var(--relay-green-800)] text-[var(--relay-fg)]"
                    : "border-[var(--relay-border)] bg-[var(--relay-surface-1)] text-[var(--relay-fg-muted)] hover:border-[var(--relay-green-600)]/50 hover:text-[var(--relay-fg)]"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StepConnect() {
  const [connected, setConnected] = useState<string[]>([]);

  const platforms = [
    { id: "youtube", label: "YouTube", icon: Youtube, hint: "Import subscriber count" },
    { id: "twitter", label: "X / Twitter", icon: Twitter, hint: "Sync your audience" },
    { id: "instagram", label: "Instagram", icon: Instagram, hint: "Pull follower data" },
    { id: "tiktok", label: "TikTok", icon: Music2, hint: "Connect your reach" }
  ];

  const toggle = (id: string) =>
    setConnected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Connect your platforms
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Linking platforms lets Relay surface your audience data in one place. All optional.
        </p>
      </div>

      <div className="space-y-2">
        {platforms.map(({ id, label, icon: Icon, hint }) => {
          const isConnected = connected.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={cn(
                "flex w-full items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition-all duration-150",
                isConnected
                  ? "border-[var(--relay-green-800)] bg-[var(--relay-green-950)]"
                  : "border-[var(--relay-border)] bg-[var(--relay-surface-1)] hover:border-[var(--relay-border)]"
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
                  isConnected ? "bg-[var(--relay-green-800)]" : "bg-[var(--relay-surface-2)]"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isConnected ? "text-[var(--relay-green-400)]" : "text-[var(--relay-fg-muted)]"
                  )}
                  strokeWidth={1.5}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isConnected ? "text-[var(--relay-fg)]" : "text-[var(--relay-fg-muted)]"
                  )}
                >
                  {label}
                </p>
                <p className="mt-0.5 text-xs text-[var(--relay-fg-muted)]">{hint}</p>
              </div>
              <div
                className={cn(
                  "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  isConnected
                    ? "border-[var(--relay-green-600)] bg-[var(--relay-green-600)]"
                    : "border-[var(--relay-border)]"
                )}
              >
                {isConnected && (
                  <svg className="h-2.5 w-2.5" viewBox="0 0 10 8" fill="none" aria-hidden>
                    <path
                      d="M1 4l3 3 5-6"
                      stroke="#F9FAFB"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[var(--relay-fg-muted)]">
        You can connect more platforms at any time from your settings.
      </p>
    </div>
  );
}

export function StepGoLive() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--relay-green-800)] bg-[var(--relay-green-950)]">
        <Zap className="h-7 w-7 text-[var(--relay-green-400)]" strokeWidth={1.5} />
        <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-[var(--relay-green-400)]" />
      </div>
      <div className="max-w-sm space-y-2">
        <h2 className="text-balance text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          You&apos;re all set
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Your Relay creator profile is ready. Head to your dashboard to publish your first drop or customize
          your patron tiers.
        </p>
      </div>

      <div className="w-full max-w-xs space-y-2 text-left">
        {[
          { label: "Profile created", done: true },
          { label: "Platforms connected", done: true },
          { label: "First drop waiting", done: false }
        ].map(({ label, done }) => (
          <div key={label} className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full",
                done ? "bg-[var(--relay-green-600)]" : "border border-[var(--relay-border)] bg-[var(--relay-surface-2)]"
              )}
            >
              {done && (
                <svg className="h-2.5 w-2.5" viewBox="0 0 10 8" fill="none" aria-hidden>
                  <path
                    d="M1 4l3 3 5-6"
                    stroke="#F9FAFB"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <span className={cn("text-sm", done ? "text-[var(--relay-fg)]" : "text-[var(--relay-fg-muted)]")}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
