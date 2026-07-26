"use client";

import { useMemo, useState } from "react";
import type { CreateEventPayload } from "./AddEventPopover";
import type { CreateScheduleSeriesBody } from "@/lib/autopost-routines-api";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type RepeatPromptChoice = "once" | "weekly" | "monthly" | "custom";

export type RepeatEventSeed = {
  payload: CreateEventPayload;
  created: {
    id: string;
    post_id?: string | null;
    draft_id?: string | null;
    due_at?: string;
  };
  timeZone: string;
  autopostAllowed: boolean;
  upgradeHref?: string;
};

type RepeatEventPromptProps = {
  seed: RepeatEventSeed;
  busy?: boolean;
  error?: string | null;
  onOnce: () => void;
  onCreateSeries: (body: CreateScheduleSeriesBody) => void | Promise<void>;
};

function localParts(iso: string, timeZone: string) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const read = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")) % 24,
    minute: Number(read("minute")),
    weekday: weekdayMap[read("weekday")] ?? d.getUTCDay(),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function RepeatEventPrompt({
  seed,
  busy,
  error,
  onOnce,
  onCreateSeries,
}: RepeatEventPromptProps) {
  const [mode, setMode] = useState<"choose" | "custom">("choose");
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDay, setMonthDay] = useState(1);

  const dueAt = seed.created.due_at || seed.payload.due_at;
  const parts = useMemo(() => localParts(dueAt, seed.timeZone || "UTC"), [dueAt, seed.timeZone]);
  const localTime = `${pad(parts.hour)}:${pad(parts.minute)}`;

  const destinations =
    seed.payload.destinations?.length
      ? seed.payload.destinations
      : seed.payload.destination
        ? [seed.payload.destination]
        : ["patreon"];

  const buildBody = (c: "weekly" | "monthly", customWeekdays?: number[]): CreateScheduleSeriesBody => ({
    cadence: c,
    local_time: localTime,
    timezone: seed.timeZone || "UTC",
    weekdays: c === "weekly" ? (customWeekdays?.length ? customWeekdays : [parts.weekday]) : [],
    month_days: c === "monthly" ? [customWeekdays ? monthDay : parts.day] : [],
    planned_format: seed.payload.planned_format ?? "mixed",
    destinations,
    remind_me: seed.payload.remind_me,
    title_hint: seed.payload.title || null,
    starts_at: dueAt,
    seed: {
      due_at: dueAt,
      post_id: seed.created.post_id ?? null,
      draft_id: seed.created.draft_id ?? null,
      primary_task_id: seed.created.id,
    },
  });

  const gated = !seed.autopostAllowed;

  return (
    <div className="w-[280px] rounded-xl border border-[#2a2f2c] bg-[#0d100e] p-3 shadow-xl" data-testid="repeat-event-prompt">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f7773]">
        Scheduled
      </p>
      <p className="mt-2 text-[13px] font-medium text-[#edf2ef]">Make this part of your routine?</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#8b938e]">
        Autopost keeps the next slot ready as a draft. Future days stay lightweight on the calendar.
      </p>

      {mode === "choose" ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={onOnce}
            className="rounded-md border border-[#2a2f2c] px-3 py-2 text-left text-[12px] text-[#edf2ef] hover:border-[#3d4540]"
            data-testid="repeat-once"
          >
            Just this once
          </button>
          {(["weekly", "monthly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy || gated}
              onClick={() => void onCreateSeries(buildBody(c))}
              className="rounded-md border border-[#2a2f2c] px-3 py-2 text-left text-[12px] text-[#edf2ef] hover:border-[#3d4540] disabled:opacity-40"
              data-testid={`repeat-${c}`}
            >
              {c === "weekly" ? "Every week" : "Every month"}
              {gated ? " · Autopost" : ""}
            </button>
          ))}
          <button
            type="button"
            disabled={busy || gated}
            onClick={() => {
              setWeekdays([parts.weekday]);
              setMonthDay(parts.day);
              setMode("custom");
            }}
            className="rounded-md border border-[#2a2f2c] px-3 py-2 text-left text-[12px] text-[#edf2ef] hover:border-[#3d4540] disabled:opacity-40"
            data-testid="repeat-custom"
          >
            Custom rhythm{gated ? " · Autopost" : ""}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3" data-testid="repeat-custom-editor">
          <div className="flex gap-1">
            {(["weekly", "monthly"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCadence(c)}
                className={`rounded-md px-2 py-1 text-[11px] ${
                  cadence === c
                    ? "bg-[#1c211f] text-[#edf2ef]"
                    : "text-[#8b938e] hover:text-[#edf2ef]"
                }`}
              >
                {c === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          {cadence === "weekly" ? (
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_LABELS.map((label, i) => {
                const on = weekdays.includes(i);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setWeekdays((prev) =>
                        on ? prev.filter((d) => d !== i) : [...prev, i].sort((a, b) => a - b)
                      )
                    }
                    className={`rounded px-1.5 py-1 text-[10px] ${
                      on ? "bg-[#2a4a3a] text-[#c8f0d8]" : "bg-[#151917] text-[#8b938e]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <label className="block text-[11px] text-[#8b938e]">
              Day of month
              <input
                type="number"
                min={1}
                max={31}
                value={monthDay}
                onChange={(e) => setMonthDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                className="mt-1 w-full rounded border border-[#2a2f2c] bg-[#080a09] px-2 py-1.5 text-[12px] text-[#edf2ef]"
              />
            </label>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("choose")}
              className="flex-1 rounded-md border border-[#2a2f2c] py-1.5 text-[11px] text-[#8b938e]"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy || (cadence === "weekly" && weekdays.length === 0)}
              onClick={() =>
                void onCreateSeries({
                  ...buildBody(cadence, weekdays),
                  month_days: cadence === "monthly" ? [monthDay] : [],
                })
              }
              className="flex-1 rounded-md bg-[#c8f0d8] py-1.5 text-[11px] font-semibold text-[#0d100e] disabled:opacity-40"
            >
              Save routine
            </button>
          </div>
        </div>
      )}

      {gated ? (
        <p className="mt-2 text-[10px] text-[#8b938e]">
          Routines need Autopost.{" "}
          <a href={seed.upgradeHref || "/studio/autopost"} className="text-[#c8f0d8] underline">
            Upgrade
          </a>
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
