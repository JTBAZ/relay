"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Repeat,
  Search,
  Shuffle,
  Star,
  X
} from "lucide-react";
import { groupGalleryItemsByPost } from "@/lib/gallery-group";
import {
  RELAY_API_BASE,
  addPatronFavorite,
  buildGalleryCollectionsQuery,
  buildGalleryFacetsQuery,
  buildGalleryQuery,
  fetchGalleryPostDetail,
  listPatronCollections,
  listPatronFavorites,
  patronCollectionSnipMediaIdSet,
  patronFavoriteKey,
  relayFetch,
  removePatronFavorite,
  type Collection,
  type FacetsData,
  type GalleryItem,
  type GalleryListData,
  type GalleryPostDetail,
  type PatronCollectionWithEntries
} from "@/lib/relay-api";
import PostBatchGridCell from "./PostBatchGridCell";
import SnipIcon from "@/app/components/icons/SnipIcon";
import SnipToCollectionModal from "./SnipToCollectionModal";
import { readGalleryVideoLoop, writeGalleryVideoLoop } from "@/lib/gallery-video-loop";

const defaultCreatorId = process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "creator_1";
const displayName =
  process.env.NEXT_PUBLIC_RELAY_VISITOR_DISPLAY_NAME?.trim() || "Creator";
const tagline =
  process.env.NEXT_PUBLIC_RELAY_VISITOR_TAGLINE?.trim() ||
  "Patreon archive — public gallery projection";
const bannerUrl = process.env.NEXT_PUBLIC_RELAY_VISITOR_BANNER_URL?.trim() || "";
const avatarUrl = process.env.NEXT_PUBLIC_RELAY_VISITOR_AVATAR_URL?.trim() || "";

/** Stable empty set for logged-out snip state (avoids new Set() each render). */
const EMPTY_SNIP_IDS = new Set<string>();

type BrowseMode = "chrono" | "collections" | "shuffle";
type ContentFilter = "all" | "general" | "mature";

const SEARCH_DEBOUNCE_MS = 320;
const TAG_ROW_PREVIEW = 6;

const showDevTierTool = process.env.NEXT_PUBLIC_RELAY_VISITOR_DEV_TOOLS === "true";

/** Dev UI: `live` uses Bearer only; `anon` simulates logged-out; otherwise a single tier_id. */
type DevPatronSim = "live" | "anon" | string;

function shuffleInPlace<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function chipClass(active: boolean): string {
  return active
    ? "shrink-0 rounded-full border border-[color-mix(in_srgb,var(--lib-selection)_55%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-selection)_14%,var(--lib-card))] px-2.5 py-1 text-[11px] font-medium text-[var(--lib-fg)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--lib-selection)_18%,transparent)]"
    : "shrink-0 rounded-full border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_92%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--lib-fg-muted)] transition hover:border-[color-mix(in_srgb,var(--lib-selection)_35%,var(--lib-border))] hover:text-[var(--lib-fg)]";
}

function slideVisualUrl(m: GalleryItem): string | null {
  const locked = !m.has_export || !m.content_url_path;
  if (locked) return null;
  const mt = m.mime_type ?? "";
  if (mt.startsWith("image/") || mt.startsWith("video/")) {
    return `${RELAY_API_BASE}${m.content_url_path}`;
  }
  return null;
}

function slideIsVideo(m: GalleryItem): boolean {
  return Boolean(m.mime_type?.startsWith("video/"));
}

function visitorModalSlides(detail: GalleryPostDetail | null, item: GalleryItem): GalleryItem[] {
  if (!detail?.media?.length) {
    return [item];
  }
  const nonShadow = detail.media.filter((m) => !m.shadow_cover);
  if (nonShadow.length > 0) {
    return nonShadow;
  }
  return [item];
}

const visitorModalSnipBtnClass = (active: boolean) =>
  `rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] p-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] ${
    active
      ? "text-[var(--lib-selection)]"
      : "text-[oklch(0.42_0.07_155)] hover:text-[oklch(0.52_0.09_155)]"
  }`;

/** Grid + modal: hidden until card/panel hover or focus-within; coarse pointer shows faint controls. */
const visitorEngageRevealWrap = (forceVisible: boolean) =>
  forceVisible
    ? "opacity-100"
    : "opacity-0 transition-opacity duration-200 [pointer:coarse]:opacity-50 [@media(hover:hover)]:group-hover:opacity-60 group-focus-within:opacity-60";

const visitorEngageRevealBtn = "[@media(hover:hover)]:hover:opacity-100 focus-visible:opacity-100";

