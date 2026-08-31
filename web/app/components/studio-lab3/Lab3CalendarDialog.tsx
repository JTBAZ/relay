"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchScheduleRail } from "@/lib/schedule-rail-api";
import type { ScheduleEvent } from "@/lib/schedule-rail-data";
import { monthMatrix, shiftMonth } from "@/app/components/studio-lab2/Lab2ScheduleLens";
import { Lab3Overlay } from "./Lab3Overlay";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function utcMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function eventDay(at: string): number {
  return Number(at.slice(8, 10));
}

type Props = {
  open: boolean;
  initialMonth?: string;
  onClose: () => void;
  onInspectDay?: (events: ScheduleEvent[]) => void;
  restoreFocusRef?: { current: HTMLElement | null };
};

export function Lab3CalendarDialog({
  open,
  initialMonth,
  onClose,
  onInspectDay,
  restoreFocusRef
}: Props) {
  const [month, setMonth] = useState(initialMonth ?? utcMonthKey);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setMonth(initialMonth ?? utcMonthKey());
  }, [open, initialMonth]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const rail = await fetchScheduleRail({ month });
        if (cancelled) return;
        setEvents(rail.events ?? []);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, open]);

  const weeks = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return monthMatrix(y, m);
  }, [month]);

  const byDay = useMemo(() => {
    const map: Record<number, ScheduleEvent[]> = {};
    for (const ev of events) {
      const d = eventDay(ev.at);
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    }
    return map;
  }, [events]);

  return (
    <Lab3Overlay
      open={open}
      title="Calendar"
      onClose={onClose}
      variant="center"
      size="calendar"
      testId="calendar"
      restoreFocusRef={restoreFocusRef}
    >
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--lab3-text-muted,#6a736e)] hover:bg-[#ffffff08] hover:text-[var(--lab3-text,#d0ddd4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <p className="text-[13px] font-medium text-[var(--lab3-text,#d0ddd4)]">{monthLabel(month)}</p>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--lab3-text-muted,#6a736e)] hover:bg-[#ffffff08] hover:text-[var(--lab3-text,#d0ddd4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)]"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--lab3-text-dim,#545c58)]"
            >
              {d}
            </span>
          ))}
          {weeks.flat().map((day, idx) => {
            if (day == null) {
              return <span key={`empty-${idx}`} className="h-11" />;
            }
            const dayEvents = byDay[day] ?? [];
            const occupied = dayEvents.length > 0;
            return (
              <button
                key={day}
                type="button"
                disabled={!occupied}
                onClick={() => {
                  if (!occupied) return;
                  onInspectDay?.(dayEvents);
                  onClose();
                }}
                className={`relative flex h-11 items-center justify-center rounded-md text-[13px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)] ${
                  occupied
                    ? "text-[var(--lab3-text,#d0ddd4)] hover:bg-[#9bf0c414]"
                    : "text-[#3a4440]"
                }`}
              >
                {day}
                {occupied ? (
                  <span
                    className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-[var(--lab3-mint,#9bf0c4)]"
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        {error ? (
          <p className="mt-3 text-[11px] text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Lab3Overlay>
  );
}
