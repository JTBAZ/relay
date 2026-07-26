"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import type { RecentPost } from "./action-hub-types";
import { IAH } from "./action-hub-tokens";

type RecentPostsProps = {
  posts: RecentPost[];
  focusedPostId: string;
  onSelect: (id: string) => void;
};

export function RecentPosts({ posts, focusedPostId, onSelect }: RecentPostsProps) {
  return (
    <aside
      className="flex flex-col overflow-hidden rounded-2xl border"
      style={{
        borderColor: IAH.border,
        background: "color-mix(in srgb, var(--relay-surface-1, #111111) 85%, transparent)",
        backdropFilter: "blur(12px)"
      }}
      aria-label="Recent posts leaderboard"
    >
      <div
        className="flex items-center justify-between border-b px-5 py-4"
        style={{ borderColor: IAH.border }}
      >
        <h2
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: IAH.fg }}
        >
          Recent posts
        </h2>
        <button
          type="button"
          className="transition-colors"
          style={{ color: IAH.fgMuted }}
          aria-label="About recent posts"
        >
          <Info size={15} />
        </button>
      </div>

      <ul
        className="flex flex-col divide-y"
        style={{ borderColor: IAH.border }}
        role="listbox"
        aria-label="Recent posts"
      >
        {posts.map((post) => {
          const isSelected = post.id === focusedPostId;
          return (
            <motion.li
              key={post.id}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(post.id)}
              className="relative flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors"
              style={{
                background: isSelected ? "rgba(0,170,111,0.07)" : "transparent",
                borderColor: IAH.border
              }}
              whileHover={{ backgroundColor: "rgba(0,170,111,0.05)" }}
              whileTap={{ scale: 0.995 }}
            >
              <AnimatePresence>
                {isSelected ? (
                  <motion.span
                    layoutId="iah-post-accent"
                    initial={{ scaleY: 0, opacity: 0 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    exit={{ scaleY: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="absolute bottom-0 left-0 top-0 w-0.5 rounded-r-full"
                    style={{ background: IAH.accent }}
                    aria-hidden="true"
                  />
                ) : null}
              </AnimatePresence>

              <span
                className="w-5 flex-shrink-0 select-none font-mono text-xs"
                style={{ color: IAH.fgMuted }}
              >
                {String(post.rank).padStart(2, "0")}
              </span>

              {/* Thumb */}
              <div
                className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border"
                style={{
                  borderColor: IAH.border,
                  background: IAH.surface2
                }}
                aria-hidden="true"
              >
                {post.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.thumb}
                    alt={post.alt}
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-full w-full items-center justify-center font-mono text-[10px]"
                    style={{ color: IAH.fgSubtle }}
                  >
                    {String(post.rank).padStart(2, "0")}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-xs font-medium leading-snug"
                  style={{ color: isSelected ? IAH.fg : IAH.fgMuted }}
                >
                  {post.title}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: IAH.fgSubtle }}>
                  {post.date}
                </p>
              </div>

              <div className="flex-shrink-0 text-right">
                <p className="mb-0.5 text-xs leading-none" style={{ color: IAH.fgSubtle }}>
                  Reach
                </p>
                <p
                  className="font-mono text-sm font-semibold tabular-nums"
                  style={{ color: isSelected ? IAH.accent : IAH.fgSubtle }}
                >
                  {post.reach}
                </p>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </aside>
  );
}
