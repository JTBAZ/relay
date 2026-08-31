"use client";

import type { Ref } from "react";

type Props = {
  prompt: string;
  labels: string[];
  name: string;
  choice: string;
  disabled?: boolean;
  onChoice: (label: string) => void;
  onContinue: () => void;
  fieldsetRef?: Ref<HTMLFieldSetElement>;
};

/** One focused clarification (RC-DF-03). */
export default function ClarificationPrompt({
  prompt,
  labels,
  name,
  choice,
  disabled,
  onChoice,
  onContinue,
  fieldsetRef
}: Props) {
  return (
    <fieldset
      ref={fieldsetRef}
      tabIndex={-1}
      className="mt-2 rounded-md border border-[#1e2a22] px-2.5 py-2 focus:outline-none"
      data-lab2-command-clarification
      data-command-clarification
    >
      <legend className="text-[11px] font-medium text-[#d0ddd4]">{prompt}</legend>
      <div className="mt-1 flex flex-wrap gap-3">
        {labels.map((label) => (
          <label key={label} className="flex items-center gap-1.5 text-[12px] text-[#d0ddd4]">
            <input
              type="radio"
              name={name}
              value={label}
              checked={choice === label}
              onChange={() => onChoice(label)}
            />
            {label}
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={!choice || disabled}
        onClick={onContinue}
        className="mt-2 h-7 rounded-md border border-[#9bf0c466] bg-[#122018] px-2 text-[11px] text-[#9bf0c4] disabled:opacity-50"
      >
        Continue
      </button>
    </fieldset>
  );
}
