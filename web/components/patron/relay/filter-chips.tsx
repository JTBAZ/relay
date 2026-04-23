"use client";

export type FeedFilter =
  | "all"
  | "following"
  | "free"
  | "photos"
  | "audio"
  | "writing";

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "following", label: "Following" },
  { id: "free", label: "Free to read" },
  { id: "photos", label: "Photos" },
  { id: "audio", label: "Audio" },
  { id: "writing", label: "Writing" },
];

interface FilterChipsProps {
  value: FeedFilter;
  onChange: (v: FeedFilter) => void;
}

export function FilterChips({ value, onChange }: FilterChipsProps) {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      role="toolbar"
      aria-label="Filter feed"
    >
      {FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          aria-pressed={value === f.id}
          className={[
            "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors duration-150",
            value === f.id
              ? "bg-[#1B4332] border-[#2D6A4F] text-[#40916C]"
              : "bg-transparent border-[#2A2A2A] text-[#6B7280] hover:border-[#333333] hover:text-[#9CA3AF]",
          ].join(" ")}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
