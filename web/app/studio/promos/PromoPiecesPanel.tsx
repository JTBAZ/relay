"use client";

import { useState } from "react";
import {
  patchCreatorPromoSlotTipEligible,
  putCreatorPromoSlots,
  type CreatorPromoSlotRow,
  type PutCreatorPromoSlotRow
} from "@/lib/relay-api";
import PromoPieceCard from "./PromoPieceCard";
import PromoPostPickerModal from "./PromoPostPickerModal";

/** Compact ranks to 1…N in display order for a full-set PUT. */
export function compactSlotsForPut(slots: CreatorPromoSlotRow[]): PutCreatorPromoSlotRow[] {
  return [...slots]
    .sort((a, b) => a.slot_rank - b.slot_rank)
    .map((s, idx) => {
      const row: PutCreatorPromoSlotRow = {
        slot_rank: (idx + 1) as 1 | 2 | 3 | 4 | 5,
        target_kind: s.target_kind,
        target_id: s.target_id
      };
      if (s.label != null) row.label = s.label;
      return row;
    });
}

export type PromoPiecesPanelProps = {
  creatorId: string;
  slots: CreatorPromoSlotRow[];
  busy?: boolean;
  /** Hero layout: larger pool grid as the page keystone. */
  hero?: boolean;
  onSlotsChange: (slots: CreatorPromoSlotRow[]) => void;
  onError: (message: string | null) => void;
  /** Open piece health / preview when a card image is clicked. */
  onInspectPiece?: (promoPieceId: string) => void;
};

export default function PromoPiecesPanel({
  creatorId,
  slots,
  busy: busyProp = false,
  hero = false,
  onSlotsChange,
  onError,
  onInspectPiece
}: PromoPiecesPanelProps) {
  const [localBusy, setLocalBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const busy = busyProp || localBusy;
  const sorted = [...slots].sort((a, b) => a.slot_rank - b.slot_rank);
  const emptySlots = Math.max(0, 5 - sorted.length);

  const persist = async (next: CreatorPromoSlotRow[]) => {
    setLocalBusy(true);
    onError(null);
    try {
      const saved = await putCreatorPromoSlots(compactSlotsForPut(next));
      onSlotsChange(saved.slots);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not update promo pieces.");
    } finally {
      setLocalBusy(false);
    }
  };

  const removeSlot = (rank: number) => {
    if (busy) return;
    const next = sorted.filter((s) => s.slot_rank !== rank);
    void persist(next);
  };

  const toggleTipEligible = async (promoPieceId: string, tipEligible: boolean) => {
    if (busy || !promoPieceId) return;
    setLocalBusy(true);
    onError(null);
    try {
      const { slot } = await patchCreatorPromoSlotTipEligible(promoPieceId, tipEligible);
      onSlotsChange(slots.map((s) => (s.promo_piece_id === promoPieceId ? slot : s)));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not update Tips eligibility.");
    } finally {
      setLocalBusy(false);
    }
  };

  const handleMakePromos = async (putRows: PutCreatorPromoSlotRow[]) => {
    setPickerSaving(true);
    setPickerError(null);
    onError(null);
    try {
      const saved = await putCreatorPromoSlots(putRows);
      onSlotsChange(saved.slots);
      setPickerOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save promo pieces.";
      setPickerError(message);
    } finally {
      setPickerSaving(false);
    }
  };

  const openPicker = () => {
    setPickerError(null);
    setPickerOpen(true);
  };

  return (
    <section className="space-y-4" data-promos-pieces data-promos-pool-hero={hero ? "1" : "0"}>
      {!hero ? (
        <p className="text-[12px] text-[var(--relay-fg-muted)]">
          Promo pool (max 5). Rank reflects presentation order in this hub.
        </p>
      ) : null}

      <div
        data-promo-pieces-window
        className={
          hero
            ? "rounded-2xl border border-[#1a2620] bg-[#070a09]/40 px-3 py-4 sm:px-4"
            : "rounded-xl border border-dashed border-[var(--relay-border)] px-3 py-3"
        }
      >
        {sorted.length === 0 && !hero ? (
          <p className="text-center text-sm text-[var(--relay-fg-muted)]">
            No promo pieces yet.
          </p>
        ) : (
          <div
            data-promo-pieces-grid
            className={
              hero
                ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                : "flex flex-wrap gap-2"
            }
          >
            {sorted.map((slot) => (
              <PromoPieceCard
                key={`${slot.target_kind}-${slot.target_id}-${slot.slot_rank}`}
                slot={slot}
                creatorId={creatorId}
                busy={busy}
                hero={hero}
                onRemove={() => removeSlot(slot.slot_rank)}
                onInspect={
                  onInspectPiece && slot.promo_piece_id
                    ? () => onInspectPiece(slot.promo_piece_id!)
                    : undefined
                }
                onTipEligibleChange={
                  slot.promo_piece_id
                    ? (next) => void toggleTipEligible(slot.promo_piece_id!, next)
                    : undefined
                }
              />
            ))}
            {hero
              ? Array.from({ length: emptySlots }).map((_, index) => (
                  <button
                    key={`empty-${index}`}
                    type="button"
                    data-promo-add-slot
                    disabled={busy || pickerSaving}
                    onClick={openPicker}
                    className="flex min-h-72 min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#24332c] bg-[#0e1411]/40 text-[#8a928e] outline-none transition-colors hover:border-[#00AA6F]/45 hover:bg-[#00AA6F]/[0.04] hover:text-[#e8eee9] focus-visible:ring-2 focus-visible:ring-[#00AA6F] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex size-11 items-center justify-center rounded-full border border-[#24332c] bg-[#0e1411] text-xl font-light text-[#9bf0c4]">
                      +
                    </span>
                    <span className="text-sm font-semibold">Add post</span>
                    <span className="text-xs">Promo slot {sorted.length + index + 1}</span>
                  </button>
                ))
              : null}
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          data-promo-add-post
          disabled={busy || pickerSaving || sorted.length >= 5}
          onClick={openPicker}
          className="rounded-full bg-[var(--relay-green-600)] px-5 py-2 text-[13px] font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add Post
        </button>
      </div>

      <PromoPostPickerModal
        open={pickerOpen}
        creatorId={creatorId}
        currentSlots={slots}
        saving={pickerSaving}
        saveError={pickerError}
        onClose={() => {
          if (pickerSaving) return;
          setPickerOpen(false);
          setPickerError(null);
        }}
        onMakePromos={(rows) => void handleMakePromos(rows)}
      />
    </section>
  );
}
