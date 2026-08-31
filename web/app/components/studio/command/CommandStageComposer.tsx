"use client";

import type { KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";

type Props = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitLabel: string;
};

export default function CommandStageComposer({
  id,
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
  disabled = false,
  submitLabel
}: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (disabled || !value.trim()) return;
    onSubmit();
  };

  return (
    <div className="flex items-center gap-2" data-command-stage-composer="">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-8 min-w-0 flex-1 rounded-md border border-[var(--lab3-hairline,#1c211f)] bg-[#0a0f0b] px-2.5 text-[12px] text-[var(--lab3-text,#d0ddd4)] placeholder-[#5a6a60] focus:border-[var(--lab3-mint,#9bf0c4)]/50 focus:outline-none"
      />
      <button
        type="button"
        disabled={disabled || !value.trim()}
        onClick={onSubmit}
        aria-label={submitLabel}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--lab3-mint,#9bf0c4)] text-[var(--lab3-mint,#9bf0c4)] disabled:opacity-40"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