function VisitorPostModal({
  item,
  detail,
  videoLoop,
  onClose,
  visitorPatron
}: {
  item: GalleryItem;
  detail: GalleryPostDetail | null;
  videoLoop: boolean;
  onClose: () => void;
  visitorPatron: {
    patronAuthed: boolean;
    isPostFavorited: (postId: string) => boolean;
    onTogglePostStar: (postId: string, favorited: boolean) => void;
    snippedMediaIds: Set<string>;
    onSnipRequest: (postId: string, mediaId: string) => void;
  };
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  const slides = useMemo(
    () => visitorModalSlides(detail, item),
    [detail, item]
  );

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const idx = slides.findIndex((m) => m.media_id === item.media_id);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [item.media_id, slides]);

  const slideCount = slides.length;
  const current = slides[activeIndex] ?? item;
  const mainSrc = slideVisualUrl(current);
  const mainIsVideo = slideIsVideo(current);
  const currentLocked = !current.has_export || !current.content_url_path;
  const postId = detail?.post_id ?? item.post_id;
  const postFav = visitorPatron.isPostFavorited(postId);
  const snipActive = visitorPatron.snippedMediaIds.has(current.media_id);
  const engageAuthed = visitorPatron.patronAuthed;

  const goPrev = useCallback(() => {
    setActiveIndex((i) => (i - 1 + slideCount) % slideCount);
  }, [slideCount]);

  const goNext = useCallback(() => {
    setActiveIndex((i) => (i + 1) % slideCount);
  }, [slideCount]);

  useEffect(() => {
    const modalEl = panelRef.current;
    if (!modalEl) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.target;
      if (!(el instanceof Element)) return;
      const keep = el.closest(
        'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (keep && modalEl.contains(keep)) return;
      modalEl.focus({ preventScroll: true });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const isPrev = e.key === "ArrowLeft" || e.key === "ArrowUp";
      const isNext = e.key === "ArrowRight" || e.key === "ArrowDown";
      if (!isPrev && !isNext) return;
      if (slideCount <= 1) return;
      const t = e.target;
      if (!(t instanceof Node) || !modalEl.contains(t)) return;
      e.preventDefault();
      if (isPrev) goPrev();
      else goNext();
    };

    modalEl.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      modalEl.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [slideCount, onClose, goPrev, goNext]);

  const gridCols =
    slideCount > 1
      ? "md:grid-cols-[minmax(6rem,8rem)_minmax(0,1fr)_minmax(18.5rem,24rem)]"
      : "md:grid-cols-[minmax(0,1fr)_minmax(18.5rem,24rem)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
      role="dialog"
      aria-modal
      aria-label={detail?.title ?? item.title}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="group max-h-[min(90vh,900px)] w-full max-w-[min(96vw,1200px)] overflow-y-auto rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`grid min-h-[min(70vh,560px)] grid-cols-1 ${gridCols} grid-rows-[auto_minmax(220px,min(52vh,480px))_auto] md:min-h-[min(72vh,620px)] md:grid-rows-1`}
        >
          {slideCount > 1 ? (
            <aside
              className="order-2 flex flex-col items-center justify-center gap-3 border-b border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-muted)_92%,var(--lib-card))] py-3 pl-2 pr-2 md:order-none md:border-b-0 md:border-r md:py-4 md:pl-3 md:pr-2"
              aria-label="Assets in this post"
            >
              <div className="flex flex-row gap-2 md:flex-col md:gap-2">
                {slides.map((m, i) => {
                  const tSrc = slideVisualUrl(m);
                  const active = i === activeIndex;
                  const v = slideIsVideo(m);
                  return (
                    <button
                      key={m.media_id}
                      type="button"
                      onClick={() => setActiveIndex(i)}
                      aria-label={`Show asset ${i + 1} of ${slideCount}`}
                      aria-current={active ? "true" : undefined}
                      className={`relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-black/40 transition ${
                        active
                          ? "ring-[3px] ring-[var(--lib-selection)] ring-offset-2 ring-offset-[color-mix(in_srgb,var(--lib-muted)_92%,var(--lib-card))]"
                          : "ring-1 ring-[var(--lib-border)] opacity-90 hover:opacity-100"
                      }`}
                    >
                      {tSrc && v ? (
                        <video
                          className="pointer-events-none h-full w-full object-cover object-center"
                          src={tSrc}
                          muted
                          playsInline
                          preload="metadata"
                          aria-hidden
                        />
                      ) : tSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tSrc} alt="" className="h-full w-full object-cover object-center" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <Lock className="h-5 w-5 text-[var(--lib-fg-muted)]" aria-hidden />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p
                className="hidden text-[10px] font-semibold tabular-nums tracking-wide text-[var(--lib-fg-muted)] md:block"
                aria-live="polite"
              >
                {activeIndex + 1} / {slideCount}
              </p>
              <span className={`mt-1 inline-flex ${visitorEngageRevealWrap(snipActive)}`}>
                <button
                  type="button"
                  onClick={() => visitorPatron.onSnipRequest(postId, current.media_id)}
                  className={`${visitorModalSnipBtnClass(snipActive)} ${visitorEngageRevealBtn}`}
                  aria-label={
                    engageAuthed
                      ? snipActive
                        ? "Snipped — add to another collection from Saved"
                        : "Snip current image to a collection"
                      : "Sign in with Patreon to snip the current asset to a collection"
                  }
                  aria-pressed={engageAuthed ? snipActive : undefined}
                  title={
                    engageAuthed
                      ? "Snip current asset to a collection"
                      : "Sign in with Patreon to use collections"
                  }
                >
                  <SnipIcon className="h-5 w-5" />
                </button>
              </span>
            </aside>
          ) : null}

          <section
            className="relative order-1 flex min-h-0 min-h-[min(42vh,320px)] items-center justify-center bg-[radial-gradient(ellipse_80%_70%_at_50%_45%,color-mix(in_srgb,var(--lib-muted)_95%,#000)_0%,#050605_78%)] px-3 py-2 md:order-none md:min-h-0 md:px-4 md:py-3"
            role="region"
            aria-roledescription="carousel"
            aria-label="Selected asset"
          >
            {slideCount > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="Previous asset"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  className="absolute left-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--lib-border)_70%,transparent)] bg-black/55 text-[var(--lib-fg)] shadow-md backdrop-blur-sm transition hover:bg-black/75 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] md:left-3"
                >
                  <ChevronLeft className="h-7 w-7" strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next asset"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  className="absolute right-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--lib-border)_70%,transparent)] bg-black/55 text-[var(--lib-fg)] shadow-md backdrop-blur-sm transition hover:bg-black/75 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] md:right-3"
                >
                  <ChevronRight className="h-7 w-7" strokeWidth={2} aria-hidden />
                </button>
              </>
            ) : null}
            <div className="flex max-h-full w-full max-w-full items-center justify-center">
              {mainSrc && mainIsVideo ? (
                <video
                  key={current.media_id}
                  className="mx-auto max-h-[min(78vh,680px)] w-auto max-w-full object-contain object-center p-1 md:p-2"
                  src={mainSrc}
                  controls
                  playsInline
                  preload="metadata"
                  loop={videoLoop}
                />
              ) : mainSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mainSrc}
                  alt=""
                  className="mx-auto max-h-[min(78vh,680px)] w-auto max-w-full object-contain object-center p-1 md:p-2"
                />
              ) : (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-[var(--lib-fg-muted)]">
                  <Lock className="h-12 w-12" strokeWidth={1.25} aria-hidden />
                  <p className="text-center text-sm text-[var(--lib-fg)]">
                    {currentLocked
                      ? "This asset is available on Patreon for eligible members."
                      : "Preview unavailable."}
                  </p>
                </div>
              )}
            </div>
            {slideCount > 1 ? (
              <p className="pointer-events-none absolute bottom-3 left-1/2 z-[1] -translate-x-1/2 rounded-full border border-[color-mix(in_srgb,var(--lib-border)_55%,transparent)] bg-black/72 px-2.5 py-1 text-[10px] font-semibold tabular-nums tracking-wide text-[var(--lib-fg)]">
                {activeIndex + 1} / {slideCount}
              </p>
            ) : null}
            {slideCount <= 1 ? (
              <span
                className={`absolute bottom-3 right-3 z-10 inline-flex ${visitorEngageRevealWrap(snipActive)}`}
              >
                <button
                  type="button"
                  onClick={() => visitorPatron.onSnipRequest(postId, current.media_id)}
                  className={`${visitorModalSnipBtnClass(snipActive)} ${visitorEngageRevealBtn} border-[color-mix(in_srgb,var(--lib-border)_70%,transparent)] bg-black/55 backdrop-blur-sm`}
                  aria-label={
                    engageAuthed
                      ? snipActive
                        ? "Snipped — open Saved to manage"
                        : "Snip this asset to a collection"
                      : "Sign in with Patreon to snip this asset to a collection"
                  }
                  aria-pressed={engageAuthed ? snipActive : undefined}
                  title={
                    engageAuthed ? "Snip to a collection" : "Sign in with Patreon to use collections"
                  }
                >
                  <SnipIcon className="h-5 w-5" />
                </button>
              </span>
            ) : null}
          </section>

          <aside className="order-3 flex min-h-0 flex-col gap-3 border-t border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_96%,#000)] px-5 py-4 md:order-none md:border-l md:border-t-0 md:px-6 md:pb-4 md:pt-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 flex-1 font-[family-name:var(--font-display)] text-lg leading-snug text-[var(--lib-fg)] md:text-xl">
                {detail?.title ?? item.title}
              </h2>
              <span className={`inline-flex shrink-0 ${visitorEngageRevealWrap(postFav)}`}>
                <button
                  type="button"
                  onClick={() => visitorPatron.onTogglePostStar(postId, !postFav)}
                  className={`shrink-0 rounded-full border border-[var(--lib-border)] p-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] ${visitorEngageRevealBtn} ${
                    postFav
                      ? "border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-selection)_12%,var(--lib-muted))] text-[var(--lib-selection)]"
                      : "bg-[var(--lib-muted)] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                  }`}
                  aria-label={
                    engageAuthed
                      ? postFav
                        ? "Remove favorite (entire post)"
                        : "Favorite entire post"
                      : "Sign in with Patreon to favorite this whole post"
                  }
                  aria-pressed={engageAuthed ? postFav : undefined}
                  title={
                    engageAuthed ? "Favorite entire post" : "Sign in with Patreon to save favorites"
                  }
                >
                  <Star className="h-5 w-5" fill={postFav ? "currentColor" : "none"} strokeWidth={2} />
                </button>
              </span>
            </div>
            <p className="text-xs text-[var(--lib-fg-muted)]">
              {detail?.published_at?.slice(0, 10) ?? item.published_at.slice(0, 10)}
            </p>
            {item.visibility === "review" ? (
              <p className="inline-block w-fit rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                Mature content
              </p>
            ) : null}
            {detail?.tiers?.length ? (
              <p className="text-xs text-[var(--lib-fg-muted)]">
                Access: {detail.tiers.map((t) => t.title).join(", ")}
              </p>
            ) : null}
            <div className="flex min-h-[5rem] flex-1 flex-col overflow-hidden">
              {detail?.description ? (
                <div
                  className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-muted)_55%,var(--lib-card))] p-3 text-xs leading-relaxed text-[color-mix(in_srgb,var(--lib-fg)_88%,var(--lib-fg-muted))] [&_a]:text-[color-mix(in_srgb,var(--lib-selection)_80%,white)]"
                  dangerouslySetInnerHTML={{ __html: detail.description }}
                />
              ) : (
                <div className="min-h-0 flex-1 rounded-md border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-muted)_55%,var(--lib-card))] p-3 text-xs italic text-[var(--lib-fg-muted)]">
                  No description for this post.
                </div>
              )}
              {current.tag_ids.length > 0 ? (
                <div className="mt-3 border-t border-dashed border-[color-mix(in_srgb,var(--lib-border)_70%,transparent)] pt-2.5">
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--lib-fg-muted)] opacity-80">
                    Tags on this asset (read-only)
                  </span>
                  <p className="mt-1 break-words font-mono text-[11px] leading-relaxed text-[color-mix(in_srgb,var(--lib-fg-muted)_92%,var(--lib-fg))]">
                    {current.tag_ids.join(" · ")}
                  </p>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="mt-auto w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-muted)] px-3 py-2.5 text-xs font-medium text-[var(--lib-fg)] hover:bg-[var(--lib-input)]"
              onClick={onClose}
            >
              Close
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

