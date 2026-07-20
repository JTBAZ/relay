"use client";

import type {
  GoalCycleMediaState,
  GoalCyclePlan,
  GoalCyclePlanSlot
} from "@/lib/goal-cycle-types";
import {
  fromDatetimeLocalInputValue,
  syncSlotScheduledUtc,
  toDatetimeLocalInputValue
} from "@/lib/goal-cycle-schedule-local";

const MEDIA_LABEL: Record<GoalCycleMediaState, string> = {
  missing: "Media missing — attach later",
  partial: "Media partial",
  ready: "Media ready",
  not_required: "Media not required"
};

export type LogisticsStepProps = {
  plan: GoalCyclePlan;
  linkedDestinationIds: string[];
  disabled?: boolean;
  onSlotChange: (slotId: string, patch: Partial<GoalCyclePlanSlot>) => void;
  onLogisticsNotesChange: (notes: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

function formatLocalPreview(scheduledLocal: string): string {
  const input = toDatetimeLocalInputValue(scheduledLocal);
  if (!input) return scheduledLocal;
  const [datePart, timePart] = input.split("T");
  if (!datePart || !timePart) return scheduledLocal;
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  if (![y, mo, d, h, mi].every((n) => Number.isFinite(n))) return scheduledLocal;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ampm = h! >= 12 ? "PM" : "AM";
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${monthNames[mo! - 1] ?? "?"} ${d}, ${y}, ${h12}:${pad(mi!)} ${ampm}`;
}

export function LogisticsStep({
  plan,
  linkedDestinationIds,
  disabled = false,
  onSlotChange,
  onLogisticsNotesChange,
  onBack,
  onContinue
}: LogisticsStepProps) {
  const linked = new Set(linkedDestinationIds);
  const slots = plan.slots.slice(0, 8);
  const planTz = plan.logistics.time_zone || "UTC";

  return (
    <div className="goal-cycle-step" data-testid="goal-cycle-logistics-step">
      <header className="goal-cycle-step__header">
        <h2 className="goal-cycle-step__title">Logistics</h2>
        <p className="goal-cycle-step__lede">
          Confirm creator-local times and linked destinations only. Missing media is allowed.
        </p>
      </header>

      <p className="goal-cycle-help" data-testid="logistics-timezone">
        Plan time zone: {planTz}
      </p>

      <ul className="goal-cycle-slot-list" role="list">
        {slots.map((slot) => {
          const destinations = slot.destination_ids.filter((id) => linked.has(id));
          const blocked = slot.destination_ids.filter((id) => !linked.has(id));
          const slotTz = slot.time_zone || planTz;
          return (
            <li key={slot.id} className="goal-cycle-slot" data-testid={`logistics-slot-${slot.id}`}>
              <p className="goal-cycle-choice__label">{slot.title || slot.intent}</p>
              <label className="goal-cycle-field">
                <span className="goal-cycle-field__label">Scheduled (local)</span>
                <input
                  type="datetime-local"
                  className="goal-cycle-input"
                  value={toDatetimeLocalInputValue(slot.scheduled_local)}
                  disabled={disabled}
                  onChange={(e) => {
                    const scheduled_local = fromDatetimeLocalInputValue(e.target.value);
                    const synced = syncSlotScheduledUtc(
                      {
                        ...slot,
                        scheduled_local,
                        time_zone: slotTz
                      },
                      planTz
                    );
                    onSlotChange(slot.id, {
                      scheduled_local: synced.scheduled_local,
                      scheduled_utc: synced.scheduled_utc,
                      time_zone: synced.time_zone
                    });
                  }}
                  data-testid={`logistics-local-${slot.id}`}
                  aria-describedby={`tz-${slot.id}`}
                />
                <span id={`tz-${slot.id}`} className="goal-cycle-help">
                  {formatLocalPreview(slot.scheduled_local)} · {slotTz}
                </span>
              </label>

              <div className="goal-cycle-field">
                <span className="goal-cycle-field__label">Destinations</span>
                <div className="goal-cycle-dest-row">
                  {linkedDestinationIds.map((id) => {
                    const selected = destinations.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={disabled}
                        className={`goal-cycle-choice${selected ? " is-selected" : ""}`}
                        aria-pressed={selected}
                        data-testid={`logistics-dest-${slot.id}-${id}`}
                        onClick={() => {
                          const next = selected
                            ? destinations.filter((d) => d !== id)
                            : [...destinations, id];
                          onSlotChange(slot.id, { destination_ids: next });
                        }}
                      >
                        <span className="goal-cycle-choice__label">{id}</span>
                      </button>
                    );
                  })}
                </div>
                {blocked.length > 0 ? (
                  <p className="goal-cycle-help" data-testid={`logistics-unlinked-${slot.id}`}>
                    Unlinked (not tasks): {blocked.join(", ")}
                  </p>
                ) : null}
              </div>

              <p
                className="goal-cycle-help"
                data-testid={`logistics-media-${slot.id}`}
              >
                {MEDIA_LABEL[slot.media_state]}
              </p>
            </li>
          );
        })}
      </ul>

      <label className="goal-cycle-field">
        <span className="goal-cycle-field__label">Notes</span>
        <textarea
          className="goal-cycle-textarea"
          value={plan.logistics.notes ?? ""}
          disabled={disabled}
          rows={2}
          maxLength={400}
          onChange={(e) => onLogisticsNotesChange(e.target.value)}
          data-testid="logistics-notes"
        />
      </label>

      <div className="goal-cycle-step__actions">
        <button
          type="button"
          className="goal-cycle-btn goal-cycle-btn--ghost"
          disabled={disabled}
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          className="goal-cycle-btn goal-cycle-btn--primary"
          disabled={disabled}
          onClick={onContinue}
          data-testid="logistics-continue"
        >
          Review approval
        </button>
      </div>
    </div>
  );
}
