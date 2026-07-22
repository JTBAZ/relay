"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import {
  AutopostDistributionSteps,
  type DistributionStep
} from "@/app/components/distribution/AutopostDistributionSteps";
import type { DistributionDestination } from "@/lib/relay-api";

type MediaItem = {
  id: string;
  preview: string;
  filename: string;
  type: "image" | "video" | "audio";
};

type Props = {
  postId: string;
  mediaItems: MediaItem[];
  postTitle?: string;
  /** Prefill destinations (e.g. hero gap fill for one missing platform). */
  initialSelectedDestinations?: DistributionDestination[];
  /** Prefill Autopost preview media (Audience & Promotion Continue). */
  initialPreviewMediaId?: string | null;
  onClose: () => void;
};

export function DistributionSheet({
  postId,
  mediaItems,
  postTitle,
  initialSelectedDestinations = [],
  initialPreviewMediaId = null,
  onClose
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<DistributionStep>("variation-planning");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const layer = (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[120] flex justify-end"
        role="dialog"
        aria-modal
        aria-label="Cross-post distribution"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          aria-label="Close cross-post panel"
          onClick={onClose}
        />
        <motion.aside
          className="relative flex h-full w-full max-w-6xl flex-col border-l border-[#2a2a2a] bg-[#111] shadow-2xl"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#2a2a2a] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                Cross-post
              </p>
              {postTitle?.trim() ? (
                <p className="truncate text-sm font-semibold text-[#f9fafb]" title={postTitle}>
                  {postTitle}
                </p>
              ) : (
                <p className="truncate font-mono text-[11px] text-[#9ca3af]">{postId}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] text-[#9ca3af] transition-colors hover:bg-[#1a1a1a] hover:text-[#f9fafb]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <AutopostDistributionSteps
              postId={postId}
              mediaItems={mediaItems}
              initialSelectedDestinations={initialSelectedDestinations}
              initialPreviewMediaId={initialPreviewMediaId}
              step={step}
              onStepChange={setStep}
            />
          </div>

          {step === "complete" ? (
            <footer className="shrink-0 border-t border-[#2a2a2a] px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl py-2.5 text-sm font-semibold"
                style={{ background: "#00aa6f", color: "#000" }}
              >
                Done
              </button>
            </footer>
          ) : null}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );

  return mounted ? createPortal(layer, document.body) : null;
}
