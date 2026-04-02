"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { RELAY_API_BASE } from "@/lib/relay-api";
import type {
  Collection,
  FacetsData,
  GalleryItem,
  GalleryPostDetail,
  PostVisibility
} from "@/lib/relay-api";
import { accessChipLabel } from "./GalleryGridTile";

const TIP_VISIBILITY =
  "Where this work appears in your Relay workspace gallery right now (visible / hidden / flagged). This is not the same as Patreon’s public post page.";
const TIP_TIER =
  "Which membership tiers can access this content on Patreon. Separate from workspace visibility in Relay.";
const TIP_TAGS =
  "Labels used for search and filters in Relay. You can add Relay-only tags here without changing Patreon.";
const TIP_COLLECTIONS =
  "Named groups you created in Relay (gallery / designer). Membership is per post, not synced from Patreon.";

const HINT_VISIBILITY =
  "Workspace gallery state in Relay — not Patreon’s public visibility.";
const HINT_TIER = "Patreon tier access — who is allowed to see this post.";
const HINT_TAGS = "Improves search; Relay-only tags are OK.";
const HINT_COLLECTIONS = "Your Relay collections that include this post.";

const VIS_CHIP: Record<
  PostVisibility,
  { label: string; className: string; chipTitle: string }
> = {
  visible: {
    label: "In workspace",
    className: "border-green-700/50 bg-green-900/35 text-[#b8e0c8]",
    chipTitle: "Visible in your Relay workspace gallery"
  },
  hidden: {
    label: "Hidden",
    className: "border-[#5c4f44] bg-[#2a221c] text-[#b8b0a8]",
    chipTitle: "Hidden from the workspace gallery view"
  },
  flagged: {
    label: "Flagged",
    className: "border-amber-700/50 bg-amber-900/30 text-[#f0d9a8]",
    chipTitle: "Flagged for review in your workspace"
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
    <section className="border-b border-[#2a221c] pb-4 pt-3 first:pt-0 last:border-b-0">
      <h3
        className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#8a7f72] sm:text-xs cursor-help"
        title={tooltip}
      >
        {title}
      </h3>
      <p className="mt-1 text-[0.65rem] leading-snug text-[#6b645c] sm:text-xs">{hint}</p>
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
  onTagError: (message: string | null) => void;
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
  onTagError
}: Props) {
  const primary = items[0]!;
  const [newTag, setNewTag] = useState("");
  const [tagBusy, setTagBusy] = useState(false);

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
    <div className="mt-6 border-t border-[#3d342b] pt-4">
      <p
        className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#f0e6d8] sm:text-xs cursor-help"
        title="Metadata for this post: visibility, access, tags, and Relay collections."
      >
        Post details
      </p>
      {postDetailLoading ? (
        <p className="text-xs text-[#6b645c] sm:text-sm">Loading details…</p>
      ) : null}

      <SectionBlock title="Visibility" tooltip={TIP_VISIBILITY} hint={HINT_VISIBILITY}>
        {uniqueVis.map((v) => {
          const cfg = VIS_CHIP[v] ?? {
            label: v,
            className: "border-[#5c4f44] bg-[#2a221c] text-[#c9bfb3]",
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
              className="inline-flex items-center rounded-full border border-[#6b5a3e] bg-[#1a1510] px-2.5 py-1 text-xs text-[#e8d4b0]"
            >
              {t.title}
            </span>
          ))
        ) : (
          <span className="text-xs text-[#6b645c]" title={TIP_TIER}>
            No tier data
          </span>
        )}
      </SectionBlock>

      <SectionBlock title="Tags" tooltip={TIP_TAGS} hint={HINT_TAGS}>
        {tagIds.map((tag) => (
          <span
            key={tag}
            title={`Tag: ${tag}. Used when you search or filter the gallery.`}
            className="group inline-flex items-center gap-1 rounded-full border border-[#5c4f44] bg-[#2a221c] pl-2.5 pr-1 py-1 text-xs text-[#ede5da]"
          >
            <span>{tag}</span>
            <button
              type="button"
              disabled={tagBusy}
              onClick={() => void removeTag(tag)}
              className="rounded px-1.5 text-[#8a7f72] hover:bg-[#3d342b] hover:text-[#f0e6d8] disabled:opacity-40"
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
            className="min-w-0 flex-1 rounded-md border border-[#4a3f36] bg-[#1f1915] px-2 py-1.5 text-sm text-[#ede5da] placeholder:text-[#6b645c] focus:border-[#c45c2d] focus:outline-none"
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
            className="shrink-0 rounded-md border border-[#c45c2d]/70 bg-[#2a221c] px-3 py-1.5 text-sm text-[#e8d4b0] hover:bg-[#322a22] disabled:opacity-40"
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
                title={
                  name
                    ? `Collection “${name}” in Relay`
                    : `Collection id: ${id}`
                }
                className="inline-flex max-w-full items-center rounded-full border border-[#5c4f44] bg-[#241f1a] px-2.5 py-1 text-xs text-[#d8cebf]"
              >
                <span className="truncate">{name ?? id}</span>
              </span>
            );
          })
        ) : (
          <span className="text-xs text-[#6b645c]" title={TIP_COLLECTIONS}>
            Not in any collection
          </span>
        )}
      </SectionBlock>
    </div>
  );
}
