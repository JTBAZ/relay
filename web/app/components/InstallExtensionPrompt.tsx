"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/app/lib/cn";
import {
  getExtensionStoreLinks,
  hasAnyExtensionStoreLink,
  type ExtensionStoreLinks
} from "@/lib/extension-store-urls";

export type InstallExtensionPromptProps = {
  className?: string;
  /** `cookie` matches `/patreon/cookie` emerald card; `relay` uses studio CSS variables. */
  variant?: "cookie" | "relay";
  /** Smaller padding for dense layouts (e.g. designer). */
  compact?: boolean;
  title?: string;
};

function StoreButton({
  href,
  label,
  variant
}: {
  href: string;
  label: string;
  variant: "cookie" | "relay";
}) {
  const base =
    variant === "cookie"
      ? "inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium transition-colors"
      : "inline-flex items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors";
  const cookieCls =
    "border-emerald-600/50 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-800/50";
  const relayCls =
    "border-[var(--relay-border)] bg-[var(--relay-surface-1)] text-[var(--relay-fg)] hover:border-[var(--relay-green-600)] hover:bg-[var(--relay-green-950)]";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, variant === "cookie" ? cookieCls : relayCls)}
    >
      {label}
    </a>
  );
}

function LinkRow({ links, variant }: { links: ExtensionStoreLinks; variant: "cookie" | "relay" }) {
  const items: { key: string; url: string | null; label: string }[] = [
    { key: "chrome", url: links.chrome, label: "Chrome Web Store" },
    { key: "edge", url: links.edge, label: "Edge Add-ons" },
    { key: "firefox", url: links.firefox, label: "Firefox (AMO)" }
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(({ key, url, label }) =>
        url ? <StoreButton key={key} href={url} label={label} variant={variant} /> : null
      )}
    </div>
  );
}

export function InstallExtensionPrompt({
  className,
  variant = "relay",
  compact = false,
  title
}: InstallExtensionPromptProps) {
  const links = useMemo(() => getExtensionStoreLinks(), []);
  const configured = hasAnyExtensionStoreLink(links);

  const shell =
    variant === "cookie"
      ? cn(
          "rounded border border-emerald-500/30 bg-emerald-950/25 text-sm text-stone-200",
          compact ? "p-3" : "p-4"
        )
      : cn(
          "rounded-xl border text-sm",
          compact ? "p-3" : "p-4",
          "border-[var(--relay-border)] bg-[var(--relay-surface-2)] text-[var(--relay-fg)]"
        );

  const hCls =
    variant === "cookie"
      ? "font-medium text-emerald-100"
      : "font-semibold text-[var(--relay-fg)]";

  const bodyCls = variant === "cookie" ? "mt-2 text-stone-300" : "mt-2 text-[var(--relay-fg-muted)]";

  const defaultTitle =
    variant === "cookie"
      ? "Recommended — install the Relay extension"
      : "Optional — Relay browser extension";

  return (
    <section
      className={cn(shell, className)}
      aria-label={title ?? defaultTitle}
    >
      <h2 className={cn("text-base", hCls)}>{title ?? defaultTitle}</h2>
      <p className={cn("leading-relaxed", bodyCls)}>
        Connect your Patreon <code className="rounded bg-black/25 px-1">session_id</code> without
        pasting cookie values. After installing, use{" "}
        <Link
          href="/extension/authorize"
          className={
            variant === "cookie"
              ? "font-medium text-emerald-200 underline underline-offset-2 hover:text-emerald-100"
              : "font-medium text-[var(--relay-green-400)] underline underline-offset-2 hover:text-[var(--relay-green-300)]"
          }
        >
          Connect extension
        </Link>{" "}
        from Relay (or open the extension popup).{" "}
        <Link
          href="/patreon/cookie"
          className={
            variant === "cookie"
              ? "text-amber-200/90 underline underline-offset-2 hover:text-amber-100"
              : "underline underline-offset-2 hover:text-[var(--relay-fg)]"
          }
        >
          Manual cookie paste
        </Link>{" "}
        stays available.
      </p>

      {configured ? (
        <>
          <div className={cn("mt-4", compact && "mt-3")}>
            <LinkRow links={links} variant={variant} />
          </div>
          <p className={cn("mt-3 text-xs", variant === "cookie" ? "text-stone-400" : "text-[var(--relay-fg-muted)]")}>
            Privacy:{" "}
            <Link
              href="/legal/extension-privacy"
              className="underline underline-offset-2"
            >
              Extension privacy notice
            </Link>
            .
          </p>
        </>
      ) : (
        <p
          className={cn(
            "mt-3 rounded border px-3 py-2 text-xs leading-relaxed",
            variant === "cookie"
              ? "border-stone-600 bg-stone-900/50 text-stone-400"
              : "border-[var(--relay-border)] bg-[var(--relay-surface-1)] text-[var(--relay-fg-muted)]"
          )}
        >
          Store install links are not set in this environment. Add{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_RELAY_EXTENSION_CHROME_URL</code>,{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_RELAY_EXTENSION_EDGE_URL</code>{" "}
          (optional), and{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_RELAY_EXTENSION_FIREFOX_URL</code>{" "}
          in <code className="rounded bg-black/30 px-1">web/.env.local</code> after listings are live
          (see <code className="rounded bg-black/30 px-1">web/.env.example</code>). For local dev, load
          an unpacked build per <code className="rounded bg-black/30 px-1">extension/README.md</code>.
        </p>
      )}
    </section>
  );
}
