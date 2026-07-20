"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileText, Check } from "lucide-react";
import Link from "next/link";
import type { AutopostDraftFrame } from "./action-hub-types";
import { IAH } from "./action-hub-tokens";

type FrameConfirmationProps = {
  drafts: AutopostDraftFrame[];
  visible: boolean;
};

export function FrameConfirmation({ drafts, visible }: FrameConfirmationProps) {
  const firstId = drafts[0]?.id;
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 12 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div
            className="rounded-xl border p-4"
            style={{
              background: "rgba(0,170,111,0.07)",
              borderColor: "rgba(0,170,111,0.25)"
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full"
                style={{ background: IAH.accent }}
                aria-hidden="true"
              >
                <Check size={11} style={{ color: IAH.onAccent }} />
              </span>
              <p className="text-xs font-semibold" style={{ color: IAH.accent }}>
                {drafts.length} draft frames prepared
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {drafts.map((d, i) => (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 + 0.1, duration: 0.25 }}
                  className="flex items-start gap-2.5"
                >
                  <FileText
                    size={13}
                    className="mt-0.5 flex-shrink-0"
                    style={{ color: "rgba(0,170,111,0.6)" }}
                    aria-hidden="true"
                  />
                  <p className="text-xs leading-snug" style={{ color: IAH.fgMuted }}>
                    {d.intent}
                  </p>
                </motion.div>
              ))}
            </div>
            {firstId ? (
              <Link
                href={`/studio/autopost?draft_id=${encodeURIComponent(firstId)}`}
                className="mt-3 inline-flex text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ color: IAH.accent }}
              >
                Open in Autopost →
              </Link>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
