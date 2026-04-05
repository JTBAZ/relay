"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star, Trash2 } from "lucide-react";
import SnipIcon from "@/app/components/icons/SnipIcon";
import {
  RELAY_API_BASE,
  fetchGalleryPostDetail,
  listPatronCollections,
  listPatronFavorites,
  patronFavoriteKey,
  removePatronCollectionEntry,
  removePatronFavorite,
  type GalleryItem,
  type GalleryPostDetail,
  type PatronCollectionWithEntries,
  type PatronFavoriteRecord
} from "@/lib/relay-api";

const defaultCreatorId = process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "creator_1";
const displayName =
  process.env.NEXT_PUBLIC_RELAY_VISITOR_DISPLAY_NAME?.trim() || "Creator";

function resolveMediaInPost(
  detail: GalleryPostDetail | null | undefined,
  mediaId: string
): GalleryItem | null {
  if (!detail?.media?.length) return null;
  const nonShadow = detail.media.filter((m) => !m.shadow_cover);
  const pool = nonShadow.length ? nonShadow : detail.media;
  return pool.find((m) => m.media_id === mediaId) ?? null;
}

function thumbSrc(item: GalleryItem | null): string | null {
  if (!item?.has_export || !item.content_url_path) return null;
  const mt = item.mime_type ?? "";
  if (mt.startsWith("image/") || mt.startsWith("video/")) {
    return `${RELAY_API_BASE}${item.content_url_path}`;
  }
  return null;
}

