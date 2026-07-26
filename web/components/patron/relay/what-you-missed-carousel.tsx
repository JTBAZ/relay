"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, Headphones, ImageIcon, Sparkles, Video } from "lucide-react";
import type { LockedFeedPost, MediaType } from "@/lib/relay-fixtures";
import { trackedPromoHref } from "@/lib/effective-promo";

const MEDIA_META: Record<MediaType, { label: string; icon: typeof FileText }> = {
  writing: { label: "Writing", icon: FileText },
  photo: { label: "Photo", icon: ImageIcon },
  audio: { label: "Audio", icon: Headphones },
  video: { label: "Video", icon: Video }
};

function publishedLabel(raw: string): string {
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return raw;
  const diffMs = Date.now() - time;
  if (diffMs < 60_000) return "Just now";
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) return `${Math.max(1, diffHours)}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(time));
}

function creatorPageHref(handle: string): string {
  return `/${encodeURIComponent(handle)}`;
}

export function WhatYouMissedCarousel({ posts }: { posts: LockedFeedPost[] }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (posts.length === 0 || typeof window === "undefined") return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      setEntered(true);
      return;
    }

    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.28, rootMargin: "0px 0px -12% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [posts.length]);

  if (posts.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      aria-labelledby="what-you-missed-heading"
      className={[
        "relative mt-12 overflow-hidden rounded-[28px] border border-[#302817]",
        "bg-[radial-gradient(circle_at_12%_0%,rgba(197,179,88,0.16),transparent_34%),linear-gradient(145deg,rgba(26,22,15,0.96),rgba(8,12,10,0.98)_62%,rgba(10,31,23,0.9))]",
        "px-4 py-5 shadow-[0_28px_90px_rgba(0,0,0,0.38)] sm:px-5 sm:py-6",
        "transition-all duration-700 ease-out",
        entered ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#C5B358]/70 to-transparent" />
      <div
        className={[
          "pointer-events-none absolute -right-14 -top-20 h-44 w-44 rounded-full bg-[#2D6A4F]/12 blur-3xl",
          "transition-transform duration-1000 ease-out",
          entered ? "scale-100" : "scale-50"
        ].join(" ")}
      />
      <div
        className={[
          "pointer-events-none absolute -bottom-16 left-10 h-32 w-52 rounded-full bg-[#C5B358]/10 blur-3xl",
          "transition-transform duration-1000 ease-out",
          entered ? "scale-100" : "scale-75"
        ].join(" ")}
      />

      <div
        className={[
          "relative mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
          "transition-all duration-700 ease-out",
          entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        ].join(" ")}
      >
        <div className="min-w-0 max-w-md">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#4A3C23] bg-[#17130D]/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5B358]">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            What you missed
          </div>
          <h2
            id="what-you-missed-heading"
            className="text-sm font-medium leading-snug tracking-normal text-[#D1D5DB]"
          >
            Available at higher tiers
          </h2>
          <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-[#7A7A72]">
            Explore what happens next.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#24382D] bg-[#0D1F17]/70 px-3 py-2 text-[11px] text-[#9BC7AF]">
          <span>{posts.length} locked {posts.length === 1 ? "post" : "posts"}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      </div>

      <div
        className="relative -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 pt-1 [perspective:900px] [scrollbar-color:#3A3324_transparent] [scrollbar-width:thin]"
        aria-label="Locked posts from creators you follow"
      >
        {posts.map((post, index) => {
          const meta = MEDIA_META[post.mediaType] ?? MEDIA_META.writing;
          const Icon = meta.icon;
          const tierName = post.tierLabel.trim();
          const promo = post.effective_promo;
          const unlockCtaText = promo?.cta_text?.trim()
            ? promo.cta_text.trim()
            : `Unlock at ${tierName} Tier`;
          const href = promo
            ? trackedPromoHref(promo, post.creator.patreonCreatorUrl)
            : post.creator.patreonCreatorUrl ?? creatorPageHref(post.creator.handle);
          return (
            <article
              key={`${post.creator.id}:${post.id}`}
              style={{ transitionDelay: entered ? `${140 + index * 90}ms` : "0ms" }}
              className={[
                "group min-w-[252px] max-w-[252px] snap-start rounded-2xl border border-[#352C1B]",
                "bg-[linear-gradient(180deg,rgba(24,20,14,0.96),rgba(15,15,15,0.96))] p-3.5",
                "shadow-[0_16px_38px_rgba(0,0,0,0.28)] transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)]",
                "hover:-translate-y-1 hover:border-[#5B4A28] hover:shadow-[0_22px_48px_rgba(0,0,0,0.36)]",
                entered
                  ? "translate-x-0 translate-y-0 rotate-0 opacity-100"
                  : "translate-x-8 translate-y-8 rotate-[5deg] opacity-0"
              ].join(" ")}
            >
              <div className="flex items-center gap-2.5">
                <img
                  src={post.creator.avatarUrl}
                  alt=""
                  className="h-8 w-8 rounded-full border border-[#3B3322] bg-[#1D1D1D] object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[#E5E7EB]">
                    {post.creator.displayName}
                  </p>
                  <p className="truncate text-[11px] text-[#6B7280]">
                    @{post.creator.handle}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex h-20 flex-col justify-center rounded-xl border border-[#2E2617] bg-[radial-gradient(circle_at_10%_0%,rgba(197,179,88,0.13),transparent_42%),#17130D] px-3 transition-colors group-hover:border-[#4A3C23]">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-[#D6D3C6]">
                  {promo?.headline?.trim() || post.title}
                </p>
                {promo?.code ? (
                  <p className="mt-1 truncate font-mono text-[10px] text-[#C5B358]" data-locked-promo-code>
                    {promo.code}
                    {promo.percent_off != null ? ` · ${promo.percent_off}% off` : ""}
                  </p>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#2C3F33] bg-[#0D1F17]/80 px-2 py-0.5 font-medium text-[#9BC7AF]">
                  <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {meta.label}
                </span>
                <span className="rounded-full border border-[#4A3C23] bg-[#1A150D] px-2 py-0.5 font-medium text-[#C5B358]">
                  Tier: {tierName} required
                </span>
                <span className="text-[#6B7280]">{publishedLabel(post.publishedAt)}</span>
              </div>

              <Link
                href={href}
                className="mt-3 flex items-center justify-between rounded-xl border border-[#4A3C23] bg-[#21190D] px-3 py-2 text-xs font-semibold text-[#F2DF8A] transition-colors hover:border-[#C5B358]/70 hover:bg-[#2A210F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B358]/60"
                aria-label={`${unlockCtaText}: ${post.title}`}
              >
                <span>{unlockCtaText}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
