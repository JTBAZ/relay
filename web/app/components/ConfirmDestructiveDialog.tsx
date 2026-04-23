"use client";

/**
 * Shared destructive-action confirmation dialog.
 *
 * Pattern: user must type a confirmation phrase exactly to enable the destructive button.
 * High-friction by design -- the patron-facing PE-J flows (per-creator unwind, account
 * deletion) are irreversible (or only reversible inside the grace window) and the dialog
 * exists to prevent accidental clicks, not to legalese-ify the experience.
 *
 * Uses native <dialog> for focus trap + ESC support without a modal-lib dependency.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export interface ConfirmDestructiveDialogProps {
  open: boolean;
  onClose: () => void;
  /** Title shown in the dialog header. */
  title: string;
  /** Body copy explaining what will happen + how to recover (if at all). */
  description: React.ReactNode;
  /** The phrase the user must type. Compared case-sensitively after trim. */
  confirmPhrase: string;
  /** Label for the destructive button (e.g. "Delete account"). */
  confirmLabel: string;
  /** Called when the user submits the confirmed action. Should resolve when the action is complete. */
  onConfirm: () => Promise<void>;
}

export function ConfirmDestructiveDialog({
  open,
  onClose,
  title,
  description,
  confirmPhrase,
  confirmLabel,
  onConfirm
}: ConfirmDestructiveDialogProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // Reset state on every open so a re-shown dialog isn't pre-confirmed.
  useEffect(() => {
    if (open) {
      setTyped("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const matches = typed.trim() === confirmPhrase;

  const handleConfirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto max-w-md rounded-md border border-[#3a1414] bg-[#0e0606] p-0 text-[#E0E0E0] backdrop:bg-black/70"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void handleConfirm();
        }}
      >
        <div className="flex items-start gap-3 border-b border-[#3a1414] p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#d36a6a]" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <div className="mt-1 text-[12px] text-[#bbb]">{description}</div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <label className="block text-[11px] uppercase tracking-wide text-[#888]">
            Type <code className="rounded border border-[#3a1414] bg-[#1f0808] px-1 py-0.5 text-[#d36a6a]">{confirmPhrase}</code> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded border border-[#3a1414] bg-[#0a0404] px-2 py-1.5 text-[12px] text-[#E0E0E0] placeholder:text-[#444] focus:border-[#a04040] focus:outline-none"
            placeholder={confirmPhrase}
            disabled={busy}
          />
          {error ? (
            <p role="alert" className="text-[11px] text-[#d36a6a]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#3a1414] p-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded border border-[#2A2A2A] px-3 py-1.5 text-[11px] text-[#bbb] hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!matches || busy}
            className={[
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
              matches && !busy
                ? "bg-[#a04040] text-white hover:bg-[#c25656]"
                : "cursor-not-allowed bg-[#3a1414] text-[#666]"
            ].join(" ")}
          >
            {busy ? <Loader2 size={11} className="animate-spin" aria-hidden /> : null}
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
