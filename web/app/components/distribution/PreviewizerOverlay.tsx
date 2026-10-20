"use client";

import { Bebas_Neue, Playfair_Display } from "next/font/google";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import PreviewizerClient from "@/app/components/previewizer";
import type {
  PreviewizerMode,
  PreviewizerResult,
  PreviewizerSession,
  PreviewizerUploadPreview,
} from "@/lib/previewizer-session";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  weight: ["700"],
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

type Props = {
  open: boolean;
  session: PreviewizerSession;
  /** Defaults to distribution for existing Autopost callers. */
  mode?: PreviewizerMode;
  onComplete: (result: PreviewizerResult) => void | Promise<void>;
  onCancel: () => void;
  /** The bench opener can be disabled while the open request is in flight. */
  returnFocusTarget?: HTMLElement | null;
  /** Adapter-owned upload — keeps Previewizer free of Relay staging imports. */
  onUploadPreview: PreviewizerUploadPreview;
};

export function PreviewizerOverlay({
  open,
  session,
  mode = "distribution",
  onComplete,
  onCancel,
  onUploadPreview,
  returnFocusTarget,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !mounted || mode !== "bench") return;
    const previousFocus = returnFocusTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter(element => element.offsetParent !== null);
    focusable()[0]?.focus();
    return () => previousFocus?.focus();
  }, [open, mounted, mode, returnFocusTarget]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={dialogRef}
      className={`previewizer-font-scope fixed inset-0 z-[120] ${bebasNeue.variable} ${playfairDisplay.variable}`}
      role="dialog"
      aria-modal="true"
      aria-label="Previewizer"
      onKeyDown={event => {
        if (mode !== "bench" || event.key !== "Tab") return;
        const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter(element => element.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }}
    >
      <PreviewizerClient
        mode={mode}
        session={session}
        onComplete={onComplete}
        onCancel={onCancel}
        onUploadPreview={onUploadPreview}
      />
    </div>,
    document.body
  );
}
