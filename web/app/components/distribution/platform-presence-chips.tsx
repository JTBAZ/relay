"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";

/** Relay distribution destinations used by presence chips. */
export type PresenceDestination = "patreon" | "x" | "deviantart" | "bluesky";

export const PRESENCE_DESTINATIONS: readonly PresenceDestination[] = [
  "patreon",
  "x",
  "deviantart",
  "bluesky",
] as const;

/** Grid-chip brand palette (solid ring = present / planned; dashed = gap). */
export const CHIP_META: Record<PresenceDestination, { color: string; label: string }> = {
  patreon: { color: "#F1615A", label: "Patreon" },
  x: { color: "#3B82F6", label: "X" },
  deviantart: { color: "#4ADE80", label: "DeviantArt" },
  bluesky: { color: "#38BDF8", label: "Bluesky" },
};

export function isPresenceDestination(value: string): value is PresenceDestination {
  return (PRESENCE_DESTINATIONS as readonly string[]).includes(value);
}

export function PlatformIcon({
  destination,
  size = 14,
  color: colorOverride,
}: {
  destination: string;
  size?: number;
  color?: string;
}) {
  const color =
    colorOverride ??
    (isPresenceDestination(destination) ? CHIP_META[destination].color : "#888");

  if (destination === "patreon") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
        <circle cx="14.5" cy="9" r="6.5" />
        <rect x="2" y="2" width="4" height="20" rx="1" />
      </svg>
    );
  }
  if (destination === "x") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
      </svg>
    );
  }
  if (destination === "deviantart") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
        <path d="M19.207 4.794l.19-.33V1h-4.165l-.279.284-2.276 4.17-.523.284H4.629v6.232h4.346l.244.284-4.59 8.413V24h4.161l.28-.284 2.276-4.17.521-.284h7.523V13.03h-4.342l-.243-.284 4.602-7.952z" />
      </svg>
    );
  }
  if (destination === "bluesky") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
        <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 01-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
      </svg>
    );
  }
  if (destination === "relay") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.75" />
        <path
          d="M8 12.5h8M12 8v8"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="2.25" fill={color} />
      </svg>
    );
  }
  return (
    <span style={{ color, fontSize: Math.max(8, size - 2) }} aria-hidden>
      ●
    </span>
  );
}

function IconLightning({ size = 12, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" aria-hidden>
      <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
    </svg>
  );
}

export function PresentChip({
  dest,
  parentHovered = false,
  onActivate,
}: {
  dest: string;
  parentHovered?: boolean;
  /** Open live post URL — caller owns window.open / navigation. */
  onActivate?: (destination: string) => void;
}) {
  const meta = isPresenceDestination(dest)
    ? CHIP_META[dest]
    : { color: "#888", label: dest };
  const isOpaque = parentHovered;
  const interactive = typeof onActivate === "function";

  function activate(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    e.preventDefault();
    onActivate?.(dest);
  }

  return (
    <span
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={interactive ? `Open on ${meta.label}` : meta.label}
      onClick={interactive ? activate : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") activate(e);
            }
          : undefined
      }
      className={`flex items-center justify-center rounded-full transition-all duration-150 ${
        interactive ? "cursor-pointer" : ""
      }`}
      style={{
        width: 20,
        height: 20,
        background: "rgba(5,7,6,0.82)",
        border: `1px solid ${meta.color}`,
        boxShadow: `0 0 0 1px ${meta.color}22`,
        opacity: isOpaque ? 1 : 0.5,
      }}
    >
      <PlatformIcon destination={dest} size={10} color={meta.color} />
    </span>
  );
}

export function GhostChip({
  dest,
  parentHovered = false,
  onActivate,
}: {
  dest: string;
  parentHovered?: boolean;
  /** Caller owns Autopost / schedule navigation — no toast stubs in the kit. */
  onActivate?: (destination: string) => void;
}) {
  const meta = isPresenceDestination(dest)
    ? CHIP_META[dest]
    : { color: "#888", label: dest };
  const [hovered, setHovered] = useState(false);
  const interactive = typeof onActivate === "function";

  function activate(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    e.preventDefault();
    onActivate?.(dest);
  }

  return (
    <span
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={
        interactive
          ? `Missing on ${meta.label} — click to cross-post`
          : `Missing on ${meta.label}`
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={interactive ? activate : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") activate(e);
            }
          : undefined
      }
      className={`relative flex items-center justify-center rounded-full transition-all duration-150 ${
        interactive ? "cursor-pointer" : ""
      }`}
      style={{
        width: 20,
        height: 20,
        background: hovered ? "rgba(5,7,6,0.82)" : "transparent",
        border: `1px dashed ${hovered ? `${meta.color}cc` : "#555"}`,
        opacity: hovered || parentHovered ? 1 : 0.5,
      }}
    >
      <span style={{ opacity: hovered ? 0.15 : 0.4, transition: "opacity 150ms" }}>
        <PlatformIcon destination={dest} size={10} color={hovered ? meta.color : "#888"} />
      </span>
      {hovered && interactive ? (
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: meta.color }}>
          <IconLightning size={11} color="currentColor" />
        </span>
      ) : null}
    </span>
  );
}

export function CrosspostChipRow({
  present,
  missing,
  parentHovered = false,
  presentUrls,
  onPresentActivate,
  onGhostActivate,
  className = "",
}: {
  present: string[];
  missing: string[];
  parentHovered?: boolean;
  /** When set with `onPresentActivate`, solid rings with a URL become clickable. */
  presentUrls?: Record<string, string | null | undefined>;
  onPresentActivate?: (destination: string, externalUrl: string) => void;
  onGhostActivate?: (destination: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {present.map((dest) => {
        const url = presentUrls?.[dest]?.trim() || "";
        const canOpen = Boolean(url) && typeof onPresentActivate === "function";
        return (
          <PresentChip
            key={`p-${dest}`}
            dest={dest}
            parentHovered={parentHovered}
            onActivate={
              canOpen
                ? () => {
                    onPresentActivate!(dest, url);
                  }
                : undefined
            }
          />
        );
      })}
      {missing.map((dest) => (
        <GhostChip
          key={`m-${dest}`}
          dest={dest}
          parentHovered={parentHovered}
          onActivate={onGhostActivate}
        />
      ))}
    </div>
  );
}