async function fetchAllVisitorItems(
  creatorId: string,
  opts: {
    q?: string;
    tag_ids?: string[];
    tier_ids?: string[];
    dev_sim_patron?: boolean;
    simulate_tier_ids?: string[];
  }
): Promise<GalleryItem[]> {
  const acc: GalleryItem[] = [];
  let cursor: string | null = null;
  const wantsSearchFocus = Boolean(opts.q?.trim());
  for (;;) {
    const path = buildGalleryQuery({
      creator_id: creatorId,
      visitor: true,
      display: wantsSearchFocus ? "post_primary" : "all_media",
      q: opts.q?.trim() || undefined,
      tag_ids: opts.tag_ids?.length ? opts.tag_ids : undefined,
      tier_ids: opts.tier_ids?.length ? opts.tier_ids : undefined,
      dev_sim_patron: opts.dev_sim_patron,
      simulate_tier_ids: opts.simulate_tier_ids,
      cursor,
      limit: 120
    });
    const page = await relayFetch<GalleryListData>(path);
    acc.push(...page.items);
    cursor = page.next_cursor;
    if (!cursor) break;
  }
  return acc;
}

export default function VisitorGalleryView() {
  const router = useRouter();
  const creatorId = defaultCreatorId;
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [facets, setFacets] = useState<FacetsData | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<BrowseMode>("chrono");
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [shuffleNonce, setShuffleNonce] = useState(1);
  const [modalItem, setModalItem] = useState<GalleryItem | null>(null);
  const [modalDetail, setModalDetail] = useState<GalleryPostDetail | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tagPick, setTagPick] = useState<string[]>([]);
  const [tierPick, setTierPick] = useState<string[]>([]);
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [devPatronSim, setDevPatronSim] = useState<DevPatronSim>("live");
  const [videoLoop, setVideoLoop] = useState(() => {
    if (typeof window === "undefined") return false;
    return readGalleryVideoLoop();
  });

  const [postFavoriteKeys, setPostFavoriteKeys] = useState<Set<string>>(() => new Set());
  const [patronCollections, setPatronCollections] = useState<PatronCollectionWithEntries[]>([]);
  const [snippedMediaIds, setSnippedMediaIds] = useState<Set<string>>(() => new Set());
  const [snipTarget, setSnipTarget] = useState<{ postId: string; mediaId: string } | null>(null);
  const [patronAuthed, setPatronAuthed] = useState(false);

  useEffect(() => {
    const read = () =>
      setPatronAuthed(Boolean(typeof window !== "undefined" && localStorage.getItem("relay_session_token")?.trim()));
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);

  const reloadPatronData = useCallback(async () => {
    if (!patronAuthed) {
      setPostFavoriteKeys(new Set());
      setPatronCollections([]);
      setSnippedMediaIds(new Set());
      return;
    }
    try {
      const [favs, cols] = await Promise.all([
        listPatronFavorites(creatorId),
        listPatronCollections(creatorId)
      ]);
      setPostFavoriteKeys(
        new Set(
          favs
            .filter((f) => f.target_kind === "post")
            .map((f) => patronFavoriteKey("post", f.target_id))
        )
      );
      setPatronCollections(cols);
      setSnippedMediaIds(patronCollectionSnipMediaIdSet(cols));
    } catch {
      setPostFavoriteKeys(new Set());
      setPatronCollections([]);
      setSnippedMediaIds(new Set());
    }
  }, [creatorId, patronAuthed]);

  useEffect(() => {
    void reloadPatronData();
  }, [reloadPatronData]);

  const handlePostStarToggle = useCallback(
    async (postId: string, favorited: boolean) => {
      const key = patronFavoriteKey("post", postId);
      setPostFavoriteKeys((prev) => {
        const next = new Set(prev);
        if (favorited) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
      try {
        if (favorited) {
          await addPatronFavorite({ creatorId, targetKind: "post", targetId: postId });
        } else {
          await removePatronFavorite({ creatorId, targetKind: "post", targetId: postId });
        }
      } catch {
        setPostFavoriteKeys((prev) => {
          const next = new Set(prev);
          if (favorited) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
      }
    },
    [creatorId]
  );

  const visitorEngagement = useMemo(
    () => ({
      patronAuthed,
      isPostFavorited: (postId: string) =>
        postFavoriteKeys.has(patronFavoriteKey("post", postId)),
      onTogglePostStar: (postId: string, favorited: boolean) => {
        if (!patronAuthed) {
          router.push("/patreon/patron/connect");
          return;
        }
        void handlePostStarToggle(postId, favorited);
      },
      snippedMediaIds: patronAuthed ? snippedMediaIds : EMPTY_SNIP_IDS,
      onSnipRequest: (postId: string, mediaId: string) => {
        if (!patronAuthed) {
          router.push("/patreon/patron/connect");
          return;
        }
        setSnipTarget({ postId, mediaId });
      }
    }),
    [patronAuthed, postFavoriteKeys, snippedMediaIds, handlePostStarToggle, router]
  );

  const tierSimKey =
    showDevTierTool && devPatronSim !== "live"
      ? devPatronSim === "anon"
        ? "anon"
        : devPatronSim
      : "";

  const tierSimParams = useMemo((): {
    dev_sim_patron?: boolean;
    simulate_tier_ids?: string[];
  } | null => {
    if (!tierSimKey) return null;
    if (tierSimKey === "anon") return { dev_sim_patron: true, simulate_tier_ids: [] };
    return { dev_sim_patron: true, simulate_tier_ids: [tierSimKey] };
  }, [tierSimKey]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const loadMeta = useCallback(async () => {
    try {
      const f = await relayFetch<FacetsData>(buildGalleryFacetsQuery(creatorId, true));
      setFacets(f);
      const colRes = await relayFetch<{ items: Collection[] }>(
        buildGalleryCollectionsQuery(creatorId, true)
      );
      setCollections(colRes.items.sort((a, b) => a.sort_order - b.sort_order));
    } catch {
      /* facets optional for empty state */
    }
  }, [creatorId]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAllVisitorItems(creatorId, {
        q: debouncedSearch || undefined,
        tag_ids: tagPick.length ? tagPick : undefined,
        tier_ids: tierPick.length ? tierPick : undefined,
        ...tierSimParams
      });
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [creatorId, debouncedSearch, tagPick, tierPick, tierSimParams]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  /**
   * Drop duplicate cover rows (`shadow_cover`) while retaining at least one row per post.
   * This avoids accidental empty posts when a post has only shadow-flagged rows.
   */
  const catalogRows = useMemo(() => {
    const byPost = new Map<string, GalleryItem[]>();
    const order: string[] = [];
    for (const it of items) {
      if (!byPost.has(it.post_id)) {
        order.push(it.post_id);
        byPost.set(it.post_id, []);
      }
      byPost.get(it.post_id)!.push(it);
    }
    const out: GalleryItem[] = [];
    for (const pid of order) {
      const group = byPost.get(pid)!;
      const nonShadow = group.filter((i) => !i.shadow_cover);
      if (nonShadow.length > 0) {
        out.push(...nonShadow);
      } else if (group[0]) {
        out.push(group[0]);
      }
    }
    return out;
  }, [items]);

  const filteredByContent = useMemo(() => {
    if (contentFilter === "all") return catalogRows;
    if (contentFilter === "general") return catalogRows.filter((i) => i.visibility === "visible");
    return catalogRows.filter((i) => i.visibility === "review");
  }, [catalogRows, contentFilter]);

  const displayItems = useMemo(() => {
    if (mode === "collections" && activeCollectionId) {
      return filteredByContent.filter((i) => (i.collection_ids ?? []).includes(activeCollectionId));
    }
    if (mode === "shuffle") {
      return shuffleInPlace(filteredByContent, shuffleNonce);
    }
    return filteredByContent;
  }, [filteredByContent, mode, activeCollectionId, shuffleNonce]);

  /** One grid cell per post — same grouping as Library (`PostBatchGridCell`). */
  const postGroups = useMemo(() => groupGalleryItemsByPost(displayItems), [displayItems]);

  const openModal = useCallback(
    async (item: GalleryItem) => {
      setModalItem(item);
      setModalDetail(null);
      try {
        const d = await fetchGalleryPostDetail(creatorId, item.post_id, {
          visitor: true,
          ...(tierSimParams ?? {})
        });
        setModalDetail(d);
      } catch {
        setModalDetail(null);
      }
    },
    [creatorId, tierSimParams]
  );

  const toggleTag = (id: string) => {
    setTagPick((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleTier = (id: string) => {
    setTierPick((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const tierTitleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of facets?.tiers ?? []) m[t.tier_id] = t.title;
    return m;
  }, [facets?.tiers]);

  const postCount = postGroups.length;
  const assetCount = displayItems.length;
  const tagVariety = facets?.tag_ids?.length ?? 0;
  const allTagIds = facets?.tag_ids ?? [];
  const tagOverflow = allTagIds.length > TAG_ROW_PREVIEW;
  const visibleTagIds = tagsExpanded ? allTagIds : allTagIds.slice(0, TAG_ROW_PREVIEW);
  const hasActiveFilters =
    searchInput.trim().length > 0 ||
    tagPick.length > 0 ||
    tierPick.length > 0 ||
    contentFilter !== "all";

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setTagPick([]);
    setTierPick([]);
    setContentFilter("all");
  };

  const pickCollection = (id: string | null) => {
    setMode("collections");
    setActiveCollectionId(id);
  };

  const navPill = (active: boolean) =>
    active
      ? "rounded-full border border-[color-mix(in_srgb,var(--lib-selection)_50%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-selection)_12%,var(--lib-muted))] px-3 py-1.5 text-xs font-medium text-[var(--lib-fg)]"
      : "rounded-full px-3 py-1.5 text-xs font-medium text-[var(--lib-fg-muted)] transition hover:text-[var(--lib-fg)]";

  return (
    <div className="library-shell min-h-screen bg-[var(--lib-bg)] text-[var(--lib-fg)]">
      {/* Banner — optional URL; else cool green neutral wash */}
      <div className="relative h-[min(42vh,26rem)] w-full overflow-hidden bg-[var(--lib-muted)]">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt=""
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div
            className="h-full w-full bg-gradient-to-b from-[color-mix(in_srgb,var(--lib-primary)_18%,var(--lib-muted))] via-[var(--lib-muted)] to-[var(--lib-bg)]"
            aria-hidden
          />
        )}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--lib-bg)] via-[color-mix(in_srgb,var(--lib-bg)_45%,transparent)] to-transparent"
          aria-hidden
        />
      </div>

      {/* Centered profile block */}
      <div className="relative mx-auto flex max-w-2xl flex-col items-center px-4 text-center">
        <div className="-mt-16 flex justify-center sm:-mt-[4.25rem] md:-mt-[4.75rem]">
          <div
            className="rounded-full border-[3px] border-[oklch(0.38_0.012_160)] bg-[oklch(0.2_0.01_160)] p-1 shadow-[0_14px_48px_rgba(0,0,0,0.5)] ring-[3px] ring-[oklch(0.28_0.01_160)] ring-offset-2 ring-offset-[var(--lib-bg)]"
            aria-hidden={!avatarUrl}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-[7.25rem] w-[7.25rem] rounded-full object-cover sm:h-[8rem] sm:w-[8rem] md:h-[9rem] md:w-[9rem]"
              />
            ) : (
              <div
                className="h-[7.25rem] w-[7.25rem] rounded-full bg-[oklch(0.26_0.008_160)] sm:h-[8rem] sm:w-[8rem] md:h-[9rem] md:w-[9rem]"
                aria-hidden
              />
            )}
          </div>
        </div>
        <h1 className="mt-5 font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight text-[var(--lib-fg)] sm:text-3xl md:text-[2rem]">
          {displayName}
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--lib-fg-muted)]">{tagline}</p>
        <dl className="mt-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs sm:gap-x-10">
          <div>
            <dt className="uppercase tracking-[0.14em] text-[10px] text-[var(--lib-fg-muted)]">Posts</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-[var(--lib-fg)]">{postCount}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.14em] text-[10px] text-[var(--lib-fg-muted)]">Assets</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-[var(--lib-fg)]">{assetCount}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.14em] text-[10px] text-[var(--lib-fg-muted)]">Tags</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-[var(--lib-fg)]">{tagVariety}</dd>
          </div>
        </dl>

        <nav
          className="mt-6 flex flex-wrap items-center justify-center gap-2"
          aria-label="Browse mode"
        >
          {(
            [
              ["chrono", "Chronological"],
              ["collections", "Collections"],
              ["shuffle", "Random walk"]
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={navPill(mode === id)} onClick={() => {
              setMode(id);
              if (id !== "collections") setActiveCollectionId(null);
            }}>
              {label}
            </button>
          ))}
          {mode === "shuffle" ? (
            <button
              type="button"
              onClick={() => setShuffleNonce((n) => n + 1)}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--lib-border)] px-2.5 py-1.5 text-xs text-[var(--lib-fg-muted)] transition hover:border-[color-mix(in_srgb,var(--lib-selection)_40%,var(--lib-border))] hover:text-[var(--lib-fg)]"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden />
              Reshuffle
            </button>
          ) : null}
        </nav>

        <p className="mt-3 text-[10px] text-[var(--lib-fg-muted)]/80">
          Subscriber view — search and filters match the library (titles, tags, descriptions).
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/patreon/patron/connect"
            className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--lib-selection)_35%,var(--lib-border))] px-4 py-2 text-[11px] font-medium text-[var(--lib-fg-muted)] transition hover:border-[color-mix(in_srgb,var(--lib-selection)_55%,var(--lib-border))] hover:text-[var(--lib-fg)]"
          >
            Manage Patreon link
          </a>
          {patronAuthed ? (
            <Link
              href="/visitor/favorites"
              className="inline-flex rounded-full border border-[var(--lib-border)] px-4 py-2 text-[11px] font-medium text-[var(--lib-fg-muted)] transition hover:border-[color-mix(in_srgb,var(--lib-selection)_40%,var(--lib-border))] hover:text-[var(--lib-fg)]"
            >
              Saved
            </Link>
          ) : null}
        </div>
      </div>

      {/* Sticky filter strip (below sticky AppNav on /visitor: top-12 ≈ nav height) */}
      <section className="sticky top-12 z-40 mx-auto mt-10 w-full max-w-6xl border-t border-b border-[color-mix(in_srgb,var(--lib-border)_85%,transparent)] bg-[color-mix(in_srgb,var(--lib-bg)_94%,transparent)] px-4 py-4 shadow-[0_8px_28px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--lib-bg)_82%,transparent)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
          <div className="relative w-full max-w-md shrink-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lib-fg-muted)]"
              strokeWidth={2}
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search titles, tags, descriptions…"
              className="w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] py-2.5 pl-10 pr-9 text-sm text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)] focus:border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))] focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--lib-selection)_35%,transparent)]"
              aria-label="Search gallery"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)]">
                Content
              </span>
              {(
                [
                  ["all", "All"],
                  ["general", "General"],
                  ["mature", "Mature"]
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={chipClass(contentFilter === id)} onClick={() => setContentFilter(id)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)]">
                Playback
              </span>
              <button
                type="button"
                className={chipClass(videoLoop)}
                aria-pressed={videoLoop}
                onClick={() => {
                  setVideoLoop((prev) => {
                    const next = !prev;
                    writeGalleryVideoLoop(next);
                    return next;
                  });
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <Repeat className="h-3 w-3 shrink-0" aria-hidden />
                  Loop video
                </span>
              </button>
            </div>

            {facets?.tier_ids?.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 w-full text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)] sm:w-auto">
                  Tiers
                </span>
                <div className="flex max-h-[4.5rem] flex-wrap gap-1.5 overflow-y-auto sm:max-h-none">
                  {facets.tier_ids.map((tid) => (
                    <button key={tid} type="button" className={chipClass(tierPick.includes(tid))} onClick={() => toggleTier(tid)}>
                      {tierTitleById[tid] ?? tid}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {allTagIds.length > 0 ? (
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)]">
                  Tags
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <div
                    className={
                      tagsExpanded
                        ? "flex min-w-0 flex-1 flex-wrap gap-1.5"
                        : "flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-hidden"
                    }
                  >
                    {visibleTagIds.map((tid) => (
                      <button
                        key={tid}
                        type="button"
                        className={chipClass(tagPick.includes(tid))}
                        onClick={() => toggleTag(tid)}
                      >
                        {tid}
                        {facets?.tag_counts[tid] != null ? (
                          <span className="ml-1 tabular-nums opacity-60">({facets.tag_counts[tid]})</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  {tagOverflow && !tagsExpanded ? (
                    <button
                      type="button"
                      onClick={() => setTagsExpanded(true)}
                      className="shrink-0 rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--lib-fg-muted)] transition hover:border-[color-mix(in_srgb,var(--lib-selection)_40%,var(--lib-border))] hover:text-[var(--lib-fg)]"
                    >
                      More
                    </button>
                  ) : null}
                  {tagOverflow && tagsExpanded ? (
                    <button
                      type="button"
                      onClick={() => setTagsExpanded(false)}
                      className="shrink-0 rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--lib-fg-muted)] transition hover:text-[var(--lib-fg)]"
                    >
                      Less
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {collections.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-[color-mix(in_srgb,var(--lib-border)_50%,transparent)] pt-2">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)]">
                  Collections
                </span>
                <button type="button" className={chipClass(mode === "collections" && activeCollectionId === null)} onClick={() => pickCollection(null)}>
                  All in view
                </button>
                {collections.map((c) => (
                  <button
                    key={c.collection_id}
                    type="button"
                    className={chipClass(mode === "collections" && activeCollectionId === c.collection_id)}
                    onClick={() => pickCollection(c.collection_id)}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            ) : null}

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] font-medium text-[color-mix(in_srgb,var(--lib-selection)_75%,var(--lib-fg-muted))] underline decoration-[var(--lib-border)] underline-offset-2 hover:text-[var(--lib-selection)]"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        </div>

        {mode === "collections" && collections.length > 0 ? (
          <p className="mt-3 text-[11px] text-[var(--lib-fg-muted)]">
            Showing posts in the selected collection. Use chips above to switch.
          </p>
        ) : null}
      </section>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {loading ? (
          <p className="text-sm text-[var(--lib-fg-muted)]">Loading gallery…</p>
        ) : error ? (
          <p className="text-sm text-[var(--lib-warning)]">{error}</p>
        ) : postGroups.length === 0 ? (
          <p className="text-sm text-[var(--lib-fg-muted)]">
            {mode === "collections" && activeCollectionId
              ? "No public posts in this collection for the current filters."
              : hasActiveFilters
                ? "Nothing matches these filters."
                : "Nothing to show yet."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {postGroups.map((group) => (
              <PostBatchGridCell
                key={group.post_id}
                items={group.items}
                startFlatIndex={0}
                tierTitleById={tierTitleById}
                focusIndex={-1}
                visitorCatalog
                visitorPatronStar={{
                  patronAuthed: visitorEngagement.patronAuthed,
                  active: visitorEngagement.isPostFavorited(group.post_id),
                  onToggle: () =>
                    visitorEngagement.onTogglePostStar(
                      group.post_id,
                      !visitorEngagement.isPostFavorited(group.post_id)
                    )
                }}
                visitorPatronSnip={{
                  patronAuthed: visitorEngagement.patronAuthed,
                  snippedMediaIds: visitorEngagement.snippedMediaIds,
                  onSnipRequest: visitorEngagement.onSnipRequest
                }}
                onFocusIndex={() => {}}
                onInspect={(item) => void openModal(item)}
              />
            ))}
          </div>
        )}
      </main>

      {showDevTierTool ? (
        <div className="fixed bottom-4 right-4 z-[60] w-[min(100vw-2rem,15rem)] rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] p-2.5 shadow-xl">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--lib-fg-muted)]">
            Dev · patron tier
          </p>
          <label className="sr-only" htmlFor="relay-dev-tier-sim">
            Simulate patron tier for visitor redaction
          </label>
          <select
            id="relay-dev-tier-sim"
            value={devPatronSim}
            onChange={(e) => {
              const v = e.target.value;
              setDevPatronSim(v === "live" ? "live" : v === "anon" ? "anon" : v);
            }}
            className="w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-2 py-1.5 text-[11px] text-[var(--lib-fg)]"
          >
            <option value="live">Live (saved Bearer)</option>
            <option value="anon">Sim · logged out</option>
            {(facets?.tiers ?? []).map((t) => (
              <option key={t.tier_id} value={t.tier_id}>
                Sim · {t.title}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[9px] leading-snug text-[var(--lib-fg-muted)]">
            API: <code className="text-[8px] text-[var(--lib-fg-muted)]">RELAY_DEV_VISITOR_TIER_SIM=true</code>
          </p>
        </div>
      ) : null}

      {modalItem ? (
        <VisitorPostModal
          item={modalItem}
          detail={modalDetail}
          videoLoop={videoLoop}
          visitorPatron={visitorEngagement}
          onClose={() => {
            setModalItem(null);
            setModalDetail(null);
          }}
        />
      ) : null}

      {snipTarget ? (
        <SnipToCollectionModal
          open
          creatorId={creatorId}
          postId={snipTarget.postId}
          mediaId={snipTarget.mediaId}
          collections={patronCollections}
          onClose={() => setSnipTarget(null)}
          onApplied={(cols) => {
            setPatronCollections(cols);
            setSnippedMediaIds(patronCollectionSnipMediaIdSet(cols));
          }}
        />
      ) : null}
    </div>
  );
}
