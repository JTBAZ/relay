"use client";

type MediaTypeValue = "image" | "video" | "audio" | "text";

type Option = {
  value: MediaTypeValue;
  label: string;
};

const OPTIONS: Option[] = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "text", label: "Text" }
];

type Props = {
  selected: MediaTypeValue[];
  onChange: (next: MediaTypeValue[]) => void;
};

export type { MediaTypeValue };

export default function MediaTypeMultiSelect({ selected, onChange }: Props) {
  const toggle = (value: MediaTypeValue) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => toggle(option.value)}
          className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
            selected.includes(option.value)
              ? "border-[var(--lib-primary)] bg-[var(--lib-primary)]/25 text-[var(--lib-fg)]"
              : "border-[var(--lib-border)] bg-[var(--lib-sidebar-accent)] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
