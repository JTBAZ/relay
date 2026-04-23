"use client";

import { Puzzle } from "lucide-react";

interface Props {
  variant?: string;
  title?: string;
}

export function InstallExtensionPrompt({ title = "Install the Relay browser extension" }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--relay-green-800)] bg-[var(--relay-green-950)] px-4 py-3.5">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--relay-green-800)] bg-[var(--relay-surface-1)]">
        <Puzzle className="h-4 w-4 text-[var(--relay-green-400)]" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-[var(--relay-fg)]">{title}</p>
        <a
          href="#"
          className="text-xs font-medium text-[var(--relay-green-400)] underline-offset-4 hover:underline"
        >
          Add to Chrome · Add to Firefox
        </a>
      </div>
    </div>
  );
}
