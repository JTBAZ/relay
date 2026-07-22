"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { CrosspostChipRow } from "@/app/components/distribution/platform-presence-chips";
import { postCarouselMainVisual } from "@/app/components/PostAssetCarouselStrip";
import {
  Lab2DestBadge,
  Lab2StatusBar,
  Lab2StatusPill,
  lab2HueFromSeed
} from "@/app/components/studio-lab2/lab2-card-chrome";
import type { LinkedSetMemberCard } from "@/lib/active-post-linked-sets";
import {
  galleryPostLifecycleStatus,
  type PresentDestination
} from "@/lib/active-post-presence";

const MINT = "#9bf0c4";

type Props = {
  creativeWorkId: string;
  title: string;
  memberCount: number;
  members: LinkedSetMemberCard[];
  present: PresentDestination[];
  missing: string[];
  selected: boolean;
  /** CSS aspect-ratio. Lab uses square tiles; classic stays portrait. */
  aspectRatio?: string;
  /** lab2 renders v0 /4 GalleryCard chrome instead of mosaic. */
  presentation?: "default" | "lab2";
  onToggleSelect: () => void;
  onOpenSummary: () => void;
  onPresentClick: (destination: string, externalUrl: string) => void;
  onGhostClick: () => void;
};

function memberThumb(m: LinkedSetMemberCard): string | null {
  const item = m.group.items.find((it) => !it.shadow_cover) ?? m.group.items[0];
  if (!item) return null;
  const main = postCarouselMainVisual(item);
  return main.src && !main.isVideo ? main.src : main.src;
}

function coverItem(members: LinkedSetMemberCard[]) {
  return (
    members[0]?.group.items.find((it) => !it.shadow_cover) ??
    members[0]?.group.items[0] ??
    null
  );
}

