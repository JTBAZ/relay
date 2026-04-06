"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const steps = [
  {
    href: "/",
    title: "Dev Library",
    description: "Creator staging — collections, visibility, media. Same creator as below.",
  },
  {
    href: "/designer",
    title: "Dev Site Designer",
    description: "Compose hero, sections, and theme; saves to the layout API for this creator.",
  },
  {
    href: "/visitor",
    title: "Dev public profile",
    description: "Patron-facing gallery — curated layout + full library toggle, merged hero.",
  },
] as const;

export default function DevBenchClient() {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const creatorId =
    process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "creator_1";

  return (
    <div className="library-shell mx-auto max-w-2xl px-6 py-10 text-[var(--lib-fg)]">
      <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--lib-fg)]">
        Dev test bench
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--lib-fg-muted)]">
        Single end-to-end path: library → designer → public profile. All three use{" "}
        <code className="rounded bg-[var(--lib-muted)] px-1.5 py-0.5 text-xs text-[var(--lib-fg)]">
          NEXT_PUBLIC_RELAY_CREATOR_ID
        </code>{" "}
        (current: <strong>{creatorId}</strong>).
      </p>

      <ol className="mt-8 space-y-6">
        {steps.map((step, i) => (
          <li key={step.href} className="flex gap-4">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] text-xs font-semibold text-[var(--lib-fg-muted)]"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={step.href}
                className="font-medium text-[color-mix(in_srgb,var(--lib-selection)_75%,var(--lib-fg))] underline-offset-2 hover:underline"
              >
                {step.title}
              </Link>
              <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">{step.description}</p>
              {origin ? (
                <p className="mt-2 font-mono text-[11px] text-[var(--lib-fg-muted)]">
                  <a href={`${origin}${step.href}`} className="break-all hover:text-[var(--lib-fg)]">
                    {origin}
                    {step.href}
                  </a>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 text-xs text-[var(--lib-fg-muted)]">
        API base: <code className="text-[var(--lib-fg-muted)]">{process.env.NEXT_PUBLIC_RELAY_API_URL || "http://127.0.0.1:8787"}</code>
      </p>
    </div>
  );
}
