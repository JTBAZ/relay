"use client";

import { useEffect, useRef } from "react";
import { GoalsChatPopover } from "./GoalsChatPopover";
import { useGoalsLab } from "./GoalsLabContext";

function GoalsStarburstIcon({ className }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M7.5 1.5v2.25M7.5 11.25v2.25M1.5 7.5h2.25M11.25 7.5H13.5M3.46 3.46l1.59 1.59M9.95 9.95l1.59 1.59M3.46 11.54l1.59-1.59M9.95 5.05l1.59-1.59"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="7.5" cy="7.5" r="1.75" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

/**
 * Lab Goals entry — pill trigger matching Tools hotbar chrome.
 * Anchors the dialogue popover (not a centered modal drawer).
 */
export function GoalsLabLauncher() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { open, toggle, close } = useGoalsLab();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.closest("[data-goals-lab-popover]")) return;
      if (el.closest("[data-goals-lab-trigger]")) return;
      close();
    }
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, close]);

  return (
    <div
      className="relative z-[50] m-0 p-0"
      data-goals-lab-launcher
      data-testid="goals-lab-launcher"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="goals-lab-popover"
        aria-label="Open Goals"
        data-goals-lab-trigger
        data-testid="goals-lab-entry-cta"
        onClick={() => toggle()}
        className={`
          group relative z-[1] inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border
          px-2.5 text-[11px] font-medium transition-colors
          ${
            open
              ? "border-[#2a302c] bg-[#0c0e0c] text-[#c8cec9]"
              : "border-[#1d211e] bg-[#0c0e0c] text-[#aab4ae] hover:border-[#2a302c] hover:text-[#c8cec9]"
          }
        `}
      >
        <GoalsStarburstIcon className="shrink-0 transition-transform duration-300 group-hover:rotate-12" />
        <span>Goals</span>
      </button>

      <GoalsChatPopover open={open} onClose={close} triggerRef={triggerRef} />
    </div>
  );
}
