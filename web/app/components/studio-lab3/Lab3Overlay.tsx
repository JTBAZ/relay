"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  variant?: "center" | "sheet-left";
  size?: "md" | "lg" | "calendar" | "workbench";
  restoreFocusRef?: { current: HTMLElement | null };
  /** Leave Studio Command visible above the overlay (plan workbench). */
  topInset?: number;
};

export function Lab3Overlay({
  open,
  title,
  onClose,
  children,
  testId,
  variant = "center",
  size = "md",
  restoreFocusRef,
  topInset = 0
}: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const restore = restoreFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restore?.focus?.();
    };
  }, [open, restoreFocusRef]);

  if (!open) return null;

  const belowCommand = topInset > 0;
  const panelWidth =
    variant === "sheet-left"
      ? "h-full w-full max-w-xs"
      : size === "lg"
        ? "h-[min(90vh,52rem)] w-full max-w-3xl"
        : size === "workbench"
          ? belowCommand
            ? "h-full w-full max-w-5xl"
            : "h-[min(90vh,52rem)] w-full max-w-5xl"
          : size === "calendar"
            ? "w-full max-w-xl"
            : "w-full max-w-md";
  const shellClass =
    variant === "sheet-left"
      ? "fixed inset-0 z-[90] flex items-stretch justify-start bg-black/70"
      : belowCommand
        ? "fixed inset-x-0 bottom-0 z-[90] flex items-stretch justify-center bg-black/70 p-4"
        : "fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 sm:items-center";

  return (
    <div
      className={shellClass}
      style={belowCommand ? { top: topInset } : undefined}
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      data-lab3-overlay={variant}
      data-lab3-below-command={belowCommand ? String(topInset) : undefined}
      data-lab3-import-dialog={testId === "import" ? "" : undefined}
      data-lab3-calendar-dialog={testId === "calendar" ? "" : undefined}
      data-lab3-filter-sheet={testId === "filters" ? "" : undefined}
      data-lab3-selection-review={testId === "selection" ? "" : undefined}
      data-lab3-plan-workbench={testId === "plan" ? "" : undefined}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`flex min-h-0 flex-col overflow-hidden border border-[var(--lab3-hairline,#1c211f)] bg-[var(--lab3-surface,#080c0a)] shadow-2xl outline-none ${
          belowCommand ? "max-h-full" : "max-h-[90vh]"
        } ${
          variant === "sheet-left"
            ? `${panelWidth} rounded-none border-y-0 border-l-0`
            : `${panelWidth} rounded-2xl`
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--lab3-hairline,#1c211f)] px-4 py-3">
          <h2 id={titleId} className="text-[15px] font-semibold text-[var(--lab3-text-strong,#e8e8e8)]">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--lab3-text-muted,#6a736e)] hover:bg-[#ffffff08] hover:text-[var(--lab3-text,#d0ddd4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
