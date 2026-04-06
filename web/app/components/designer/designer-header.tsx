"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Globe, BookOpen, Clock, CheckCircle2, ChevronRight, ExternalLink } from "lucide-react";
import type { PageLayout } from "@/lib/designer-mock";

interface DesignerHeaderProps {
  layout: PageLayout;
  hasUnsavedChanges: boolean;
  onSave: () => void;
  onPublish: () => void;
  isSaving: boolean;
  /** Block publish while layout is dirty or a preflight request is in flight. */
  publishDisabled?: boolean;
}

export function DesignerHeader({
  layout,
  hasUnsavedChanges,
  onSave,
  onPublish,
  isSaving,
  publishDisabled = false,
}: DesignerHeaderProps) {
  const [publishConfirm, setPublishConfirm] = useState(false);

  const [lastPublished, setLastPublished] = useState<string | null>(null);

  useEffect(() => {
    if (!layout.lastPublishedAt) return;
    setLastPublished(
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(layout.lastPublishedAt))
    );
  }, [layout.lastPublishedAt]);

  function handlePublishClick() {
    if (!publishConfirm) {
      setPublishConfirm(true);
      return;
    }
    setPublishConfirm(false);
    onPublish();
  }

  return (
    <header
      className="flex items-center justify-between gap-4 px-5 h-14 shrink-0"
      style={{
        background: "var(--relay-surface-1)",
        borderBottom: "1px solid var(--relay-border)",
      }}
    >
      {/* Left — brand + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Wordmark */}
        <span
          className="text-sm font-semibold tracking-widest shrink-0"
          style={{ color: "var(--relay-gold-500)", letterSpacing: "0.14em" }}
        >
          RELAY
        </span>

        <ChevronRight size={14} style={{ color: "var(--relay-fg-subtle)" }} className="shrink-0" />

        {/* Screen label + explainer */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="text-sm font-medium shrink-0"
            style={{ color: "var(--relay-fg)" }}
          >
            Site Designer
          </span>
          <span
            className="hidden sm:inline text-xs truncate"
            style={{ color: "var(--relay-fg-subtle)" }}
          >
            — preview reflects your Library collections and visibility rules
          </span>
        </div>
      </div>

      {/* Right — status + actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Last published / live badge */}
        {layout.published && lastPublished && !hasUnsavedChanges && (
          <div
            className="hidden md:flex items-center gap-1.5 text-xs"
            style={{ color: "var(--relay-fg-muted)" }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--relay-green-400)" }}
            />
            Live · {lastPublished}
          </div>
        )}

        {/* Unsaved indicator */}
        {hasUnsavedChanges && (
          <div
            className="hidden md:flex items-center gap-1.5 text-xs"
            style={{ color: "var(--relay-fg-muted)" }}
          >
            <Clock size={12} />
            Unsaved changes
          </div>
        )}

        {/* Library context pill */}
        <Link
          href="/"
          className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
          style={{
            color: "var(--relay-fg-muted)",
            background: "var(--relay-surface-2)",
            border: "1px solid var(--relay-border)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--relay-fg)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--relay-fg-muted)";
          }}
        >
          <BookOpen size={12} />
          Library
          <ExternalLink size={10} />
        </Link>

        {/* Save draft */}
        <button
          onClick={onSave}
          disabled={!hasUnsavedChanges || isSaving}
          className="text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
          style={{
            color: "var(--relay-fg)",
            background: "var(--relay-surface-2)",
            border: "1px solid var(--relay-border)",
          }}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled) {
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--relay-green-600)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor =
              "var(--relay-border)";
          }}
        >
          {isSaving ? "Saving…" : "Save draft"}
        </button>

        {/* Publish / confirm */}
        <button
          type="button"
          onClick={handlePublishClick}
          onBlur={() => setPublishConfirm(false)}
          disabled={publishDisabled}
          title={hasUnsavedChanges ? "Save draft before publishing" : undefined}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-40"
          style={{
            background: publishConfirm
              ? "var(--relay-green-400)"
              : "var(--relay-green-600)",
            color: "var(--relay-fg)",
          }}
          onMouseEnter={(e) => {
            if (e.currentTarget.disabled) return;
            (e.currentTarget as HTMLElement).style.background =
              "var(--relay-green-400)";
          }}
          onMouseLeave={(e) => {
            if (e.currentTarget.disabled) return;
            (e.currentTarget as HTMLElement).style.background = publishConfirm
              ? "var(--relay-green-400)"
              : "var(--relay-green-600)";
          }}
        >
          {layout.published ? (
            <>
              <Globe size={12} />
              {publishConfirm ? "Confirm publish?" : "Publish update"}
            </>
          ) : (
            <>
              <CheckCircle2 size={12} />
              {publishConfirm ? "Go live?" : "Publish gallery"}
            </>
          )}
        </button>
      </div>
    </header>
  );
}

