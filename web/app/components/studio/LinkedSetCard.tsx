"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { CrosspostChipRow } from "@/app/components/distribution/platform-presence-chips";
import { postCarouselMainVisual } from "@/app/components/PostAssetCarouselStrip";
import type { LinkedSetMemberCard } from "@/lib/active-post-linked-sets";
import type { PresentDestination } from "@/lib/active-post-presence";

const MINT = "#9bf0c4";

type Props = {
  creativeWorkId: string;
  title: string;
  memberCount: number;
  members: LinkedSetMemberCard[];
  present: PresentDestination[];
  missing: string[];
  selected: boolean;
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

export default function LinkedSetCard({
  title,
  memberCount,
  members,
  present,
  missing,
  selected,
  onToggleSelect,
  onOpenSummary,
  onPresentClick,
  onGhostClick
}: Props) {
  const [hovered, setHovered] = useState(false);
  const mosaicMembers = members.slice(0, 6);
  const presentDests = present.map((p) => p.destination);
  const presentUrls = Object.fromEntries(present.map((p) => [p.destination, p.external_url]));

  const mosaicLayout =
    mosaicMembers.length <= 2
      ? "rows"
      : mosaicMembers.length === 3
        ? "featured"
        : mosaicMembers.length === 4
          ? "grid2x2"
          : "grid3x2";

  const thumb = (m: LinkedSetMemberCard) => memberThumb(m);

  return (
    <div
      data-gallery-tile
      role="listitem"
      className="group relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border text-left outline-none transition-all duration-200 [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-[var(--lib-ring)]"
      style={{
        aspectRatio: "3 / 4",
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
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpenSummary();
        } else if (e.key === " ") {
          e.preventDefault();
          onToggleSelect();
        }
      }}
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
      <label
        className="absolute right-2 top-2 z-20 flex cursor-pointer items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 20,
          height: 20,
          borderRadius: 9999,
          background: selected ? MINT : hovered ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)",
          border: selected ? "none" : `1px solid ${hovered ? "#555" : "#333"}`,
          opacity: selected || hovered ? 1 : 0.5
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
    </div>
  );
}
