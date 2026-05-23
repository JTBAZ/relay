"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  summaryLine: string;
  losingLine: string;
  gainingLine: string;
  multiTierNote?: string;
  busy?: boolean;
  onCancel: () => void;
  onProceed: () => void;
};

/**
 * Lightweight confirmation dialog for audience tier changes (native `<dialog>`).
 */
export function AudienceAccessConfirmDialog({
  open,
  title,
  summaryLine,
  losingLine,
  gainingLine,
  multiTierNote,
  busy = false,
  onCancel,
  onProceed
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onCancel={onCancel}
      className="m-auto w-[min(100vw-2rem,24rem)] rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-0 text-[var(--lib-fg)] shadow-2xl backdrop:bg-black/60"
      aria-labelledby="audience-access-confirm-title"
    >
      <div className="space-y-3 p-4">
        <h2 id="audience-access-confirm-title" className="text-sm font-semibold">
          {title}
        </h2>
        <p className="text-xs leading-relaxed text-[var(--lib-fg)]">{summaryLine}</p>
        <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-100">
          <p>{losingLine}</p>
          <p>{gainingLine}</p>
        </div>
        {multiTierNote ? (
          <p className="text-[10px] leading-snug text-[var(--lib-fg-muted)]">{multiTierNote}</p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--lib-border)] px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-[var(--lib-border)] px-3 py-1.5 text-xs text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onProceed}
          disabled={busy}
          className="rounded-lg bg-[var(--lib-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Proceed"}
        </button>
      </div>
    </dialog>
  );
}
