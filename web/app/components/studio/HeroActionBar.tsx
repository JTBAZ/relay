"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Eye,
  FolderPlus,
  MoreVertical,
  Share2,
  Tag
} from "lucide-react";
import type { HeroWorkspaceMode } from "@/lib/audience-promotion-contracts";

type ActionSegment = "role" | "distribute" | "access" | "library" | "more";

type Props = {
  currentRole: string | null;
  workspaceMode?: HeroWorkspaceMode;
  onToggleAudiencePromotion?: () => void;
  onClose: () => void;
  onOpenAdvanced: (() => void) | null;
  onOpenDistribute: () => void;
  /** Relay-native delete; omit or null when not allowed. */
  onDeletePost?: (() => void) | null;
  deleteBusy?: boolean;
  deleteBlockedReason?: string | null;
};

function TrayButton({
  children,
  onClick,
  muted,
  danger
}: {
  children: ReactNode;
  onClick?: () => void;
  muted?: boolean;
  danger?: boolean;
}) {
  const idle = muted ? "#555" : danger ? "#888" : "#aaa";
  const hover = danger ? "#ef4444" : "#9bf0c4";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors disabled:cursor-default disabled:opacity-40"
      style={{ color: idle }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.color = hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = idle;
      }}
    >
      {children}
    </button>
  );
}

export default function HeroActionBar({
  currentRole,
  workspaceMode = "overview",
  onToggleAudiencePromotion,
  onClose,
  onOpenAdvanced,
  onOpenDistribute,
  onDeletePost = null,
  deleteBusy = false,
  deleteBlockedReason = null
}: Props) {
  const [activeSegment, setActiveSegment] = useState<ActionSegment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const role = currentRole?.trim() || "standalone";
  const audiencePromotionActive = workspaceMode === "audience_promotion";

  useEffect(() => {
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActiveSegment(null);
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const segments: { id: ActionSegment; icon: ReactNode; label: string }[] = [
    { id: "role", icon: <Tag size={16} />, label: "Role" },
    { id: "distribute", icon: <Share2 size={16} />, label: "Distribute" },
    { id: "access", icon: <Eye size={16} />, label: "Access" },
    { id: "library", icon: <FolderPlus size={16} />, label: "Library" },
    { id: "more", icon: <MoreVertical size={16} />, label: "More" }
  ];

  return (
    <div
      ref={barRef}
      className="relative flex flex-shrink-0 flex-col items-center"
      style={{ width: 48, zIndex: 40, overflow: "visible" }}
      data-hero-workspace-mode={workspaceMode}
    >
      <div
        className="flex flex-col items-center gap-1 rounded-2xl border py-2"
        style={{ background: "#0a0a0a", borderColor: "#1f1f1f", width: 48 }}
      >
        {segments.map((seg, idx) => {
          const lit =
            activeSegment === seg.id || (seg.id === "access" && audiencePromotionActive);
          return (
            <div key={seg.id}>
              {idx === 4 ? <div className="my-1 h-px w-6" style={{ background: "#1f1f1f" }} /> : null}
              <button
                type="button"
                title={
                  seg.id === "access" && audiencePromotionActive
                    ? "Audience & Promotion (active)"
                    : seg.label
                }
                aria-pressed={seg.id === "access" ? audiencePromotionActive : undefined}
                onClick={() => {
                  setActiveSegment((prev) => (prev === seg.id ? null : seg.id));
                  setConfirmDelete(false);
                }}
                className="relative flex items-center justify-center rounded-xl transition-all duration-150"
                style={{
                  width: 40,
                  height: 40,
                  color: lit ? "#9bf0c4" : "#555",
                  background: lit ? "rgba(155,240,196,0.08)" : "transparent"
                }}
                onMouseEnter={(e) => {
                  if (!lit) e.currentTarget.style.color = "#9bf0c4";
                }}
                onMouseLeave={(e) => {
                  if (!lit) e.currentTarget.style.color = "#555";
                }}
              >
                {seg.icon}
              </button>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {activeSegment ? (
          <motion.div
            initial={{ opacity: 0, x: -8, scaleX: 0.92 }}
            animate={{ opacity: 1, x: 0, scaleX: 1 }}
            exit={{ opacity: 0, x: -6, scaleX: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-[52px] top-2 z-50 rounded-xl border shadow-xl"
            style={{
              background: "#0e0e0e",
              borderColor: "#242424",
              minWidth: 180,
              transformOrigin: "left center"
            }}
          >
            <div className="border-b px-2 py-1.5" style={{ borderColor: "#1a1a1a" }}>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "#444" }}>
                {segments.find((s) => s.id === activeSegment)?.label}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 p-2">
              {activeSegment === "role" ? (
                <>
                  <p className="px-2 text-[10px] uppercase tracking-wider" style={{ color: "#444" }}>
                    Current role
                  </p>
                  <p
                    className="px-2 py-1 text-[12px] font-medium capitalize"
                    style={{ color: "#9bf0c4" }}
                  >
                    {role}
                  </p>
                  <p className="px-2 pb-1 text-[10px]" style={{ color: "#555" }}>
                    Role edits stay in Linked Set tools for now.
                  </p>
                </>
              ) : null}
              {activeSegment === "distribute" ? (
                <TrayButton
                  onClick={() => {
                    setActiveSegment(null);
                    onOpenDistribute();
                  }}
                >
                  Cross-post this piece
                </TrayButton>
              ) : null}
              {activeSegment === "access" ? (
                <TrayButton
                  onClick={() => {
                    setActiveSegment(null);
                    onToggleAudiencePromotion?.();
                  }}
                >
                  {audiencePromotionActive
                    ? "Back to packaging"
                    : "Audience & Promotion"}
                </TrayButton>
              ) : null}
              {activeSegment === "library" ? (
                <TrayButton
                  onClick={
                    onOpenAdvanced
                      ? () => {
                          setActiveSegment(null);
                          onOpenAdvanced();
                        }
                      : undefined
                  }
                  muted={!onOpenAdvanced}
                >
                  Advanced analytics
                </TrayButton>
              ) : null}
              {activeSegment === "more" ? (
                <>
                  <TrayButton
                    onClick={
                      onOpenAdvanced
                        ? () => {
                            setActiveSegment(null);
                            onOpenAdvanced();
                          }
                        : undefined
                    }
                    muted={!onOpenAdvanced}
                  >
                    Advanced
                  </TrayButton>
                  {onDeletePost || deleteBlockedReason ? (
                    <TrayButton
                      danger
                      muted={Boolean(deleteBlockedReason) || deleteBusy}
                      onClick={
                        deleteBusy || deleteBlockedReason
                          ? undefined
                          : () => {
                              if (!confirmDelete) {
                                setConfirmDelete(true);
                                return;
                              }
                              setActiveSegment(null);
                              setConfirmDelete(false);
                              onDeletePost?.();
                            }
                      }
                    >
                      {deleteBusy
                        ? "Deleting…"
                        : deleteBlockedReason
                          ? deleteBlockedReason
                          : confirmDelete
                            ? "Confirm delete"
                            : "Delete post"}
                    </TrayButton>
                  ) : null}
                  <TrayButton
                    onClick={() => {
                      setActiveSegment(null);
                      onClose();
                    }}
                  >
                    Close
                  </TrayButton>
                </>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
