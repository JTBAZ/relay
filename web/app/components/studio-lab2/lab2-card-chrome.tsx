import type { GalleryPostLifecycle } from "@/lib/active-post-presence";

/** v0 /4 GalleryCard tint palette. */
export const LAB2_CARD_HUES = [
  "#0e1c14",
  "#141019",
  "#191410",
  "#0e1419",
  "#150e19",
] as const;

/** v0 action-color tokens used as the card foot bar. */
export const LAB2_STATUS_BAR: Record<GalleryPostLifecycle, string> = {
  live: "#9bf0c4",
  scheduled: "#7eb8e8",
  draft: "#4a5a52",
};

const DEST_LABEL: Record<string, string> = {
  x: "X",
  patreon: "Pat",
  deviantart: "DA",
  bluesky: "BS",
  facebook: "F",
  mastodon: "M",
  instagram: "IG",
  threads: "Th",
  tumblr: "Tu",
};

export function lab2HueFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return LAB2_CARD_HUES[h % LAB2_CARD_HUES.length]!;
}

export function lab2DestLabel(dest: string | null | undefined): string | null {
  if (!dest) return null;
  const key = dest.trim().toLowerCase();
  if (!key) return null;
  return DEST_LABEL[key] ?? key.slice(0, 3).toUpperCase();
}

export function Lab2DestBadge({ dest }: { dest: string | null | undefined }) {
  const label = lab2DestLabel(dest);
  if (!label) return null;
  return (
    <span className="rounded border border-[#1e2a22] px-1 py-0.5 text-[8px] font-medium tracking-wide text-[#4a5750]">
      {label}
    </span>
  );
}

export function Lab2StatusPill({ status }: { status: GalleryPostLifecycle }) {
  return (
    <span
      className={`rounded px-1 py-0.5 text-[8px] font-medium capitalize ${
        status === "live"
          ? "bg-[#9bf0c420] text-[#6aaa7a]"
          : status === "scheduled"
            ? "bg-[#7eb8e820] text-[#7eb8e8]"
            : "bg-[#ffffff10] text-[#4a5a52]"
      }`}
    >
      {status}
    </span>
  );
}

export function Lab2StatusBar({ status }: { status: GalleryPostLifecycle }) {
  return (
    <span
      className="h-1 w-8 rounded-full opacity-60"
      style={{ backgroundColor: LAB2_STATUS_BAR[status] }}
      aria-hidden
    />
  );
}
