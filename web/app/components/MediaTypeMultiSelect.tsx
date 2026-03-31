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
          className={`text-xs px-2 py-0.5 rounded-full border ${
            selected.includes(option.value)
              ? "bg-[#2d6a5c] border-[#7fd4bc] text-white"
              : "border-[#5c4f44] text-[#c9bfb3]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