export default function LinkedSetCard({
  creativeWorkId,
  title,
  memberCount,
  members,
  present,
  missing,
  selected,
  aspectRatio = "3 / 4",
  presentation = "default",
  onToggleSelect,
  onOpenSummary,
  onPresentClick,
  onGhostClick
}: Props) {
  const [hovered, setHovered] = useState(false);
  const mosaicMembers = members.slice(0, 6);
  const presentDests = present.map((p) => p.destination);
  const presentUrls = Object.fromEntries(present.map((p) => [p.destination, p.external_url]));
  const isLab2 = presentation === "lab2";
  const primaryDest = presentDests[0] ?? null;
  const cover = coverItem(members);
  const coverSrc = members[0] ? memberThumb(members[0]) : null;
  const lifecycle = galleryPostLifecycleStatus(cover);
  const cardHue = lab2HueFromSeed(creativeWorkId || title);

  const mosaicLayout =
    mosaicMembers.length <= 2
      ? "rows"
      : mosaicMembers.length === 3
        ? "featured"
        : mosaicMembers.length === 4
          ? "grid2x2"
          : "grid3x2";

  const thumb = (m: LinkedSetMemberCard) => memberThumb(m);

  const onKeyActivate = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onOpenSummary();
    } else if (e.key === " ") {
      e.preventDefault();
      onToggleSelect();
    }
  };

  const selectControl = (opts?: { hideUntilActive?: boolean; className?: string }) => (
    <label
      className={`z-20 flex cursor-pointer items-center justify-center ${opts?.className ?? ""}`}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: opts?.hideUntilActive ? 18 : 20,
        height: opts?.hideUntilActive ? 18 : 20,
        borderRadius: 9999,
        background: selected ? MINT : hovered ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)",
        border: selected ? "none" : `1px solid ${hovered ? "#555" : "#333"}`,
        opacity:
          opts?.hideUntilActive && !(selected || hovered)
            ? 0
            : selected || hovered
              ? 1
              : opts?.hideUntilActive
                ? 0
                : 0.5
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="peer sr-only"
        aria-label={`Select Linked Set ${title}`}
      />
      {selected ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
          <path
            d="M2 6l3 3 5-5"
            fill="none"
            stroke="#050706"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </label>
  );

  /* ── lab2: v0 /4 GalleryCard chrome (no empty mosaic) ── */
  if (isLab2) {
    return (
      <div
        data-gallery-tile
        data-lab2-card
        data-lab2-linked-set
        role="listitem"
        className="group relative flex w-full min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-[#141e16] p-2.5 text-left outline-none transition-all duration-150 hover:scale-[1.015] hover:border-[#2a3e2e] [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-[var(--lib-ring)]"
        style={{
          aspectRatio,
          backgroundColor: cardHue,
          boxShadow: selected ? "0 0 0 1px #9bf0c440, 0 0 16px #9bf0c415" : "none",
          zIndex: hovered ? 10 : 0
        }}
        tabIndex={0}
        onClick={onOpenSummary}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onKeyDown={onKeyActivate}
      >
        {/* Cover media as faint plane */}
        <div className="pointer-events-none absolute inset-0">
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverSrc}
              alt=""
              className="block h-full w-full object-cover object-center opacity-[0.28]"
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(5,7,6,0.55) 0%, transparent 55%)"
            }}
          />
        </div>

        <div className="relative z-10 flex items-start justify-between gap-1">
          <div className="flex items-center gap-1">
            {selectControl({ hideUntilActive: true })}
            <Lab2DestBadge dest={primaryDest} />
            <span className="flex items-center gap-0.5 rounded border border-[#1e2a22] px-1 py-0.5 text-[8px] font-medium tracking-wide text-[#4a5750]">
              <Link2 className="h-2 w-2" aria-hidden />
              {memberCount}
            </span>
          </div>
          <Lab2StatusPill status={lifecycle} />
        </div>

        <div className="relative z-10 flex flex-col gap-1">
          {hovered ? (
            <div
              className="mb-0.5"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <CrosspostChipRow
                present={presentDests}
                missing={missing}
                parentHovered={hovered}
                presentUrls={presentUrls}
                onPresentActivate={(destination, externalUrl) => {
                  onPresentClick(destination, externalUrl);
                }}
                onGhostActivate={() => onGhostClick()}
              />
            </div>
          ) : null}
          <p className="line-clamp-2 text-[10.5px] font-medium leading-tight text-[#8ea898]">
            {title || "Linked set"}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[8.5px] tabular-nums text-[#3a4a3e]">
              {memberCount} linked
            </span>
            <Lab2StatusBar status={lifecycle} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-gallery-tile
      role="listitem"
      className="group relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border text-left outline-none transition-all duration-200 [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-[var(--lib-ring)]"
      style={{
        aspectRatio,
        borderColor: selected ? MINT : hovered ? "#333" : "#1f1f1f",
        background: "#0a0a0a",
        transform: hovered ? "translateY(-2px) scale(1.01)" : "none",
        boxShadow: selected
          ? "0 0 0 1px #9bf0c440, 0 0 20px #9bf0c415"
          : hovered
            ? "0 4px 24px rgba(0,0,0,0.4)"
            : "none",
        zIndex: hovered ? 10 : 0
      }}
      tabIndex={0}
      onClick={onOpenSummary}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={onKeyActivate}
    >
      {/* Mosaic — ~72% height */}
      <div className="relative flex-shrink-0" style={{ height: "72%" }}>
        {mosaicLayout === "rows" ? (
          <div className="absolute inset-0 flex flex-col gap-px">
            {mosaicMembers.map((m) => {
              const src = thumb(m);
              return (
                <div key={m.post_id} className="relative flex-1 overflow-hidden">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-[#111]" />
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {mosaicLayout === "featured" ? (
          <div className="absolute inset-0 flex gap-px">
            <div className="relative flex-1 overflow-hidden">
              {thumb(mosaicMembers[0]!) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb(mosaicMembers[0]!)!}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[#111]" />
              )}
            </div>
            <div className="flex flex-col gap-px" style={{ width: "38%" }}>
              {mosaicMembers.slice(1).map((m) => {
                const src = thumb(m);
                return (
                  <div key={m.post_id} className="relative flex-1 overflow-hidden">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-[#111]" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {mosaicLayout === "grid2x2" ? (
          <div
            className="absolute inset-0 grid gap-px"
            style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}
          >
            {mosaicMembers.map((m) => {
              const src = thumb(m);
              return (
                <div key={m.post_id} className="relative overflow-hidden">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-[#111]" />
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {mosaicLayout === "grid3x2" ? (
          <div
            className="absolute inset-0 grid gap-px"
            style={{ gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr" }}
          >
            {mosaicMembers.map((m) => {
              const src = thumb(m);
              return (
                <div key={m.post_id} className="relative overflow-hidden">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-[#111]" />
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
          style={{ background: "linear-gradient(to top, #0a0a0a, transparent)" }}
        />
      </div>

      {/* Label area */}
      <div className="relative z-10 flex flex-1 flex-col justify-between px-2.5 pb-2.5 pt-1.5">
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <CrosspostChipRow
            present={presentDests}
            missing={missing}
            parentHovered={hovered}
            presentUrls={presentUrls}
            onPresentActivate={(destination, externalUrl) => {
              onPresentClick(destination, externalUrl);
            }}
            onGhostActivate={() => onGhostClick()}
          />
        </div>
        <div className="mt-1">
          <p className="truncate text-[11px] font-medium leading-snug text-white">{title}</p>
          <p className="text-[10px]" style={{ color: "#666" }}>
            {memberCount} linked
          </p>
        </div>
      </div>

      {/* Linked badge — top-left */}
      <div
        className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-full px-2 py-1"
        style={{
          background: "rgba(5,7,6,0.92)",
          border: `1px solid ${MINT}`,
          boxShadow: "0 0 0 1px #9bf0c433, 0 2px 8px rgba(0,0,0,0.5)"
        }}
      >
        <Link2 className="h-2.5 w-2.5" style={{ color: MINT }} aria-hidden />
        <span className="text-[10px] font-bold tabular-nums" style={{ color: MINT }}>
          Linked · {memberCount}
        </span>
      </div>

      {/* Checkbox — top-right */}
      {selectControl({ className: "absolute right-2 top-2" })}
    </div>
  );
}
