"use client";

import { useState } from "react";
import type { PositionalComment } from "@/lib/relay-fixtures";

interface CommentPinProps {
  comment: PositionalComment;
  index: number;
  /** Faded “map” style while placing a new pin in comment mode */
  variant?: "default" | "ghost";
  /** Stagger cascade (ms) */
  cascadeDelayMs?: number;
  /** When false, pin fades out (preview hiding) */
  layerVisible?: boolean;
}

export function CommentPin({
  comment,
  index,
  variant = "default",
  cascadeDelayMs = 0,
  layerVisible = true
}: CommentPinProps) {
  const [isHovered, setIsHovered] = useState(false);
  const ghost = variant === "ghost";

  return (
    <div
      className={[
        "absolute z-10 group transition-opacity duration-300 ease-out",
        layerVisible ? "opacity-100" : "opacity-0 pointer-events-none",
      ].join(" ")}
      style={{
        left: `${comment.position.x}%`,
        top: `${comment.position.y}%`,
        transform: "translate(-50%, -50%)",
        transitionDelay: `${cascadeDelayMs}ms`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Pin indicator - subtle by default, expands on hover */}
      <button
        className={[
          "rounded-full flex items-center justify-center font-semibold transition-all duration-200",
          "border shadow-lg",
          ghost
            ? isHovered
              ? "w-7 h-7 bg-[#2D6A4F]/90 border-dashed border-[#40916C] text-white text-xs scale-105"
              : "w-6 h-6 bg-[#1a2e24]/80 border border-dashed border-[#40916C]/50 text-[10px] text-[#40916C]/90 opacity-80"
            : isHovered
              ? "w-7 h-7 bg-[#2D6A4F] border-[#40916C] text-white text-xs scale-110"
              : "w-3 h-3 bg-[#2D6A4F]/60 border-[#40916C]/40 text-transparent opacity-50 hover:opacity-100",
        ].join(" ")}
        aria-label={`Comment by ${comment.author.displayName}`}
        aria-expanded={isHovered}
      >
        {ghost ? (
          <span className="font-semibold">{index + 1}</span>
        ) : isHovered ? (
          index + 1
        ) : null}
      </button>

      {/* Hover tooltip */}
      <div
        className={[
          "absolute left-1/2 -translate-x-1/2 mt-2 w-72 transition-all duration-200 pointer-events-none",
          isHovered
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2",
        ].join(" ")}
        role="tooltip"
      >
        <div className="bg-[#161616] border border-[#2A2A2A] rounded-lg p-3 shadow-xl">
          {/* Author info */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full overflow-hidden bg-[#2A2A2A] shrink-0">
              <img
                src={comment.author.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
                width={24}
                height={24}
              />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-medium text-[#E0E0E0] block truncate">
                {comment.author.displayName}
              </span>
              <span className="text-[10px] text-[#555555]">
                {comment.createdAt}
              </span>
            </div>
          </div>

          {/* Comment text */}
          <p className="text-sm text-[#A0A0A0] leading-relaxed">
            {comment.text}
          </p>

          {/* Tags if present */}
          {comment.tags && comment.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[#1F1F1F]">
              {comment.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#0D1F17] text-[#40916C] border border-[#1B4332]/50"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* Arrow pointer */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#161616] border-l border-t border-[#2A2A2A]" />
      </div>
    </div>
  );
}