export default function VisitorFavoritesPage() {
  const creatorId = defaultCreatorId;
  const [patronAuthed, setPatronAuthed] = useState(false);
  const [favorites, setFavorites] = useState<PatronFavoriteRecord[]>([]);
  const [collections, setCollections] = useState<PatronCollectionWithEntries[]>([]);
  const [detailByPost, setDetailByPost] = useState<Map<string, GalleryPostDetail>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () =>
      setPatronAuthed(Boolean(typeof window !== "undefined" && localStorage.getItem("relay_session_token")?.trim()));
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!patronAuthed) {
      setFavorites([]);
      setCollections([]);
      setDetailByPost(new Map());
      setLoading(false);
      return;
    }
    try {
      const [favList, colList] = await Promise.all([
        listPatronFavorites(creatorId),
        listPatronCollections(creatorId)
      ]);
      const sortedFav = [...favList].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setFavorites(sortedFav);
      setCollections(
        [...colList].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFavorites([]);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, [creatorId, patronAuthed]);

  useEffect(() => {
    void load();
  }, [load]);

  const postIdsNeeded = useMemo(() => {
    const s = new Set<string>();
    for (const f of favorites) {
      if (f.target_kind === "post") s.add(f.target_id);
    }
    for (const c of collections) {
      for (const e of c.entries) s.add(e.post_id);
    }
    return Array.from(s);
  }, [favorites, collections]);

  const postIdsFetchKey = useMemo(() => [...postIdsNeeded].sort().join("|"), [postIdsNeeded]);

  useEffect(() => {
    if (!patronAuthed || postIdsNeeded.length === 0) {
      setDetailByPost(new Map());
      return;
    }
    let cancelled = false;
    const slice = postIdsNeeded.slice(0, 120);
    void (async () => {
      const results = await Promise.all(
        slice.map((pid) =>
          fetchGalleryPostDetail(creatorId, pid, { visitor: true }).catch(() => null)
        )
      );
      if (cancelled) return;
      const m = new Map<string, GalleryPostDetail>();
      for (let i = 0; i < slice.length; i++) {
        const d = results[i];
        if (d) m.set(slice[i]!, d);
      }
      setDetailByPost(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId, patronAuthed, postIdsFetchKey]);

  const postFavorites = useMemo(
    () => favorites.filter((f) => f.target_kind === "post"),
    [favorites]
  );
  const legacyMediaFavorites = useMemo(
    () => favorites.filter((f) => f.target_kind === "media"),
    [favorites]
  );

  const removeFavorite = useCallback(
    async (f: PatronFavoriteRecord) => {
      const key = patronFavoriteKey(f.target_kind, f.target_id);
      try {
        await removePatronFavorite({
          creatorId,
          targetKind: f.target_kind,
          targetId: f.target_id
        });
        setFavorites((prev) =>
          prev.filter((x) => patronFavoriteKey(x.target_kind, x.target_id) !== key)
        );
      } catch {
        /* ignore */
      }
    },
    [creatorId]
  );

  const removeEntry = useCallback(
    async (collectionId: string, postId: string, mediaId: string) => {
      try {
        await removePatronCollectionEntry({ creatorId, collectionId, postId, mediaId });
        setCollections((prev) =>
          prev.map((c) =>
            c.collection_id === collectionId
              ? {
                  ...c,
                  entries: c.entries.filter(
                    (e) => !(e.post_id === postId && e.media_id === mediaId)
                  )
                }
              : c
          )
        );
      } catch {
        /* ignore */
      }
    },
    [creatorId]
  );

  const emptyAuthed =
    postFavorites.length === 0 && legacyMediaFavorites.length === 0 && collections.every((c) => !c.entries.length);

  return (
    <div className="library-shell flex min-h-0 flex-1 flex-col bg-[var(--lib-bg)] text-[var(--lib-fg)]">
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Link
          href="/visitor"
          className="text-sm text-[var(--lib-fg-muted)] transition hover:text-[var(--lib-fg)]"
        >
          ← Back to gallery
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-medium text-[var(--lib-fg)]">
          Saved
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--lib-fg-muted)]">
          Starred posts and snipped assets in your collections. Open the gallery to add more with the star and snip
          controls.
        </p>

        {!patronAuthed ? (
          <p className="mt-8 text-sm text-[var(--lib-fg-muted)]">
            Sign in with Patreon from the gallery to see saved items here.
          </p>
        ) : loading ? (
          <p className="mt-8 text-sm text-[var(--lib-fg-muted)]">Loading…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-[var(--lib-warning)]">{error}</p>
        ) : emptyAuthed ? (
          <p className="mt-8 text-sm text-[var(--lib-fg-muted)]">
            Nothing saved yet — favorite a whole post with the star, or snip the current asset into a collection from the
            gallery.
          </p>
        ) : (
          <div className="mt-10 space-y-12">
            <section aria-labelledby="saved-favorites-heading">
              <h2
                id="saved-favorites-heading"
                className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)]"
              >
                <Star className="h-4 w-4 text-[var(--lib-selection)]" aria-hidden />
                Favorite posts
              </h2>
              {postFavorites.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--lib-fg-muted)]">No starred posts yet.</p>
              ) : (
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {postFavorites.map((f) => {
                    const d = detailByPost.get(f.target_id);
                    const hero =
                      d?.media?.find((m) => !m.shadow_cover && m.has_export) ?? d?.media?.[0] ?? null;
                    const src = thumbSrc(hero);
                    const title = d?.title ?? f.target_id;
                    return (
                      <li
                        key={patronFavoriteKey(f.target_kind, f.target_id)}
                        className="overflow-hidden rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)]"
                      >
                        <Link href="/visitor" className="block">
                          <div className="relative aspect-square bg-[var(--lib-muted)]">
                            {src && hero?.mime_type?.startsWith("video/") ? (
                              <video
                                className="h-full w-full object-cover object-center"
                                src={src}
                                muted
                                playsInline
                                preload="metadata"
                                aria-hidden
                              />
                            ) : src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={src} alt="" className="h-full w-full object-cover object-center" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-[var(--lib-fg-muted)]">
                                Preview
                              </div>
                            )}
                          </div>
                        </Link>
                        <div className="flex items-start justify-between gap-2 p-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-[var(--lib-fg)]">{title}</p>
                            <p className="truncate text-[10px] text-[var(--lib-fg-muted)]">{displayName}</p>
                            <Link
                              href="/visitor"
                              className="mt-1 inline-block text-[10px] font-medium text-[color-mix(in_srgb,var(--lib-selection)_80%,var(--lib-fg-muted))] underline-offset-2 hover:underline"
                            >
                              View in gallery
                            </Link>
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeFavorite(f)}
                            className="shrink-0 rounded-md border border-[var(--lib-border)] p-1.5 text-[var(--lib-fg-muted)] transition hover:border-[color-mix(in_srgb,var(--lib-selection)_40%,var(--lib-border))] hover:text-[var(--lib-selection)]"
                            aria-label="Remove favorite"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="saved-collections-heading">
              <h2
                id="saved-collections-heading"
                className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)]"
              >
                <SnipIcon className="h-4 w-4 text-[oklch(0.48_0.08_155)]" aria-hidden />
                Collections
              </h2>
              {collections.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--lib-fg-muted)]">No collections yet — snip an asset to create one.</p>
              ) : (
                <div className="mt-6 space-y-10">
                  {collections.map((c) => {
                    const entries = [...c.entries].sort(
                      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );
                    return (
                      <div key={c.collection_id}>
                        <h3 className="text-base font-medium text-[var(--lib-fg)]">{c.title}</h3>
                        {entries.length === 0 ? (
                          <p className="mt-2 text-sm text-[var(--lib-fg-muted)]">Empty — add from the gallery.</p>
                        ) : (
                          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {entries.map((e) => {
                              const d = detailByPost.get(e.post_id);
                              const item = resolveMediaInPost(d, e.media_id);
                              const src = thumbSrc(item);
                              const title = d?.title ?? e.post_id;
                              return (
                                <li
                                  key={e.entry_id}
                                  className="overflow-hidden rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)]"
                                >
                                  <Link href="/visitor" className="block">
                                    <div className="relative aspect-square bg-[var(--lib-muted)]">
                                      {src && item?.mime_type?.startsWith("video/") ? (
                                        <video
                                          className="h-full w-full object-cover object-center"
                                          src={src}
                                          muted
                                          playsInline
                                          preload="metadata"
                                          aria-hidden
                                        />
                                      ) : src ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={src} alt="" className="h-full w-full object-cover object-center" />
                                      ) : (
                                        <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-[var(--lib-fg-muted)]">
                                          Locked or unavailable
                                        </div>
                                      )}
                                    </div>
                                  </Link>
                                  <div className="flex items-start justify-between gap-2 p-2">
                                    <div className="min-w-0">
                                      <p className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--lib-fg)]">
                                        {title}
                                      </p>
                                      <p className="truncate text-[10px] text-[var(--lib-fg-muted)]">{displayName}</p>
                                      <Link
                                        href="/visitor"
                                        className="mt-0.5 inline-block text-[10px] font-medium text-[color-mix(in_srgb,var(--lib-selection)_80%,var(--lib-fg-muted))] underline-offset-2 hover:underline"
                                      >
                                        View post
                                      </Link>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void removeEntry(c.collection_id, e.post_id, e.media_id)}
                                      className="shrink-0 rounded-md border border-[var(--lib-border)] p-1.5 text-[var(--lib-fg-muted)] transition hover:border-[color-mix(in_srgb,var(--lib-selection)_40%,var(--lib-border))] hover:text-[var(--lib-warning)]"
                                      aria-label="Remove from collection"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {legacyMediaFavorites.length > 0 ? (
              <section aria-labelledby="saved-legacy-heading">
                <h2
                  id="saved-legacy-heading"
                  className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)]"
                >
                  Legacy asset bookmarks
                </h2>
                <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
                  Older heart-saved assets (before snip collections). Remove here or leave as-is; new saves use snip.
                </p>
                <ul className="mt-4 space-y-2">
                  {legacyMediaFavorites.map((f) => (
                    <li
                      key={patronFavoriteKey(f.target_kind, f.target_id)}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] text-[var(--lib-fg)]">{f.target_id}</p>
                        <p className="text-[10px] text-[var(--lib-fg-muted)]">
                          Saved {new Date(f.created_at).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeFavorite(f)}
                        className="shrink-0 rounded-md border border-[var(--lib-border)] p-2 text-[var(--lib-fg-muted)] transition hover:text-[var(--lib-selection)]"
                        aria-label="Remove legacy bookmark"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
