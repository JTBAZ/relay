"use client";

import { useEffect, useState } from "react";
import {
  railItemDestLabels,
  type ScheduleEvent
} from "@/lib/schedule-rail-data";
import { formatInstantInTimeZone } from "@/lib/goal-cycle-schedule-local";
import {
  LAB3_ART_DAY_PX,
  LAB3_COMPACT_DAY_PX,
  LAB3_TEXT_DAY_PX
} from "./lab3-constants";

type Props = {
  day: number;
  events: ScheduleEvent[];
  isToday: boolean;
  isPast: boolean;
  isPulsing: boolean;
  timeZone: string;
  artworkByPostId: Map<string, string | null>;
  highlightIds: Set<string>;
  popSliceId: string | null;
  onOpenEvent: (event: ScheduleEvent) => void;
  onOpenOverflow: (events: ScheduleEvent[]) => void;
  registerRow?: (el: HTMLDivElement | null) => void;
};

export function Lab3ScheduleDayRow({
  day,
  events,
  isToday,
  isPast,
  isPulsing,
  timeZone,
  artworkByPostId,
  highlightIds,
  popSliceId,
  onOpenEvent,
  onOpenOverflow,
  registerRow
}: Props) {
  const occupied = events.length > 0;
  const lead = events[0];
  const artSrc =
    lead?.post_id && artworkByPostId.has(lead.post_id)
      ? artworkByPostId.get(lead.post_id) ?? null
      : null;
  const [artFailed, setArtFailed] = useState(false);
  useEffect(() => {
    setArtFailed(false);
  }, [artSrc]);
  const density: "compact" | "art" | "text" = !occupied
    ? "compact"
    : artSrc
      ? "art"
      : "text";
  const height =
    density === "compact"
      ? LAB3_COMPACT_DAY_PX
      : density === "art"
        ? LAB3_ART_DAY_PX
        : LAB3_TEXT_DAY_PX;
  const overflow = Math.max(0, events.length - 1);
  const dest = lead ? railItemDestLabels(lead).join(", ") : "";
  const time = lead
    ? formatInstantInTimeZone(lead.at, timeZone, { hour: "numeric", minute: "2-digit" })
    : "";
  const highlighted =
    Boolean(lead) &&
    (lead!.id === popSliceId || [...highlightIds].some((id) => id === lead!.id));

  return (
    <div
      ref={registerRow}
      data-lab3-day-row
      data-lab3-day-density={density}
      data-lab3-day={day}
      className={`group relative mx-1 grid items-center gap-x-2 rounded-lg px-2 ${
        isPulsing ? "bg-[#9bf0c4]/14" : occupied ? "hover:bg-[#ffffff08]" : ""
      }`}
      style={{
        height,
        gridTemplateColumns: occupied
          ? density === "art"
            ? "1.5rem 4.5rem minmax(0,1fr) auto"
            : "1.5rem minmax(0,1fr) auto"
          : "1.5rem minmax(0,1fr)"
      }}
    >
      {occupied ? (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--lab3-mint,#9bf0c4)]"
          aria-hidden
        />
      ) : null}
      <span
        className={`w-6 shrink-0 text-right text-[11px] tabular-nums ${
          isToday
            ? "font-semibold text-[var(--lab3-mint,#9bf0c4)]"
            : isPast
              ? "text-[var(--lab3-text-dim,#545c58)]"
              : "text-[#8a938e]"
        }`}
      >
        {day}
      </span>
      {!occupied ? (
        <span className="h-px bg-[var(--lab3-hairline,#1c211f)]" aria-hidden />
      ) : (
        <>
          {density === "art" ? (
            artSrc && !artFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artSrc}
                alt=""
                className="h-[72px] w-[72px] shrink-0 justify-self-center rounded-md object-cover"
                onError={() => setArtFailed(true)}
              />
            ) : (
              <span className="h-[72px] w-[72px] justify-self-center rounded-md bg-[#122018]" aria-hidden />
            )
          ) : null}
          <button
            type="button"
            onClick={() => onOpenEvent(lead!)}
            className={`min-w-0 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)] ${
              highlighted ? "rounded-md ring-1 ring-[#9bf0c466]" : ""
            }`}
          >
            <span className="block truncate text-[12px] text-[var(--lab3-text,#d0ddd4)]">{lead!.title}</span>
            <span className="mt-0.5 block truncate text-[10px] text-[#8aa090]">
              {[dest, time].filter(Boolean).join(" · ")}
            </span>
          </button>
          {overflow > 0 ? (
            <button
              type="button"
              onClick={() => onOpenOverflow(events)}
              className="shrink-0 rounded-full border border-[var(--lab3-hairline-strong,#1e2a22)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--lab3-mint,#9bf0c4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)]"
            >
              +{overflow}
            </button>
          ) : (
            <span aria-hidden />
          )}
        </>
      )}
    </div>
  );
}
