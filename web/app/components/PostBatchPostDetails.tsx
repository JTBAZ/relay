"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { RELAY_API_BASE } from "@/lib/relay-api";
import type {
  Collection,
  FacetsData,
  GalleryItem,
  GalleryPostDetail,
  PostVisibility
} from "@/lib/relay-api";
import { accessChipLabel } from "./GalleryGridTile";
import { InspectSmartTagPanel } from "./inspect/inspect-smart-tag-panel";

const SEL = "#00aa6f";

const TIP_VISIBILITY =
  "Whether this post appears in your Relay gallery list (visible / hidden) or only when Mature is enabled (18+). Not the same as Patreon’s public page.";
const TIP_TIER =
  "Which membership tiers can access this content on Patreon. Separate from gallery visibility in Relay.";
const TIP_TAGS =
  "Labels used for search and filters in Relay. You can add Relay-only tags here without changing Patreon.";
const TIP_COLLECTIONS =
  "Named groups in Relay. Add this post to a collection or create one — membership is per post, not synced from Patreon.";

const HINT_VISIBILITY = "Gallery list visibility in Relay — not Patreon’s public visibility.";
const HINT_TIER = "Patreon tier access — who is allowed to see this post.";
const HINT_TAGS = "Improves search; Relay-only tags are OK.";
const HINT_COLLECTIONS = "Collections that already include this post. Use Add to attach more.";

const VIS_CHIP: Record<
  PostVisibility,
  { label: string; className: string; chipTitle: string }
> = {
  visible: {
    label: "Visible",
    className: "border-[color-mix(in_srgb,var(--lib-selection)_50%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-selection)_16%,var(--lib-card))] text-[var(--lib-fg)]",
    chipTitle: "Shown in the gallery when visible items are included"
  },
  hidden: {
    label: "Hidden",
    className: "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg-muted)]",
    chipTitle: "Hidden from the gallery list"
  },
  review: {
    label: "Mature (18+)",
    className: "border-amber-500/35 bg-amber-500/10 text-amber-100/90",
    chipTitle: "Appears when the Mature filter is on — content flagged 18+"
  }
};

