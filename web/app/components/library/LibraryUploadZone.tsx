"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

type Props = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  helperText?: string;
  /** Shorter drop field for side-by-side Import Bay layout. */
  compact?: boolean;
  className?: string;
};

export default function LibraryUploadZone({
  onFiles,
  disabled,
  helperText = "Files upload to Relay immediately and appear as staged assets (same as Discord captures).",
  compact = false,
  className = ""
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        onFiles(Array.from(e.dataTransfer.files));
      }}
      onClick={() => !disabled && fileInputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      aria-disabled={disabled || undefined}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed transition-all duration-200 ${
        compact ? "h-full min-h-[7.5rem] rounded-xl px-3 py-3" : "h-28 rounded-2xl"
      } ${disabled ? "cursor-not-allowed opacity-45 pointer-events-none" : ""} ${
        dragging
          ? "border-[var(--lib-primary)] bg-[color-mix(in_srgb,var(--lib-primary)_8%,transparent)]"
          : "border-[var(--lib-border)] hover:border-[color-mix(in_srgb,var(--lib-primary)_45%,var(--lib-border))] hover:bg-[var(--lib-muted)]/30"
      } ${className}`}
    >
      <Upload
        className={`${compact ? "h-5 w-5" : "h-[22px] w-[22px]"} ${dragging ? "text-[var(--lib-primary)]" : "text-[var(--lib-fg-muted)]"}`}
        aria-hidden
      />
      <div className="text-center">
        <p className={`${compact ? "text-[11px]" : "text-[12px]"} font-semibold text-[var(--lib-fg)]`}>
          Drop files here or <span className="text-[var(--lib-primary)]">browse</span>
        </p>
        <p className={`mt-0.5 text-[var(--lib-fg-muted)] ${compact ? "text-[9px] leading-snug" : "text-[10px]"}`}>
          {helperText}
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
