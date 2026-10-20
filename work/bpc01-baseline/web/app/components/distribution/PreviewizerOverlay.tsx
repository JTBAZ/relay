"use client";

import { Bebas_Neue, Playfair_Display } from "next/font/google";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
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
}: Props) {
  const [mounted, setMounted] = useState(false);

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

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={`previewizer-font-scope fixed inset-0 z-[120] ${bebasNeue.variable} ${playfairDisplay.variable}`}
      role="dialog"
      aria-modal="true"
      aria-label="Previewizer"
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