function SectionBlock({
  title,
  tooltip,
  hint,
  children
}: {
  title: string;
  tooltip: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[var(--lib-border)] pb-4 pt-3 first:pt-0 last:border-b-0">
      <h3
        className="cursor-help text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)] sm:text-xs"
        title={tooltip}
      >
        {title}
      </h3>
      <p className="mt-1 text-[0.65rem] leading-snug text-[var(--lib-fg-muted)] sm:text-xs">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

type Props = {
  items: GalleryItem[];
  postDetail: GalleryPostDetail | null;
  postDetailLoading: boolean;
  tierTitleById: Record<string, string>;
  collections: Collection[];
  creatorId: string;
  facets: FacetsData;
  postId: string;
  onTagsChanged: () => Promise<void>;
  onCollectionsChanged?: () => Promise<void>;
  onTagError: (message: string | null) => void;
  /**
   * When true, only editable tags + collections (for batch modal sidebar — visibility/tier/description
   * come from InspectMetaSidebar).
   */
  tagsAndCollectionsOnly?: boolean;
};

export default function PostBatchPostDetails({
  items,
  postDetail,
  postDetailLoading,
  tierTitleById,
  collections,
  creatorId,
  facets,
  postId,
  onTagsChanged,
  onCollectionsChanged,
  onTagError,
  tagsAndCollectionsOnly = false
}: Props) {
  const primary = items[0]!;
  const [newTag, setNewTag] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [addCollectionOpen, setAddCollectionOpen] = useState(false);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState("");
  const [collBusy, setCollBusy] = useState(false);
  const addCollRef = useRef<HTMLDivElement>(null);

  const refreshAfterCollection = onCollectionsChanged ?? onTagsChanged;

  const uniqueVis = useMemo(
    () => Array.from(new Set(items.map((i) => i.visibility))) as PostVisibility[],
    [items]
  );

  const tiers =
    postDetail && postDetail.tiers.length > 0
      ? postDetail.tiers
      : primary.tier_ids.map((tier_id) => ({
          tier_id,
          title: accessChipLabel(tier_id, tierTitleById)
        }));

  const tagIds = postDetail?.tag_ids ?? primary.tag_ids;

  const collectionIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      for (const c of it.collection_ids) s.add(c);
    }
    return s;
  }, [items]);

  const titleByCollectionId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of collections) {
      m.set(c.collection_id, c.title);
    }
    return m;
  }, [collections]);

  const collectionsNotContainingPost = useMemo(
    () => collections.filter((c) => !collectionIdSet.has(c.collection_id)),
    [collections, collectionIdSet]
  );

  useEffect(() => {
    if (!addCollectionOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!addCollRef.current?.contains(e.target as Node)) {
        setAddCollectionOpen(false);
        setNewCollectionOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [addCollectionOpen]);

  const runBulkTags = useCallback(
    async (add: string[], remove: string[]) => {
      setTagBusy(true);
      onTagError(null);
      try {
        const res = await fetch(`${RELAY_API_BASE}/api/v1/gallery/media/bulk-tags`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            creator_id: creatorId,
            post_ids: [postId],
            add_tag_ids: add,
            remove_tag_ids: remove
          })
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(j?.error?.message ?? res.statusText);
        }
        await onTagsChanged();
      } catch (e) {
        onTagError(e instanceof Error ? e.message : String(e));
      } finally {
        setTagBusy(false);
      }
    },
    [creatorId, postId, onTagsChanged, onTagError]
  );

  const addPostToCollection = useCallback(
    async (collectionId: string) => {
      setCollBusy(true);
      onTagError(null);
      try {
        const res = await fetch(`${RELAY_API_BASE}/api/v1/gallery/collections/${collectionId}/posts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ post_ids: [postId] })
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(j?.error?.message ?? res.statusText);
        }
        setAddCollectionOpen(false);
        setNewCollectionOpen(false);
        await refreshAfterCollection();
      } catch (e) {
        onTagError(e instanceof Error ? e.message : String(e));
      } finally {
        setCollBusy(false);
      }
    },
    [postId, refreshAfterCollection, onTagError]
  );

  const createCollectionAndAdd = useCallback(async () => {
    const title = newCollectionTitle.trim();
    if (!title) return;
    setCollBusy(true);
    onTagError(null);
    try {
      const createRes = await fetch(`${RELAY_API_BASE}/api/v1/gallery/collections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creator_id: creatorId, title })
      });
      const json = (await createRes.json()) as {
        data?: Collection;
        error?: { message?: string };
      };
      if (!createRes.ok) {
        throw new Error(json.error?.message ?? createRes.statusText);
      }
      const newId = json.data?.collection_id;
      if (!newId) throw new Error("Missing collection id from server.");
      setNewCollectionTitle("");
      setNewCollectionOpen(false);
      await addPostToCollection(newId);
    } catch (e) {
      onTagError(e instanceof Error ? e.message : String(e));
    } finally {
      setCollBusy(false);
    }
  }, [creatorId, newCollectionTitle, addPostToCollection, onTagError]);

  const addTag = useCallback(async () => {
    const t = newTag.trim();
    if (!t) return;
    if (tagIds.includes(t)) {
      onTagError("That tag is already on this post.");
      return;
    }
    setNewTag("");
    await runBulkTags([t], []);
  }, [newTag, tagIds, runBulkTags, onTagError]);

  const removeTag = useCallback(
    async (tag: string) => {
      await runBulkTags([], [tag]);
    },
    [runBulkTags]
  );

  const suggestionListId = "post-batch-tag-suggestions";

  return (
    <div
      className={
        tagsAndCollectionsOnly
          ? "pt-2"
          : "mt-6 border-t border-[var(--lib-border)] pt-4"
      }
    >
      {!tagsAndCollectionsOnly ? (
        <>
          <p
            className="mb-3 cursor-help text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg)] sm:text-xs"
            title="Metadata for this post: gallery visibility, access, tags, and Relay collections."
          >
            Post details
          </p>
          {postDetailLoading ? (
            <p className="text-xs text-[var(--lib-fg-muted)] sm:text-sm">Loading details…</p>
          ) : null}

          <SectionBlock title="Visibility" tooltip={TIP_VISIBILITY} hint={HINT_VISIBILITY}>
            {uniqueVis.map((v) => {
              const cfg = VIS_CHIP[v] ?? {
                label: v,
                className: "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg-muted)]",
                chipTitle: v
              };
              return (
                <span
                  key={v}
                  title={cfg.chipTitle}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.className}`}
                >
                  {cfg.label}
                </span>
              );
            })}
          </SectionBlock>

          <SectionBlock title="Tier access" tooltip={TIP_TIER} hint={HINT_TIER}>
            {tiers.length > 0 ? (
              tiers.map((t) => (
                <span
                  key={t.tier_id}
                  title={`Tier: ${t.title}. Patreon members at this level (or higher, per your campaign rules) can access this post.`}
                  className="inline-flex items-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-sidebar-accent)] px-2.5 py-1 text-xs text-[var(--lib-fg)]"
                >
                  {t.title}
                </span>
              ))
            ) : (
              <span className="text-xs text-[var(--lib-fg-muted)]" title={TIP_TIER}>
                No tier data
              </span>
            )}
          </SectionBlock>
        </>
      ) : null}

      {tagsAndCollectionsOnly ? (
        <p
          className="mb-2 cursor-help text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)] sm:text-xs"
          title="Post-level tags and Relay collections for this Patreon post."
        >
          Post tags &amp; collections
        </p>
      ) : null}
      {tagsAndCollectionsOnly && postDetailLoading ? (
        <p className="mb-2 text-xs text-[var(--lib-fg-muted)] sm:text-sm">Loading details…</p>
      ) : null}

      <SectionBlock title="Tags" tooltip={TIP_TAGS} hint={HINT_TAGS}>
        {tagIds.map((tag) => (
          <span
            key={tag}
            title={`Tag: ${tag}. Used when you search or filter the gallery.`}
            className="group inline-flex items-center gap-1 rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] py-1 pl-2.5 pr-1 text-xs text-[var(--lib-fg)]"
          >
            <span>{tag}</span>
            <button
              type="button"
              disabled={tagBusy}
              onClick={() => void removeTag(tag)}
              className="rounded px-1.5 text-[var(--lib-fg-muted)] hover:bg-[var(--lib-sidebar-accent)] hover:text-[var(--lib-fg)] disabled:opacity-40"
              aria-label={`Remove tag ${tag}`}
              title="Remove this tag from the post (Relay only)"
            >
              ×
            </button>
          </span>
        ))}
        <div className="mt-2 flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            list={suggestionListId}
            value={newTag}
            onChange={(e) => {
              setNewTag(e.target.value);
              onTagError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addTag();
              }
            }}
            placeholder="Add tag…"
            disabled={tagBusy}
            className="min-w-0 flex-1 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-2 py-1.5 text-sm text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)] focus:border-[var(--lib-ring)] focus:outline-none"
            aria-label="New tag for this post"
          />
          <datalist id={suggestionListId}>
            {facets.tag_ids.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button
            type="button"
            disabled={tagBusy || !newTag.trim()}
            onClick={() => void addTag()}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-neutral-950 disabled:opacity-40"
            style={{ backgroundColor: SEL }}
          >
            Add tag
          </button>
        </div>
      </SectionBlock>

      <SectionBlock title="Collections" tooltip={TIP_COLLECTIONS} hint={HINT_COLLECTIONS}>
        {collectionIdSet.size > 0 ? (
          Array.from(collectionIdSet).map((id) => {
            const name = titleByCollectionId.get(id);
            return (
              <span
                key={id}
                title={name ? `Collection “${name}” in Relay` : `Collection id: ${id}`}
                className="inline-flex max-w-full items-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-sidebar-accent)] px-2.5 py-1 text-xs text-[var(--lib-fg)]"
              >
                <span className="truncate">{name ?? id}</span>
              </span>
            );
          })
        ) : (
          <span className="text-xs text-[var(--lib-fg-muted)]" title={TIP_COLLECTIONS}>
            Not in any collection
          </span>
        )}

        <div className="relative mt-2 w-full basis-full" ref={addCollRef}>
          <button
            type="button"
            disabled={collBusy}
            onClick={() => {
              setAddCollectionOpen((o) => !o);
              setNewCollectionOpen(false);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-xs font-medium text-[var(--lib-fg)] transition-colors hover:border-[color-mix(in_srgb,var(--lib-selection)_40%,var(--lib-border))] hover:bg-[var(--lib-muted)] disabled:opacity-50 sm:w-auto sm:justify-start"
          >
            <Plus className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            Add to collections…
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${addCollectionOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {addCollectionOpen ? (
            <div
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] py-1 shadow-xl sm:right-auto sm:min-w-[14rem]"
              style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${SEL} 18%, transparent)` }}
            >
              {collectionsNotContainingPost.length > 0 ? (
                collectionsNotContainingPost.map((c) => (
                  <button
                    key={c.collection_id}
                    type="button"
                    disabled={collBusy}
                    onClick={() => void addPostToCollection(c.collection_id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-[var(--lib-fg)] hover:bg-[var(--lib-muted)] disabled:opacity-50"
                  >
                    <span className="truncate">{c.title}</span>
                    <span className="shrink-0 tabular-nums text-[10px] text-[var(--lib-fg-muted)]">
                      {c.post_ids.length}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-[11px] text-[var(--lib-fg-muted)]">
                  All existing collections already include this post.
                </p>
              )}

              <div className="my-1 h-px bg-[var(--lib-border)]" />

              <button
                type="button"
                disabled={collBusy}
                onClick={() => setNewCollectionOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--lib-fg)] hover:bg-[var(--lib-muted)] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" style={{ color: SEL }} aria-hidden />
                New collection…
              </button>

              {newCollectionOpen ? (
                <div className="border-t border-[var(--lib-border)] bg-[var(--lib-muted)]/40 p-3">
                  <label className="sr-only" htmlFor="post-batch-new-coll-title">
                    New collection name
                  </label>
                  <input
                    id="post-batch-new-coll-title"
                    value={newCollectionTitle}
                    onChange={(e) => setNewCollectionTitle(e.target.value)}
                    placeholder="Collection name"
                    disabled={collBusy}
                    className="mb-2 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 py-2 text-xs text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)] focus:border-[var(--lib-ring)] focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createCollectionAndAdd();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={collBusy || !newCollectionTitle.trim()}
                    onClick={() => void createCollectionAndAdd()}
                    className="w-full rounded-lg py-2 text-xs font-semibold text-neutral-950 disabled:opacity-40"
                    style={{ backgroundColor: SEL }}
                  >
                    Create &amp; add post
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </SectionBlock>

      {!tagsAndCollectionsOnly ? (
        <div className="mt-6 border-t border-[var(--lib-border)] pt-4">
          <p
            className="mb-2 cursor-help text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)] sm:text-xs"
            title="Placeholder UI for future smart-tagging flows — not connected to Relay APIs."
          >
            Smart tagging (mock)
          </p>
          <InspectSmartTagPanel />
        </div>
      ) : null}
    </div>
  );
}
