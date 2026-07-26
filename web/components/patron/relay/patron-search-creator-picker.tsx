"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Users, X } from "lucide-react";
import type { Creator } from "@/lib/relay-fixtures";

type PatronSearchCreatorPickerProps = {
  creators: Creator[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function PatronSearchCreatorPicker({
  creators,
  selectedIds,
  onChange,
}: PatronSearchCreatorPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sortedCreators = useMemo(
    () => [...creators].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [creators]
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCreators = useMemo(
    () => sortedCreators.filter((c) => selectedSet.has(c.id)),
    [sortedCreators, selectedSet]
  );

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggleCreator = (creatorId: string) => {
    if (selectedSet.has(creatorId)) {
      onChange(selectedIds.filter((id) => id !== creatorId));
      return;
    }
    onChange([...selectedIds, creatorId]);
  };

  const label =
    selectedIds.length === 0
      ? "All followed"
      : selectedIds.length === 1
        ? selectedCreators[0]?.displayName ?? "1 creator"
        : `${selectedIds.length} creators`;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={[
            "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            selectedIds.length > 0
              ? "border-[#2D6A4F]/60 bg-[#0D1F17] text-[#40916C]"
              : "border-[#2A2A2A] bg-[#111111] text-[#9CA3AF] hover:border-[#333333] hover:text-[#D1D5DB]",
          ].join(" ")}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Creators: ${label}`}
        >
          <Users size={12} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
          <ChevronDown size={12} className="shrink-0 opacity-70" aria-hidden="true" />
        </button>

        {selectedCreators.slice(0, 3).map((creator) => (
          <span
            key={creator.id}
            className="inline-flex max-w-[140px] items-center gap-1 rounded-full border border-[#2A2A2A] bg-[#161616] px-2 py-0.5 text-[10px] text-[#D1D5DB]"
          >
            <img
              src={creator.avatarUrl}
              alt=""
              className="h-4 w-4 shrink-0 rounded-full object-cover"
              width={16}
              height={16}
            />
            <span className="truncate">{creator.displayName}</span>
            <button
              type="button"
              onClick={() => toggleCreator(creator.id)}
              className="shrink-0 text-[#6B7280] hover:text-[#D1D5DB]"
              aria-label={`Remove ${creator.displayName}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {selectedIds.length > 3 ? (
          <span className="text-[10px] text-[#6B7280]">+{selectedIds.length - 3} more</span>
        ) : null}
      </div>

      {open ? (
        <div
          className="absolute left-0 right-0 z-20 mt-1 max-h-[240px] overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#111111] shadow-xl"
          role="listbox"
          aria-label="Select creators"
          aria-multiselectable="true"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#1E1E1E] px-2 py-1.5">
            <span className="text-[10px] uppercase tracking-widest text-[#4B5563]">
              Subscriptions
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange(sortedCreators.map((c) => c.id))}
                className="text-[10px] text-[#40916C] hover:text-[#52B788]"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] text-[#6B7280] hover:text-[#9CA3AF]"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-[190px] overflow-y-auto p-1">
            {sortedCreators.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-[#4B5563]">
                No followed creators yet.
              </p>
            ) : (
              sortedCreators.map((creator) => {
                const checked = selectedSet.has(creator.id);
                return (
                  <button
                    key={creator.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggleCreator(creator.id)}
                    className={[
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                      checked ? "bg-[#0D1F17]/80" : "hover:bg-[#1A1A1A]",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked
                          ? "border-[#2D6A4F] bg-[#2D6A4F] text-white"
                          : "border-[#333333] bg-transparent",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {checked ? <Check size={10} /> : null}
                    </span>
                    <img
                      src={creator.avatarUrl}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-[#2A2A2A]"
                      width={28}
                      height={28}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-[#E5E7EB]">
                        {creator.displayName}
                      </span>
                      <span className="block truncate text-[10px] text-[#6B7280]">
                        @{creator.handle}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
